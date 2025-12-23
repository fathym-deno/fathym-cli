/**
 * Compile command - generates a native binary from the CLI build.
 *
 * The compile command takes the static build output from `ftm build` and
 * uses `deno compile` to create a standalone native executable. It
 * automatically invokes the build command first to ensure artifacts are current.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Register project DFS using entry point path                    │
 * │  2. Resolve entry point, output directory, and permissions         │
 * │  3. Import .cli.ts module to get binary name from Tokens[0]        │
 * │  4. Invoke Build sub-command to prepare static artifacts           │
 * │  5. Execute `deno compile` with permissions and output path        │
 * │  6. Output binary to .dist/<target>/<token-name> or .dist/<token>  │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Output Structure
 *
 * When `--target` is specified or `--all` is used:
 * ```
 * .dist/
 * └── exe/
 *     └── x86_64-pc-windows-msvc/
 *         └── my-cli.exe
 * ```
 *
 * When no target (current OS):
 * ```
 * .dist/
 * └── exe/
 *     └── my-cli           # or my-cli.exe on Windows
 * ```
 *
 * ## Cross-Compilation Targets
 *
 * Supported targets (Deno compile targets):
 * - `x86_64-pc-windows-msvc` - Windows x64
 * - `x86_64-apple-darwin` - macOS x64 (Intel)
 * - `aarch64-apple-darwin` - macOS ARM64 (Apple Silicon)
 * - `x86_64-unknown-linux-gnu` - Linux x64
 * - `aarch64-unknown-linux-gnu` - Linux ARM64
 *
 * ## Deno Permissions
 *
 * By default, the compiled binary has full permissions:
 * - `--allow-read` - File system read access
 * - `--allow-env` - Environment variable access
 * - `--allow-net` - Network access
 * - `--allow-write` - File system write access
 * - `--allow-run` - Subprocess execution
 *
 * Override with `--permissions` flag for restricted binaries.
 *
 * ## Sub-Command Pattern
 *
 * This command demonstrates the `.Commands()` pattern for invoking
 * other commands programmatically:
 *
 * ```typescript
 * .Commands({
 *   Build: BuildCommand.Build(),
 * })
 * .Run(async ({ Commands }) => {
 *   await Commands.Build([], { config: '...' });
 * })
 * ```
 *
 * @example Compile CLI in current directory
 * ```bash
 * ftm cli compile
 * ```
 *
 * @example Compile with custom entry point
 * ```bash
 * ftm cli compile --entry=./my-cli/.build/main.ts
 * ```
 *
 * @example Cross-compile for Windows
 * ```bash
 * ftm cli compile --target=x86_64-pc-windows-msvc
 * ```
 *
 * @example Cross-compile for macOS ARM64
 * ```bash
 * ftm cli compile --target=aarch64-apple-darwin
 * ```
 *
 * @example Compile with restricted permissions
 * ```bash
 * ftm cli compile --permissions="--allow-read --allow-env"
 * ```
 *
 * @example Compile to custom output directory
 * ```bash
 * ftm cli compile --output=./bin
 * ```
 *
 * @module
 */

import { dirname } from "@std/path/dirname";
import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { z } from "zod";
import {
  CLIDFSContextManager,
  CLIModuleBuilder,
  Command,
  CommandParams,
  type CommandStatus,
  runCommandWithLogs,
} from "@fathym/cli";
import BuildCommand from "./build.ts";
import { getBinaryExtension } from "../../src/config/FathymCLIConfig.ts";

/**
 * Result data for the compile command.
 */
export interface CompileResult {
  /** List of compiled binaries */
  binaries: { target: string; path: string }[];
  /** The version embedded */
  version: string;
}

/**
 * Zod schema for compile command positional arguments.
 * The compile command takes no positional arguments.
 */
export const CompileArgsSchema = z.tuple([]);

/**
 * All supported cross-compilation targets.
 */
export const COMPILE_TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
] as const;

/**
 * Zod schema for compile command flags.
 *
 * @property entry - Entry point file (output of build command)
 * @property config - Path to .cli.ts configuration
 * @property output - Output directory for compiled binary
 * @property permissions - Space-separated Deno permission flags
 * @property target - Cross-compilation target (Deno compile target triple)
 * @property all - Compile for all supported targets
 */
