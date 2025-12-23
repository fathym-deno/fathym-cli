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

import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { pascalCase } from "@luca/cases";
import { z } from "zod";
import { DFSFileHandler } from "@fathym/dfs";
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
} from "@fathym/cli";

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
      .describe("Path to .cli.ts (default: ./.cli.ts)"),
    templates: z
      .string()
      .optional()
      .describe("Path to templates/ folder (default: ./templates)"),
    version: z
      .string()
      .optional()
      .describe("Version to embed in the build (default: 0.0.0)"),
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
    return this.Flag("templates") ?? "./templates";
  }

  /**
   * Override path to .cli.ts configuration.
   * When undefined, uses './.cli.ts' in current directory.
   */
  get ConfigOverride(): string | undefined {
    return this.Flag("config");
  }

  /**
   * Version to embed in the build.
   * Defaults to '0.0.0' if --version flag not provided.
   */
  get Version(): string {
    return this.Flag("version") ?? "0.0.0";
  }
}

/**
 * Build command - prepares static CLI artifacts for compilation.
 *
 * Collects templates, command metadata, and scaffolds the embedded
 * CLI runtime. Output is written to `.build/` directory.
 */
export default Command("build", "Prepare static CLI build folder")
  .Args(BuildArgsSchema)
  .Flags(BuildFlagsSchema)
  .Params(BuildParams)
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.ConfigOverride) {
      await dfsCtx.RegisterProjectDFS(ctx.Params.ConfigOverride, "CLI");
    }

    const buildDFS: DFSFileHandler = ctx.Params.ConfigOverride
      ? await dfsCtx.GetDFS("CLI")
      : await dfsCtx.GetExecutionDFS();

    const { configPath, outDir, configDir, templatesDir } =
      await resolveConfigAndOutDir(
        ctx.Params,
        buildDFS,
      );

    return {
      BuildDFS: buildDFS,
      Details: { configPath, outDir, configDir, templatesDir },
      Scaffolder: new TemplateScaffolder(
        await ioc.Resolve<TemplateLocator>(ioc.Symbol("TemplateLocator")),
        buildDFS,
        { cliOutDir: outDir },
      ),
    };
  })
  .Run(
    async ({ Log, Services, Params }): Promise<CommandStatus<BuildResult>> => {
      const { outDir, templatesDir } = Services.Details;
      const { BuildDFS, Scaffolder } = Services;

      const { embeddedTemplatesPath, templateCount } = await collectTemplates(
        templatesDir,
        outDir,
        BuildDFS,
        BuildDFS,
        Log,
      );

      // Import CLI module to get config
      const cliModulePath = await BuildDFS.ResolvePath(".cli.ts");
      const cliModuleUrl = toFileUrl(cliModulePath).href;
      let cliModule = (await import(cliModuleUrl)).default;
      // Build the module if it's a builder
      if (cliModule instanceof CLIModuleBuilder) {
        cliModule = cliModule.Build();
      }
      const config = cliModule.Config ?? {};

      const commandsDir = config.Commands ?? "./commands";

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

      await Scaffolder.Scaffold({
        templateName: "cli-build-static",
        outputDir: outDir,
        context: {
          embeddedTemplatesPath,
          embeddedEntriesPath,
          imports,
          modules,
          Version: Params.Version,
        },
      });

      Log.Info(`🧩 Scaffolder rendered build-static template to ${outDir}`);
      Log.Success(
        `Build complete! Run \`ftm compile\` on .build/main.ts to finalize.`,
      );

      return {
        Code: 0,
        Message: "Build complete",
        Data: {
          outDir,
          version: Params.Version,
          commandCount: Object.keys(commandEntries).length,
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
  configPath: string;
  outDir: string;
  configDir: string;
  templatesDir: string;
}> {
  const configPath = params.ConfigOverride ?? "./.cli.ts";
  const exists = await dfs.GetFileInfo("./.cli.ts");
  if (!exists) {
    throw new Error(`❌ Cannot find .cli.ts at: ${configPath}`);
  }

  const configDir = dfs.Root;

  const outDir = "./.build";

  const templatesDir = params.TemplatesDir ?? "./templates";

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
): Promise<{ embeddedTemplatesPath: string; templateCount: number }> {
  const paths = await fromDFS.LoadAllPaths();
  const templateFiles = paths.filter(
    (p) => p.startsWith(templatesDir) && !p.endsWith("/"),
  );

  const templates: Record<string, string> = {};
  for (const fullPath of templateFiles) {
    const info = await fromDFS.GetFileInfo(fullPath);
    if (!info) continue;
    const rel = fullPath.replace(`${templatesDir}/`, "");
    templates[rel] = await new Response(info.Contents).text();
  }

  const outputPath = join(outDir, "embedded-templates.json");
  const stream = new Response(JSON.stringify(templates, null, 2)).body!;
  await toDFS.WriteFile(outputPath, stream);
  log.Info(`📦 Embedded templates → ${outputPath}`);
  return {
    embeddedTemplatesPath: outputPath,
    templateCount: Object.keys(templates).length,
  };
}

/**
 * Collects metadata about all commands for static embedding.
 *
 * Scans the commands directory for `.ts` files, generates import aliases
 * using PascalCase naming, and builds the command entry registry. Handles
 * both command files and `.group.ts` group files.
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
    (p) => p.startsWith(commandsDir) && p.endsWith(".ts"),
  );

  const imports = [];
  const modules = [];
  const commandEntries: Record<string, CLICommandEntry> = {};

  // Track seen keys to handle same-named command and group
  const seenKeys = new Set<string>();

  for (const path of entries) {
    const rel = path.replace(`${commandsDir}/`, "").replace(/\\/g, "/");
    const isMeta = rel.endsWith(".group.ts");
    const key = isMeta
      ? rel.replace(/\/\.group\.ts$/, "")
      : rel.replace(/\.ts$/, "");
    const group = key.split("/")[0];

    // Use full path to generate unique alias - avoids collisions when
    // commands have the same filename in different directories
    // Replace slashes with dashes before pascalCase to ensure valid JS identifiers
    // Also sanitize brackets from dynamic segments like [projectRef] → ProjectRef
    // e.g., "projects/[projectRef]/build" → "projects-projectRef-build" → "ProjectsProjectRefBuild"
    const sanitized = key
      .replace(/\//g, "-")
      .replace(/\[/g, "")
      .replace(/\]/g, "");
    const baseName = pascalCase(sanitized);
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
  const outputPath = join(outDir, "embedded-command-entries.json");
  const stream = new Response(JSON.stringify(entries, null, 2)).body!;
  await dfs.WriteFile(outputPath, stream);
  log.Info(`📘 Embedded command entries → ${outputPath}`);
  return outputPath;
}
