/**
 * Build command - prepares a static CLI build for compilation.
 *
 * The build command collects all commands and templates from a CLI project,
 * embeds them into JSON files, and scaffolds the static runtime entry point.
 * This is the prerequisite step before `ftm compile` generates the native binary.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Resolve DFS context (execution dir or --config path)           │
 * │  2. Collect all templates from templates/ into JSON                │
 * │  3. Read .cli.json configuration                                   │
 * │  4. Collect command metadata from commands/ directory              │
 * │  5. Write embedded-templates.json and embedded-command-entries.json│
 * │  6. Scaffold cli-build-static template with embedded artifacts     │
 * │  7. Output static entry point to .build/cli.ts                     │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Generated Artifacts (.build/)
 *
 * ```
 * .build/
 * ├── cli.ts                        # Static CLI entry point
 * ├── EmbeddedCommandModules.ts     # Command module registry
 * ├── EmbeddedCLIFileSystemHooks.ts # Filesystem abstraction for embedded CLI
 * ├── embedded-templates.json       # All templates as JSON
 * └── embedded-command-entries.json # Command metadata registry
 * ```
 *
 * ## How Embedding Works
 *
 * - **Templates**: All `.hbs` files in `templates/` are read and stored
 *   as key-value pairs in `embedded-templates.json`
 * - **Commands**: Each `.ts` file in `commands/` is registered with its
 *   path and alias for static imports in `EmbeddedCommandModules.ts`
 * - **Init Hook**: If `.cli.init.ts` exists, it's wired into the embedded
 *   filesystem hooks for IoC initialization
 *
 * @example Build CLI in current directory
 * ```bash
 * ftm build
 * ```
 *
 * @example Build CLI with custom config path
 * ```bash
 * ftm build --config=./my-cli/.cli.json
 * ```
 *
 * @example Build with custom templates directory
 * ```bash
 * ftm build --templates=./src/templates
 * ```
 *
 * @module
 */

import { join } from '@std/path/join';
import { pascalCase } from '@luca/cases';
import { z } from 'zod';
import { DFSFileHandler } from '@fathym/dfs';
import {
  CLICommandEntry,
  CLIDFSContextManager,
  Command,
  CommandLog,
  CommandParams,
  TemplateLocator,
  TemplateScaffolder,
} from '@fathym/cli';

/**
 * Zod schema for build command positional arguments.
 * The build command takes no positional arguments.
 */
export const BuildArgsSchema = z.tuple([]);

/**
 * Zod schema for build command flags.
 *
 * @property config - Path to .cli.json configuration file
 * @property templates - Path to templates directory for embedding
 */
export const BuildFlagsSchema = z
  .object({
    config: z
      .string()
      .optional()
      .describe('Path to .cli.json (default: ./.cli.json)'),
    templates: z
      .string()
      .optional()
      .describe('Path to templates/ folder (default: ./templates)'),
  })
  .passthrough();

/**
 * Typed parameter accessor for the build command.
 *
 * Provides strongly-typed getters for the templates directory and
 * optional config file override. Exported for use in compile command
 * which invokes build as a sub-command.
 *
 * @example
 * ```typescript
 * const templatesDir = Params.TemplatesDir;  // './templates' or custom
 * const configPath = Params.ConfigOverride;  // undefined or custom path
 * ```
 */
export class BuildParams extends CommandParams<
  z.infer<typeof BuildArgsSchema>,
  z.infer<typeof BuildFlagsSchema>
> {
  /**
   * Path to templates directory for embedding.
   * Defaults to './templates' if --templates flag not provided.
   */
  get TemplatesDir(): string {
    return this.Flag('templates') ?? './templates';
  }

  /**
   * Override path to .cli.json configuration.
   * When undefined, uses './.cli.json' in current directory.
   */
  get ConfigOverride(): string | undefined {
    return this.Flag('config');
  }
}

/**
 * Build command - prepares static CLI artifacts for compilation.
 *
 * Collects templates, command metadata, and scaffolds the embedded
 * CLI runtime. Output is written to `.build/` directory.
 */
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

/**
 * Resolves configuration paths and output directories for the build.
 *
 * Validates that .cli.json exists and computes paths for config,
 * output directory, and templates directory.
 *
 * @param params - Build command parameters
 * @param dfs - DFS handler for file operations
 * @returns Object with resolved paths
 * @throws Error if .cli.json cannot be found
 */
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

/**
 * Collects all template files and embeds them into a JSON file.
 *
 * Reads all files from the templates directory, stores their contents
 * as key-value pairs (relative path → content), and writes to
 * `embedded-templates.json` in the output directory.
 *
 * @param templatesDir - Source directory containing templates
 * @param outDir - Output directory for embedded JSON
 * @param fromDFS - DFS handler to read templates from
 * @param toDFS - DFS handler to write embedded JSON to
 * @param log - Command logger for progress output
 * @returns Path to the generated embedded-templates.json
 */
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

/**
 * Collects metadata about all commands for static embedding.
 *
 * Scans the commands directory for `.ts` files, generates import aliases
 * using PascalCase naming, and builds the command entry registry. Handles
 * both command files and `.metadata.ts` group files.
 *
 * @param commandsDir - Directory containing command modules
 * @param dfs - DFS handler for file operations
 * @returns Object containing imports, modules, and command entries
 *
 * @example Generated imports array
 * ```typescript
 * [
 *   { alias: 'HelloCommand', path: '../commands/hello.ts' },
 *   { alias: 'WaveCommand', path: '../commands/wave.ts' }
 * ]
 * ```
 */
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

  // Track seen keys to handle same-named command and group
  const seenKeys = new Set<string>();

  for (const path of entries) {
    const rel = path.replace(`${commandsDir}/`, '').replace(/\\/g, '/');
    const isMeta = rel.endsWith('.metadata.ts');
    const key = isMeta ? rel.replace(/\/\.metadata\.ts$/, '') : rel.replace(/\.ts$/, '');
    const group = key.split('/')[0];

    // Use different suffixes for commands vs groups to avoid duplicate identifiers
    // when a key has both a command file and a group metadata file
    const baseName = pascalCase(key.split('/').pop()!);
    const alias = isMeta ? `${baseName}Group` : `${baseName}Command`;

    // Use different module keys for command vs group when both exist
    const moduleKey = isMeta ? `${key}:group` : key;

    const entryData = commandEntries[key] ?? {
      CommandPath: undefined,
      GroupPath: undefined,
      ParentGroup: group !== key ? group : undefined,
    };

    if (isMeta) {
      entryData.GroupPath = await dfs.ResolvePath(path);
      imports.push({ alias, path: `../commands/${rel}` });
      modules.push({ key: moduleKey, alias });
    } else {
      entryData.CommandPath = await dfs.ResolvePath(path);
      imports.push({ alias, path: `../commands/${rel}` });
      modules.push({ key: moduleKey, alias });
    }

    commandEntries[key] = entryData;
    seenKeys.add(key);
  }

  return { imports, modules, commandEntries };
}

/**
 * Writes command entries registry to JSON file.
 *
 * Serializes the command entry metadata and writes it to
 * `embedded-command-entries.json` in the output directory.
 *
 * @param entries - Command entries registry
 * @param outDir - Output directory
 * @param dfs - DFS handler for file operations
 * @param log - Command logger for progress output
 * @returns Path to the generated embedded-command-entries.json
 */
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