export const CompileFlagsSchema = z
  .object({
    entry: z
      .string()
      .optional()
      .describe("Entry point file (default: ./.build/main.ts)"),
    config: z
      .string()
      .optional()
      .describe("Path to .cli.ts (default: alongside entry)"),
    output: z.string().optional().describe(
      "Output folder (default: ./.dist/exe)",
    ),
    permissions: z
      .string()
      .optional()
      .describe("Deno permissions (default: full access)"),
    target: z
      .string()
      .optional()
      .describe("Cross-compilation target (e.g., x86_64-pc-windows-msvc)"),
    all: z
      .boolean()
      .optional()
      .describe("Compile for all supported targets"),
    version: z
      .string()
      .optional()
      .describe("Version to embed in the compiled binary (default: 0.0.0)"),
  })
  .passthrough();

/**
 * Typed parameter accessor for the compile command.
 *
 * Provides strongly-typed getters for entry point, output directory,
 * Deno permissions, and cross-compilation target. The Permissions getter
 * parses the space-separated string flag into an array of permission flags.
 *
 * @example
 * ```typescript
 * const entry = Params.Entry;           // './.build/main.ts' or custom
 * const perms = Params.Permissions;     // ['--allow-read', '--allow-env', ...]
 * const target = Params.Target;         // 'x86_64-pc-windows-msvc' or undefined
 * ```
 */
export class CompileParams extends CommandParams<
  z.infer<typeof CompileArgsSchema>,
  z.infer<typeof CompileFlagsSchema>
> {
  /**
   * Entry point file for compilation.
   * Defaults to './.build/main.ts' (output of build command).
   */
  get Entry(): string {
    return this.Flag("entry") ?? "./.build/main.ts";
  }

  /**
   * Override path to .cli.ts configuration.
   * When undefined, looks for .cli.ts alongside the entry point.
   */
  get ConfigPath(): string | undefined {
    return this.Flag("config");
  }

  /**
   * Output directory for the compiled binary.
   * Defaults to './.dist/exe'.
   */
  get OutputDir(): string {
    return this.Flag("output") ?? "./.dist/exe";
  }

  /**
   * Deno permission flags for the compiled binary.
   *
   * Parses space-separated string into array. Defaults to full permissions:
   * `--allow-read --allow-env --allow-net --allow-write --allow-run`
   */
  get Permissions(): string[] {
    return (
      this.Flag("permissions")?.split(" ") ?? [
        "--allow-read",
        "--allow-env",
        "--allow-net",
        "--allow-write",
        "--allow-run",
      ]
    );
  }

  /**
   * Cross-compilation target for Deno compile.
   *
   * When specified, enables cross-compilation and outputs binary to
   * a target-specific subdirectory (e.g., `.dist/x86_64-pc-windows-msvc/`).
   *
   * Supported targets:
   * - `x86_64-pc-windows-msvc` - Windows x64
   * - `x86_64-apple-darwin` - macOS x64 (Intel)
   * - `aarch64-apple-darwin` - macOS ARM64 (Apple Silicon)
   * - `x86_64-unknown-linux-gnu` - Linux x64
   * - `aarch64-unknown-linux-gnu` - Linux ARM64
   */
  get Target(): string | undefined {
    return this.Flag("target");
  }

  /**
   * Whether to compile for all supported targets.
   *
   * When true, compiles binaries for all targets in COMPILE_TARGETS.
   * Output structure: `.dist/exe/<target>/<binary>`
   */
  get All(): boolean {
    return this.Flag("all") ?? false;
  }

  /**
   * Version to embed in the compiled binary.
   * Defaults to '0.0.0' if --version flag not provided.
   */
  get Version(): string {
    return this.Flag("version") ?? "0.0.0";
  }
}

/**
 * Compile command - creates native binary from CLI build.
 *
 * Invokes Build as a sub-command, then runs `deno compile` to generate
 * a standalone executable. Binary name is derived from .cli.ts Tokens[0].
 * Supports cross-compilation via the `--target` flag.
 */
