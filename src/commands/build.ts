import { join, pascalCase, z } from '../../.deps.ts';
import { Command } from '../../fluent/Command.ts';
import { TemplateScaffolder } from '../../.exports.ts';
import { CommandParams } from '../../commands/CommandParams.ts';
import type { TemplateLocator } from '../../templates/TemplateLocator.ts';
import type { DFSFileHandler } from '../../.deps.ts';
import type { CommandLog } from '../../commands/CommandLog.ts';
import type { CLICommandEntry } from '../../types/CLICommandEntry.ts';
import { CLIDFSContextManager } from '../../CLIDFSContextManager.ts';

export const BuildArgsSchema = z.tuple([]);

export const BuildFlagsSchema = z.object({
  config: z
    .string()
    .optional()
    .describe('Path to .cli.json (default: ./.cli.json)'),
  templates: z
    .string()
    .optional()
    .describe('Path to templates/ folder (default: ./templates)'),
});

export class BuildParams extends CommandParams<
  z.infer<typeof BuildArgsSchema>,
  z.infer<typeof BuildFlagsSchema>
> {
  get TemplatesDir(): string {
    return this.Flag('templates') ?? './templates';
  }

  get ConfigOverride(): string | undefined {
    return this.Flag('config');
  }
}

export default Command('build', 'Prepare static CLI build folder')
  .Args(BuildArgsSchema)
  .Flags(BuildFlagsSchema)
  .Params(BuildParams)
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.ConfigOverride) {
      await dfsCtx.RegisterProjectDFS(ctx.Params.ConfigOverride, 'CLI');
    }

    const buildDFS: DFSFileHandler = ctx.Params.ConfigOverride
      ? await dfsCtx.GetDFS('CLI')
      : await dfsCtx.GetExecutionDFS();

    const { configPath, outDir, configDir, templatesDir } = await resolveConfigAndOutDir(
      ctx.Params,
      buildDFS,
    );

    return {
      BuildDFS: buildDFS,
      Details: { configPath, outDir, configDir, templatesDir },
      Scaffolder: new TemplateScaffolder(
        await ioc.Resolve<TemplateLocator>(ioc.Symbol('TemplateLocator')),
        buildDFS,
        { cliOutDir: outDir },
      ),
    };
  })
  .Run(async ({ Log, Services }) => {
    const { configPath, outDir, templatesDir } = Services.Details;
    const { BuildDFS, Scaffolder } = Services;

    const embeddedTemplatesPath = await collectTemplates(
      templatesDir,
      outDir,
      BuildDFS,
      BuildDFS,
      Log,
    );

    const configInfo = await BuildDFS.GetFileInfo('.cli.json');
    if (!configInfo) throw new Error(`❌ Could not read ${configPath}`);
    const configText = await new Response(configInfo.Contents).text();
    const config = JSON.parse(configText);

    const commandsDir = config.Commands ?? './commands';

    const { imports, modules, commandEntries } = await collectCommandMetadata(
      commandsDir,
      BuildDFS,
    );

    const embeddedEntriesPath = await writeCommandEntries(
      commandEntries,
      outDir,
      BuildDFS,
      Log,
    );

    const hasInit = await BuildDFS.GetFileInfo('.cli.init.ts');
    const importInit = hasInit ? '../.cli.init.ts' : undefined;

    await Scaffolder.Scaffold({
      templateName: 'cli-build-static',
      outputDir: outDir,
      context: {
        embeddedTemplatesPath,
        embeddedEntriesPath,
        imports,
        modules,
        importInitFn: importInit,
      },
    });

    Log.Info(`🧩 Scaffolder rendered build-static template to ${outDir}`);
    Log.Success(
      `Build complete! Run \`ftm compile\` on .build/cli.ts to finalize.`,
    );
  });

async function resolveConfigAndOutDir(
  params: BuildParams,
  dfs: DFSFileHandler,
): Promise<{
  configPath: string;
  outDir: string;
  configDir: string;
  templatesDir: string;
}> {
  const configPath = params.ConfigOverride ?? './.cli.json';
  const exists = await dfs.GetFileInfo('./.cli.json');
  if (!exists) {
    throw new Error(`❌ Cannot find .cli.json at: ${configPath}`);
  }

  const configDir = dfs.Root;

  const outDir = './.build';

  const templatesDir = params.TemplatesDir ?? './templates';

  return { configPath, outDir, configDir, templatesDir };
}

async function collectTemplates(
  templatesDir: string,
  outDir: string,
  fromDFS: DFSFileHandler,
  toDFS: DFSFileHandler,
  log: CommandLog,
): Promise<string> {
  const paths = await fromDFS.LoadAllPaths();
  const templateFiles = paths.filter(
    (p) => p.startsWith(templatesDir) && !p.endsWith('/'),
  );

  const templates: Record<string, string> = {};
  for (const fullPath of templateFiles) {
    const info = await fromDFS.GetFileInfo(fullPath);
    if (!info) continue;
    const rel = fullPath.replace(`${templatesDir}/`, '');
    templates[rel] = await new Response(info.Contents).text();
  }

  const outputPath = join(outDir, 'embedded-templates.json');
  const stream = new Response(JSON.stringify(templates, null, 2)).body!;
  await toDFS.WriteFile(outputPath, stream);
  log.Info(`📦 Embedded templates → ${outputPath}`);
  return outputPath;
}

async function collectCommandMetadata(
  commandsDir: string,
  dfs: DFSFileHandler,
): Promise<{
  imports: { alias: string; path: string }[];
  modules: { key: string; alias: string }[];
  commandEntries: Record<string, CLICommandEntry>;
}> {
  const paths = await dfs.LoadAllPaths();
  const entries = paths.filter(
    (p) => p.startsWith(commandsDir) && p.endsWith('.ts'),
  );

  const imports = [];
  const modules = [];
  const commandEntries: Record<string, CLICommandEntry> = {};

  for (const path of entries) {
    const rel = path.replace(`${commandsDir}/`, '').replace(/\\/g, '/');
    const isMeta = rel.endsWith('.metadata.ts');
    const key = isMeta ? rel.replace(/\/\.metadata\.ts$/, '') : rel.replace(/\.ts$/, '');
    const group = key.split('/')[0];
    const alias = `${pascalCase(key.split('/').pop()!)}Command`;

    const entryData = commandEntries[key] ?? {
      CommandPath: undefined,
      GroupPath: undefined,
      ParentGroup: group !== key ? group : undefined,
    };

    if (isMeta) {
      entryData.GroupPath = await dfs.ResolvePath(path);
    } else {
      entryData.CommandPath = await dfs.ResolvePath(path);
      imports.push({ alias, path: `../commands/${rel}` });
      modules.push({ key, alias });
    }

    commandEntries[key] = entryData;
  }

  return { imports, modules, commandEntries };
}

async function writeCommandEntries(
  entries: Record<string, unknown>,
  outDir: string,
  dfs: DFSFileHandler,
  log: CommandLog,
): Promise<string> {
  const outputPath = join(outDir, 'embedded-command-entries.json');
  const stream = new Response(JSON.stringify(entries, null, 2)).body!;
  await dfs.WriteFile(outputPath, stream);
  log.Info(`📘 Embedded command entries → ${outputPath}`);
  return outputPath;
}
