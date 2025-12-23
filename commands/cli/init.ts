/**
 * Initialize a new CLI project from templates.
 *
 * The init command scaffolds a complete CLI project structure including
 * configuration files, sample commands, intent tests, and development tooling.
 * It uses the Handlebars-based template system to generate project files.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  1. Parse args/flags via Zod schemas                           │
 * │  2. Resolve target DFS (execution dir or --targetDir)          │
 * │  3. Initialize TemplateScaffolder with template locator        │
 * │  4. Scaffold project from selected template (default: 'init')  │
 * │  5. Log success with output path                               │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Generated Structure (using 'init' template)
 *
 * ```
 * <project-name>/
 * ├── .cli.ts             # CLI configuration (fluent API)
 * ├── deno.jsonc          # Deno configuration and tasks
 * ├── .gitignore          # Standard ignores (.build/, .dist/, etc.)
 * ├── .vscode/
 * │   └── settings.json   # IDE configuration for Deno
 * ├── commands/
 * │   ├── hello.ts        # Sample fluent API command
 * │   └── wave.ts         # Sample class-based command
 * └── intents/
 *     ├── .intents.ts     # Intent test index
 *     ├── hello.intents.ts
 *     └── wave.intents.ts
 * ```
 *
 * @example Basic initialization - create a new CLI project
 * ```bash
 * ftm init my-cli
 * ```
 *
 * @example Initialize in current directory
 * ```bash
 * ftm init .
 * ```
 *
 * @example Use a specific template
 * ```bash
 * ftm init my-cli --template=minimal
 * ```
 *
 * @example Scaffold to a custom target directory
 * ```bash
 * ftm init my-cli --targetDir=./projects
 * ```
 *
 * @module
 */

import { z } from "zod";
import {
  CLIDFSContextManager,
  Command,
  CommandParams,
  type CommandStatus,
  TemplateLocator,
  TemplateScaffolder,
} from "@fathym/cli";
import { join } from "@std/path";

/**
 * Result data for the init command.
 */
export interface InitResult {
  /** The project name/path */
  projectName: string;
  /** The template used */
  template: string;
  /** The full path to the initialized project */
  projectPath: string;
}

/**
 * Zod schema for init command positional arguments.
 *
 * @property [0] - Optional project name. Defaults to '.' (current directory)
 *                 when omitted or explicitly set to '.'.
 */
export const InitArgsSchema = z.tuple([
  z.string().optional().describe("Project name").meta({ argName: "name" }),
]);

/**
 * Zod schema for init command flags.
 *
 * @property template - Template name to use for scaffolding (default: 'init')
 * @property baseTemplatesDir - Override the root templates directory
 * @property targetDir - Target directory for scaffolding (relative to cwd)
 */
export const InitFlagsSchema = z
  .object({
    template: z.string().optional().describe("Template to use (e.g. init)"),

    baseTemplatesDir: z
      .string()
      .optional()
      .describe("Root directory for templates (default injected by CLI)"),

    targetDir: z
      .string()
      .optional()
      .describe("Where to scaffold the project (relative to execution DFS)"),
  })
  .passthrough();

/**
 * Typed parameter accessor for the init command.
 *
 * Extends CommandParams to provide strongly-typed getters for accessing
 * parsed arguments and flags. The protected `Arg()` and `Flag()` methods
 * are only accessible within this class.
 *
 * @example Accessing params in the Run handler
 * ```typescript
 * .Run(async ({ Params }) => {
 *   const projectName = Params.Name;      // string
 *   const template = Params.Template;      // string (default: 'init')
 *   const targetDir = Params.TargetDir;    // string | undefined
 * });
 * ```
 */
class InitParams extends CommandParams<
  z.infer<typeof InitArgsSchema>,
  z.infer<typeof InitFlagsSchema>
> {
  /**
   * Project name from first positional argument.
   * Returns '.' if argument is omitted or explicitly '.'.
   */
  get Name(): string {
    const arg = this.Arg(0);
    return !arg || arg === "." ? "." : arg;
  }

  /**
   * Template name to use for scaffolding.
   * Defaults to 'init' if --template flag is not provided.
   */
  get Template(): string {
    return this.Flag("template") ?? "init";
  }

  /**
   * Override for the base templates directory.
   * When undefined, uses the CLI's default template location.
   */
  get BaseTemplatesDir(): string | undefined {
    return this.Flag("baseTemplatesDir");
  }

  /**
   * Target directory for scaffolding output.
   * When specified, scaffolds relative to this path instead of cwd.
   */
  get TargetDir(): string | undefined {
    return this.Flag("targetDir");
  }
}

/**
 * Init command - scaffolds a new CLI project from templates.
 *
 * Uses the fluent Command API to define arguments, flags, services,
 * and the run handler. Services are injected via IoC container.
 */
export default Command("init", "Initialize a new CLI project")
  .Args(InitArgsSchema)
  .Flags(InitFlagsSchema)
  .Params(InitParams)
  .Services(async (ctx, ioc) => {
    const dfsCtxMgr = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.TargetDir) {
      const targetPath = join(Deno.cwd(), ctx.Params.TargetDir);
      dfsCtxMgr.RegisterCustomDFS("Target", { FileRoot: targetPath });
    }

    const buildDFS = ctx.Params.TargetDir
      ? await dfsCtxMgr.GetDFS("Target")
      : await dfsCtxMgr.GetExecutionDFS();

    return {
      BuildDFS: buildDFS,
      Scaffolder: new TemplateScaffolder(
        await ioc.Resolve<TemplateLocator>(ioc.Symbol("TemplateLocator")),
        buildDFS,
        { name: ctx.Params.Name },
      ),
    };
  })
  .Run(
    async ({ Params, Log, Services }): Promise<CommandStatus<InitResult>> => {
      const { Name, Template } = Params;

      await Services.Scaffolder.Scaffold({
        templateName: Template,
        outputDir: Name,
      });

      const fullPath = await Services.BuildDFS.ResolvePath(Name);

      Log.Success(`Project created from "${Template}" template.`);
      Log.Info(`📂 Initialized at: ${fullPath}`);

      return {
        Code: 0,
        Message: `Project initialized from "${Template}" template`,
        Data: { projectName: Name, template: Template, projectPath: fullPath },
      };
    },
  );