export default Command("compile", "Compile the CLI into a native binary")
  .Args(CompileArgsSchema)
  .Flags(CompileFlagsSchema)
  .Params(CompileParams)
  .Commands({
    Build: BuildCommand.Build(),
  })
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const cliRoot = await dfsCtx.RegisterProjectDFS(ctx.Params.Entry, "CLI");

    return {
      CLIDFS: await dfsCtx.GetDFS("CLI"),
      CLIRoot: cliRoot,
    };
  })
  .Run(
    async (
      { Params, Log, Commands, Services },
    ): Promise<CommandStatus<CompileResult>> => {
      const { CLIDFS } = Services;

      const relativeEntry = Params.Entry.replace(
        CLIDFS.Root.replace(/^\.\/?/, ""),
        "",
      ).replace(/^\.\/?/, "");
      const entryPath = await CLIDFS.ResolvePath(`./${relativeEntry}`);
      const baseOutputDir = await CLIDFS.ResolvePath(Params.OutputDir);
      const permissions = Params.Permissions;

      // Import CLI module to get config
      const cliModulePath = await CLIDFS.ResolvePath(".cli.ts");
      const cliModuleInfo = await CLIDFS.GetFileInfo("./.cli.ts");
      if (!cliModuleInfo) {
        Log.Error(`❌ Could not find CLI config at: ./.cli.ts`);
        return {
          Code: 1,
          Message: "Could not find CLI config at: ./.cli.ts",
          Data: { binaries: [], version: Params.Version },
        };
      }

      const cliModuleUrl = toFileUrl(cliModulePath).href;
      let cliModule = (await import(cliModuleUrl)).default;
      // Build the module if it's a builder
      if (cliModule instanceof CLIModuleBuilder) {
        cliModule = cliModule.Build();
      }
      const config = cliModule.Config ?? {};
      const tokens: string[] = config.Tokens ?? ["cli"];

      if (!tokens.length) {
        Log.Error("❌ No tokens specified in CLI config.");
        return {
          Code: 1,
          Message: "No tokens specified in CLI config",
          Data: { binaries: [], version: Params.Version },
        };
      }

      const primaryToken = tokens[0];

      // Run build once before compilation
      const { Build } = Commands!;
      await Build([], {
        config: join(Services.CLIRoot, cliModuleInfo.Path),
        version: Params.Version,
      });

      // Determine which targets to compile
      const targets: (string | undefined)[] = Params.All
        ? [...COMPILE_TARGETS]
        : [Params.Target];
      const compiledBinaries: { target: string; path: string }[] = [];

      if (Params.All) {
        Log.Info(
          `🔧 Compiling CLI for all ${COMPILE_TARGETS.length} targets...`,
        );
      }

      for (const target of targets) {
        // Determine binary extension based on target or current OS
        const binaryExt = target
          ? getBinaryExtension(target)
          : (Deno.build.os === "windows" ? ".exe" : "");

        // Always use subdirectory structure: .dist/exe/<target>/<binary>
        let outputBinaryPath: string;
        if (target) {
          // Cross-compile (single or all): .dist/exe/x86_64-apple-darwin/ftm
          outputBinaryPath = join(baseOutputDir, target, primaryToken);
        } else {
          // Local compile: .dist/exe/ftm
          outputBinaryPath = join(baseOutputDir, primaryToken);
        }

        const outputBinaryWithExt = `${outputBinaryPath}${binaryExt}`;

        Log.Info(`🔧 Compiling CLI for: ${primaryToken}`);
        Log.Info(`- Entry: ${entryPath}`);
        Log.Info(`- Output: ${outputBinaryWithExt}`);
        if (target) {
          Log.Info(`- Target: ${target}`);
        }
        Log.Info(`- Permissions: ${permissions.join(" ")}`);

        // Ensure output directory exists before compilation (required for cross-compilation targets)
        const outputDir = dirname(outputBinaryWithExt);
        try {
          await Deno.mkdir(outputDir, { recursive: true });
        } catch (err) {
          if (!(err instanceof Deno.errors.AlreadyExists)) {
            throw err;
          }
        }

        // Build compile command with optional target
        const compileArgs = [
          "compile",
          ...permissions,
          "--output",
          outputBinaryWithExt,
          ...(target ? ["--target", target] : []),
          entryPath,
        ];

        await runCommandWithLogs(compileArgs, Log, {
          stdin: "null",
          exitOnFail: true,
          cwd: Services.CLIDFS.Root,
        });

        Log.Success(`✅ Compiled: ${outputBinaryWithExt}`);
        if (target) {
          Log.Info(`📦 Cross-compiled for: ${target}`);
        }

        compiledBinaries.push({
          target: target ?? "local",
          path: outputBinaryWithExt,
        });
      }

      if (Params.All) {
        Log.Success(
          `🎉 All ${COMPILE_TARGETS.length} targets compiled successfully`,
        );
        Log.Info(`📦 Binaries ready for release in: ${baseOutputDir}`);
      } else {
        Log.Info(
          `👉 To install, run: \`ftm cli install${
            Params.Target ? ` --target=${Params.Target}` : ""
          }\``,
        );
      }

      return {
        Code: 0,
        Message: `Compiled ${compiledBinaries.length} binary(ies)`,
        Data: { binaries: compiledBinaries, version: Params.Version },
      };
    },
  );
