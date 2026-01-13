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
 * │  3. Import .cli.ts module for configuration                        │
 * │  4. Collect command metadata from commands/ directory              │
 * │  5. Write embedded-templates.json and embedded-command-entries.json│
 * │  6. Scaffold cli-build-static template with embedded artifacts     │
 * │  7. Output static entry point to .build/main.ts                    │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Generated Artifacts (.build/)
 *
 * ```
 * .build/
 * ├── main.ts                       # Static CLI entry point (production)
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
 * ftm build --config=./my-cli/.cli.ts
 * ```
 *
 * @example Build with custom templates directory
 * ```bash
 * ftm build --templates=./src/templates
 * ```
 *
 * @module
 */

import { dirname } from '@std/path/dirname';
import { join } from '@std/path/join';
import { toFileUrl } from '@std/path/to-file-url';
import { pascalCase } from '@luca/cases';
import { z } from 'zod';
import { DFSFileHandler } from '@fathym/dfs';
import {
  CLICommandEntry,
  CLIDFSContextManager,
  CLIModuleBuilder,
  Command,
  CommandLog,
  CommandParams,
  type CommandStatus,
  TemplateLocator,
  TemplateScaffolder,
} from '@fathym/cli';
import type { EmbeddedDFSEntry } from '@fathym/dfs/handlers';

/**
 * Result data for the build command.
 */
export interface BuildResult {
  /** The output directory */
  outDir: string;
  /** The version embedded in the build */
  version: string;
  /** Number of commands collected */
  commandCount: number;
  /** Number of templates embedded */
  templateCount: number;
}

/**
 * Zod schema for build command positional arguments.
 * The build command takes no positional arguments.
 */
export const BuildArgsSchema = z.tuple([]);

/**
 * Zod schema for build command flags.
 *
 * @property config - Path to .cli.ts configuration file
 * @property templates - Path to templates directory for embedding
 */
