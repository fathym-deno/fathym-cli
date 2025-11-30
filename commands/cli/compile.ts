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
 * │  3. Read .cli.json to get binary name from Tokens[0]               │
 * │  4. Invoke Build sub-command to prepare static artifacts           │
 * │  5. Execute `deno compile` with permissions and output path        │
 * │  6. Output binary to .dist/<target>/<token-name> or .dist/<token>  │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Output Structure
 *
 * When `--target` is specified (cross-compilation):
 * ```
 * .dist/
 * └── x86_64-pc-windows-msvc/
 *     └── my-cli.exe
 * ```
 *
 * When no target (current OS):
 * ```
 * .dist/
 * └── my-cli           # or my-cli.exe on Windows
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
 * ftm cli compile --entry=./my-cli/.build/cli.ts
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

import { join } from '@std/path/join';
import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, runCommandWithLogs } from '@fathym/cli';
import BuildCommand from './build.ts';
import { getBinaryExtension } from '../../src/FathymCLIConfig.ts';

/**
 * Zod schema for compile command positional arguments.
 * The compile command takes no positional arguments.
 */
export const CompileArgsSchema = z.tuple([]);

/**
 * Zod schema for compile command flags.
 *
 * @property entry - Entry point file (output of build command)
 * @property config - Path to .cli.json configuration
 * @property output - Output directory for compiled binary
 * @property permissions - Space-separated Deno permission flags
 * @property target - Cross-compilation target (Deno compile target triple)
 */
export const CompileFlagsSchema = z
  .object({
    entry: z
      .string()
      .optional()
      .describe('Entry point file (default: ./.build/cli.ts)'),
    config: z
      .string()
      .optional()
      .describe('Path to .cli.json (default: alongside entry)'),
    output: z.string().optional().describe('Output folder (default: ./.dist)'),
    permissions: z
      .string()
      .optional()
      .describe('Deno permissions (default: full access)'),
    target: z
      .string()
      .optional()
      .describe('Cross-compilation target (e.g., x86_64-pc-windows-msvc)'),
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
 * const entry = Params.Entry;           // './.build/cli.ts' or custom
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
   * Defaults to './.build/cli.ts' (output of build command).
   */
  get Entry(): string {
    return this.Flag('entry') ?? './.build/cli.ts';
  }

  /**
   * Override path to .cli.json configuration.
   * When undefined, looks for .cli.json alongside the entry point.
   */
  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  /**
   * Output directory for the compiled binary.
   * Defaults to './.dist'.
   */
  get OutputDir(): string {
    return this.Flag('output') ?? './.dist';
  }

  /**
   * Deno permission flags for the compiled binary.
   *
   * Parses space-separated string into array. Defaults to full permissions:
   * `--allow-read --allow-env --allow-net --allow-write --allow-run`
   */
  get Permissions(): string[] {
    return (
      this.Flag('permissions')?.split(' ') ?? [
        '--allow-read',
        '--allow-env',
        '--allow-net',
        '--allow-write',
        '--allow-run',
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
    return this.Flag('target');
  }
}

/**
 * Compile command - creates native binary from CLI build.
 *
 * Invokes Build as a sub-command, then runs `deno compile` to generate
 * a standalone executable. Binary name is derived from .cli.json Tokens[0].
 * Supports cross-compilation via the `--target` flag.
 */
export default Command('compile', 'Compile the CLI into a native binary')
  .Args(CompileArgsSchema)
  .Flags(CompileFlagsSchema)
  .Params(CompileParams)
  .Commands({
    Build: BuildCommand.Build(),
  })
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const cliRoot = await dfsCtx.RegisterProjectDFS(ctx.Params.Entry, 'CLI');

    return {
      CLIDFS: await dfsCtx.GetDFS('CLI'),
      CLIRoot: cliRoot,
    };
  })
  .Run(async ({ Params, Log, Commands, Services }) => {
    const { CLIDFS } = Services;

    const relativeEntry = Params.Entry.replace(
      CLIDFS.Root.replace(/^\.\/?/, ''),
      '',
    ).replace(/^\.\/?/, '');
    const entryPath = await CLIDFS.ResolvePath(`./${relativeEntry}`);
    const baseOutputDir = await CLIDFS.ResolvePath(Params.OutputDir);
    const permissions = Params.Permissions;
    const target = Params.Target;

    const configInfo = await CLIDFS.GetFileInfo('./.cli.json');
    if (!configInfo) {
      Log.Error(`❌ Could not find CLI config at: ${'./.cli.json'}`);
      Deno.exit(1);
    }

    const configRaw = await new Response(configInfo.Contents).text();
    const config = JSON.parse(configRaw);
    const tokens: string[] = config.Tokens ?? ['cli'];

    if (!tokens.length) {
      Log.Error('❌ No tokens specified in CLI config.');
      Deno.exit(1);
    }

    const primaryToken = tokens[0];

    // Determine binary extension based on target or current OS
    const binaryExt = target
      ? getBinaryExtension(target)
      : (Deno.build.os === 'windows' ? '.exe' : '');
    const binaryName = `${primaryToken}${binaryExt}`;

    // Output to target subdirectory when cross-compiling
    const outputDir = target ? join(baseOutputDir, target) : baseOutputDir;
    const outputBinaryPath = join(outputDir, primaryToken);

    Log.Info(`🔧 Compiling CLI for: ${primaryToken}`);
    Log.Info(`- Entry: ${entryPath}`);
    Log.Info(`- Output: ${outputBinaryPath}${binaryExt}`);
    if (target) {
      Log.Info(`- Target: ${target}`);
    }
    Log.Info(`- Permissions: ${permissions.join(' ')}`);

    const { Build } = Commands!;
    await Build([], { config: join(Services.CLIRoot, configInfo.Path) });

    // Build compile command with optional target
    const compileArgs = [
      'compile',
      ...permissions,
      '--output',
      outputBinaryPath,
      ...(target ? ['--target', target] : []),
      entryPath,
    ];

    await runCommandWithLogs(compileArgs, Log, {
      stdin: 'null',
      exitOnFail: true,
      cwd: Services.CLIDFS.Root,
    });

    Log.Success(`✅ Compiled: ${outputBinaryPath}${binaryExt}`);
    if (target) {
      Log.Info(`📦 Cross-compiled for: ${target}`);
    }
    Log.Info(
      `👉 To install, run: \`ftm cli install${target ? ` --target=${target}` : ''}\``,
    );
  });