export const BuildFlagsSchema = z
  .object({
    config: z
      .string()
      .optional()
      .describe('Path to .cli.ts (default: ./.cli.ts)'),
    templates: z
      .string()
      .optional()
      .describe('Path to templates/ folder (default: ./templates)'),
    version: z
      .string()
      .optional()
      .describe('Version to embed in the build (default: 0.0.0)'),
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
   * Override path to .cli.ts configuration.
   * When undefined, uses './.cli.ts' in current directory.
   */
  get ConfigOverride(): string | undefined {
    return this.Flag('config');
  }

  /**
   * Version to embed in the build.
   * Defaults to '0.0.0' if --version flag not provided.
   */
  get Version(): string {
    return this.Flag('version') ?? '0.0.0';
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

    const { outDir, templatesDir } = await resolveConfigAndOutDir(
      ctx.Params,
      buildDFS,
    );

    // Import CLI module to get config early (for command source registration)
    const cliModulePath = await buildDFS.ResolvePath('.cli.ts');
    const cliModuleUrl = toFileUrl(cliModulePath).href;
    let cliModule = (await import(cliModuleUrl)).default;
    if (cliModule instanceof CLIModuleBuilder) {
      cliModule = cliModule.Build();
    }
    const config = cliModule.Config ?? {};

    // Register command source DFSs from config (defaults to ./commands)
    // Use the directory containing the CLI config as the origin for resolving relative paths
    const cliDir = dirname(cliModulePath);
    const commandSources = config.Commands ?? [{ Handler: { FileRoot: './commands' } }];
    dfsCtx.RegisterCommandSourceDFSs(commandSources, cliDir);

    return {
      BuildDFS: buildDFS,
      DFSContext: dfsCtx,
      CLIConfig: config,
      Details: { outDir, templatesDir, cliModulePath },
      Scaffolder: new TemplateScaffolder(
        await ioc.Resolve<TemplateLocator>(ioc.Symbol('TemplateLocator')),
        buildDFS,
        { cliOutDir: outDir },
      ),
    };
  })
  .Run(
    async ({ Log, Services, Params }): Promise<CommandStatus<BuildResult>> => {
      const { outDir, templatesDir } = Services.Details;
      const { BuildDFS, DFSContext, Scaffolder } = Services;

      // Collect templates and generate embedded templates DFS
      const { embeddedTemplatesPath, templateCount, templatesDFSEntries } = await collectTemplates(
        templatesDir,
        outDir,
        BuildDFS,
        BuildDFS,
        Log,
      );

      // Write embedded templates DFS JSON
      const embeddedTemplatesDFSPath = join(outDir, 'embedded-templates-dfs.json');
      await BuildDFS.WriteFile(
        embeddedTemplatesDFSPath,
        JSON.stringify(
          {
            Root: templatesDir,
            Entries: templatesDFSEntries,
          },
          null,
          2,
        ),
      );
      Log.Info(`📦 Embedded templates DFS → ${embeddedTemplatesDFSPath}`);

      // Collect command metadata from all registered command sources
      const commandSourceDFSs = await DFSContext.GetCommandSourceDFSs();
      const allImports: { alias: string; path: string }[] = [];
      const allModules: { key: string; alias: string }[] = [];
      const allCommandEntries: Record<string, CLICommandEntry> = {};
      const embeddedCommandSources: { fileRoot: string; jsonPath: string }[] = [];

      for (let i = 0; i < commandSourceDFSs.length; i++) {
        const { DFS, CommandRoot } = commandSourceDFSs[i];
        const sourcePrefix = CommandRoot ? `${CommandRoot}/` : '';

        // Collect metadata from this command source
        const { imports, modules, commandEntries, dfsEntries } = await collectCommandSourceMetadata(
          DFS,
          sourcePrefix,
          i,
        );

        // Merge into all
        allImports.push(...imports);
        allModules.push(...modules);
        Object.assign(allCommandEntries, commandEntries);

        // Write embedded DFS JSON for this source (for local sources with entries)
        if (Object.keys(dfsEntries).length > 0) {
          const embeddedDFSPath = join(outDir, `embedded-commands-dfs-${i}.json`);
          await BuildDFS.WriteFile(
            embeddedDFSPath,
            JSON.stringify(
              {
                Root: DFS.Root,
                Entries: dfsEntries,
              },
              null,
              2,
            ),
          );
          Log.Info(`📘 Embedded commands DFS ${i} → ${embeddedDFSPath}`);
          embeddedCommandSources.push({ fileRoot: DFS.Root, jsonPath: embeddedDFSPath });
        }
      }

      // Write the combined command entries JSON (for LoadCommandModule lookup)
      const embeddedEntriesPath = await writeCommandEntries(
        allCommandEntries,
        outDir,
        BuildDFS,
        Log,
      );

      await Scaffolder.Scaffold({
        templateName: 'cli-build-static',
        outputDir: outDir,
        context: {
          embeddedTemplatesPath,
          embeddedEntriesPath,
          embeddedTemplatesDFSPath,
          embeddedCommandSources,
          imports: allImports,
          modules: allModules,
          Version: Params.Version,
        },
      });

      Log.Info(`🧩 Scaffolder rendered build-static template to ${outDir}`);
      Log.Success(
        `Build complete! Run \`ftm compile\` on .build/main.ts to finalize.`,
      );

      return {
        Code: 0,
        Message: 'Build complete',
        Data: {
          outDir,
          version: Params.Version,
          commandCount: Object.keys(allCommandEntries).length,
          templateCount,
        },
      };
    },
  );

/**
 * Resolves configuration paths and output directories for the build.
 *
 * Validates that .cli.ts exists and computes paths for config,
 * output directory, and templates directory.
 *
 * @param params - Build command parameters
 * @param dfs - DFS handler for file operations
 * @returns Object with resolved paths
 * @throws Error if .cli.ts cannot be found
 */
async function resolveConfigAndOutDir(
  params: BuildParams,
  dfs: DFSFileHandler,
): Promise<{
  outDir: string;
  templatesDir: string;
}> {
  const configPath = params.ConfigOverride ?? './.cli.ts';
  const exists = await dfs.GetFileInfo('./.cli.ts');
  if (!exists) {
    throw new Error(`❌ Cannot find .cli.ts at: ${configPath}`);
  }

  const outDir = './.build';
  const templatesDir = params.TemplatesDir ?? './templates';

  return { outDir, templatesDir };
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
): Promise<{
  embeddedTemplatesPath: string;
  templateCount: number;
  templatesDFSEntries: Record<string, EmbeddedDFSEntry>;
}> {
  const paths = await fromDFS.LoadAllPaths();
  const templateFiles = paths.filter(
    (p) => p.startsWith(templatesDir) && !p.endsWith('/'),
  );

  const templates: Record<string, string> = {};
  const templatesDFSEntries: Record<string, EmbeddedDFSEntry> = {};

  for (const fullPath of templateFiles) {
    const info = await fromDFS.GetFileInfo(fullPath);
    if (!info) continue;
    const rel = fullPath.replace(`${templatesDir}/`, '');
    const content = await new Response(info.Contents).text();
    templates[rel] = content;

    // Build DFS entry with content for templates
    templatesDFSEntries[rel] = {
      AbsolutePath: fromDFS.ResolvePath(fullPath),
      Content: content,
    };
  }

  const outputPath = join(outDir, 'embedded-templates.json');
  await toDFS.WriteFile(outputPath, JSON.stringify(templates, null, 2));
  log.Info(`📦 Embedded templates → ${outputPath}`);

  return {
    embeddedTemplatesPath: outputPath,
    templateCount: Object.keys(templates).length,
    templatesDFSEntries,
  };
}

/**
 * Collects metadata from a single command source DFS.
 *
 * Scans the DFS for `.ts` files, generates import aliases using PascalCase
 * naming, and builds the command entry registry. Also builds DFS entries
 * for embedded DFS file handler.
 *
 * @param dfs - DFS handler for the command source
 * @param sourcePrefix - Optional prefix for command keys (e.g., "shared/")
 * @param sourceIndex - Index of this source (for unique alias prefixes)
 * @returns Object containing imports, modules, command entries, and DFS entries
 */
async function collectCommandSourceMetadata(
  dfs: DFSFileHandler,
  sourcePrefix: string,
  sourceIndex: number,
): Promise<{
  imports: { alias: string; path: string }[];
  modules: { key: string; alias: string }[];
  commandEntries: Record<string, CLICommandEntry>;
  dfsEntries: Record<string, EmbeddedDFSEntry>;
}> {
  const paths = await dfs.LoadAllPaths();
  const tsFiles = paths.filter((p) => p.endsWith('.ts'));

  const imports: { alias: string; path: string }[] = [];
  const modules: { key: string; alias: string }[] = [];
  const commandEntries: Record<string, CLICommandEntry> = {};
  const dfsEntries: Record<string, EmbeddedDFSEntry> = {};

  for (const relPath of tsFiles) {
    // Normalize path (remove leading ./)
    const normalized = relPath.replace(/^\.\//, '').replace(/\\/g, '/');
    const isMeta = normalized.endsWith('.group.ts');

    // Build command key with source prefix
    const baseKey = isMeta
      ? normalized.replace(/\/\.group\.ts$/, '')
      : normalized.replace(/\.ts$/, '');
    const key = `${sourcePrefix}${baseKey}`;
    const group = key.split('/')[0];

    // Generate unique alias with source index prefix
    const sanitized = key
      .replace(/\//g, '-')
      .replace(/\[/g, '')
      .replace(/\]/g, '');
    const baseName = pascalCase(sanitized);
    const alias = isMeta ? `S${sourceIndex}${baseName}Group` : `S${sourceIndex}${baseName}Command`;

    // Module key for EmbeddedCommandModules lookup
    const moduleKey = isMeta ? `${key}:group` : key;

    // Get absolute path for this file
    const absolutePath = dfs.ResolvePath(relPath);

    // Build command entry
    const entryData = commandEntries[key] ?? {
      CommandPath: undefined,
      GroupPath: undefined,
      ParentGroup: group !== key ? group : undefined,
    };

    // Calculate import path (relative from .build/ to the source)
    // DFS.Root is the absolute root of the command source
    const normalizedRoot = dfs.Root.replace(/\\/g, '/').replace(/\/$/, '');
    const importPath = `${normalizedRoot}/${normalized}`;

    if (isMeta) {
      entryData.GroupPath = absolutePath;
      imports.push({ alias, path: importPath });
      modules.push({ key: moduleKey, alias });
    } else {
      entryData.CommandPath = absolutePath;
      imports.push({ alias, path: importPath });
      modules.push({ key: moduleKey, alias });
    }

    commandEntries[key] = entryData;

    // Build DFS entry (commands don't need content, just path mapping)
    dfsEntries[normalized] = {
      AbsolutePath: absolutePath,
    };
  }

  return { imports, modules, commandEntries, dfsEntries };
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
