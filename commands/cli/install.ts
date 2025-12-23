/**
 * Install command - copies compiled CLI binary to system PATH.
 *
 * The install command takes a compiled CLI binary from `.dist/exe/` and copies
 * it to a target directory (default: `./.bin` or user home). It also creates
 * shell/batch script aliases for additional tokens defined in `.cli.ts`.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Resolve config DFS and install DFS (project or home)           │
 * │  2. Read .cli.ts to get binary name from Tokens[0]               │
 * │  3. Detect target from --target flag or auto-detect from OS/arch   │
 * │  4. Locate binary in .dist/exe/<target>/ or .dist/exe/             │
 * │  5. Copy binary to install directory                               │
 * │  6. For each alias token, create shell/batch wrapper script        │
 * │  7. Set executable permissions on Unix (chmod 755)                 │
 * │  8. Check if install directory is in PATH and warn if not          │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Cross-Platform Handling
 *
 * | Platform | Binary Extension | Alias Extension | Line Endings |
 * |----------|-----------------|-----------------|--------------|
 * | Windows  | `.exe`          | `.cmd`          | CRLF         |
 * | Unix     | (none)          | (none)          | LF           |
 *
 * ## Target Detection
 *
 * When installing from a cross-compiled release, the install command
 * auto-detects the current platform and selects the appropriate binary:
 *
 * | OS      | Arch    | Target                      |
 * |---------|---------|----------------------------|
 * | Windows | x64     | x86_64-pc-windows-msvc     |
 * | macOS   | x64     | x86_64-apple-darwin        |
 * | macOS   | ARM64   | aarch64-apple-darwin       |
 * | Linux   | x64     | x86_64-unknown-linux-gnu   |
 * | Linux   | ARM64   | aarch64-unknown-linux-gnu  |
 *
 * ## Alias Scripts
 *
 * When `.cli.ts` defines multiple tokens (e.g., `["my-cli", "mc"]`),
 * the first token becomes the binary name and subsequent tokens get
 * wrapper scripts:
 *
 * **Unix (`mc`):**
 * ```bash
 * #!/bin/sh
 * exec my-cli "$@"
 * ```
 *
 * **Windows (`mc.cmd`):**
 * ```batch
 * @echo off
 * my-cli.exe %*
 * ```
 *
 * @example Install to default location (./.bin)
 * ```bash
 * ftm cli install
 * ```
 *
 * @example Install to custom directory
 * ```bash
 * ftm cli install --to=~/.local/bin
 * ```
 *
 * @example Install to user home directory
 * ```bash
 * ftm cli install --useHome --to=.bin
 * ```
 *
 * @example Install from specific project
 * ```bash
 * ftm cli install --config=./my-cli/.cli.ts
 * ```
 *
 * @example Install specific target (override auto-detection)
 * ```bash
 * ftm cli install --target=x86_64-unknown-linux-gnu
 * ```
 *
 * @module
 */

import { dirname } from '@std/path';
import { toFileUrl } from '@std/path/to-file-url';
import { z } from 'zod';
import {
  CLIDFSContextManager,
  CLIModuleBuilder,
  Command,
  CommandParams,
  type CommandStatus,
} from '@fathym/cli';
import {
  detectTarget,
  findBinary,
  getBinaryExtension,
  installBinary,
  type InstallLogger,
} from '../../src/services/InstallService.ts';

/**
 * Result data for the install command.
 */
export interface InstallResult {
  /** Whether installation was successful */
  installed: boolean;
  /** The path where the binary was installed */
  binaryPath: string;
  /** The target platform */
  target: string;
  /** Any aliases that were created */
  aliases?: string[];
}

/**
 * Zod schema for install command positional arguments.
 * The install command takes no positional arguments.
 */
export const InstallArgsSchema = z.tuple([]);

/**
 * Zod schema for install command flags.
 *
 * @property to - Target installation directory
 * @property config - Path to .cli.ts configuration
 * @property useHome - Use user home directory as DFS root
 * @property target - Override target auto-detection
 */
export const InstallFlagsSchema = z
  .object({
    to: z.string().optional().describe('Target install dir (default: ~/.bin)'),
    config: z
      .string()
      .optional()
      .describe('Path to .cli.ts (default: ./.cli.ts)'),
    useHome: z
      .boolean()
      .optional()
      .describe('Use the user home directory as DFS root (default: false)'),
    target: z
      .string()
      .optional()
      .describe('Target platform (auto-detected if not specified)'),
  })
  .passthrough();

/**
 * Typed parameter accessor for the install command.
 *
 * Provides getters for installation directory, config path,
 * home directory mode flag, and target platform.
 */
export class InstallParams extends CommandParams<
  z.infer<typeof InstallArgsSchema>,
  z.infer<typeof InstallFlagsSchema>
> {
  /**
   * Target directory for CLI installation.
   * Defaults to './.bin' (relative to DFS root).
   */
  get To(): string {
    return this.Flag('to') ?? './.bin';
  }

  /**
   * Override path to .cli.ts configuration.
   * Used to locate the compiled binary in .dist/.
   */
  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  /**
   * Whether to use user home directory as DFS root.
   *
   * When true, `--to` path is resolved relative to home directory,
   * enabling global CLI installation (e.g., `~/.bin/my-cli`).
   */
  get UseHome(): boolean {
    return this.Flag('useHome') ?? false;
  }

  /**
   * Target platform for binary selection.
   *
   * When specified, overrides auto-detection and installs the binary
   * from the corresponding target folder in `.dist/exe/<target>/`.
   */
  get Target(): string | undefined {
    return this.Flag('target');
  }
}

/**
 * Install command - copies CLI binary to system PATH.
 *
 * Handles cross-platform binary naming, alias script creation,
 * target auto-detection, and PATH verification.
 */
export default Command(
  'install',
  'Install a compiled CLI binary to your system',
)
  .Args(InstallArgsSchema)
  .Flags(InstallFlagsSchema)
  .Params(InstallParams)
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.ConfigPath) {
      await dfsCtx.RegisterProjectDFS(ctx.Params.ConfigPath, 'CLI');
    }

    const configDFS = ctx.Params.ConfigPath
      ? await dfsCtx.GetDFS('CLI')
      : await dfsCtx.GetExecutionDFS();

    const installDFS = ctx.Params.UseHome ? await dfsCtx.GetUserHomeDFS() : configDFS;

    return {
      ConfigDFS: configDFS,
      InstallDFS: installDFS,
    };
  })
  .Run(
    async (
      { Log, Services, Params },
    ): Promise<CommandStatus<InstallResult>> => {
      const { ConfigDFS, InstallDFS } = Services;

      const configPath = await ConfigDFS.ResolvePath('.cli.ts');
      const configInfo = await ConfigDFS.GetFileInfo('.cli.ts');
      const target = Params.Target ?? detectTarget();

      if (!configInfo) {
        Log.Error(`❌ Could not find CLI config at: ${configPath}`);
        return {
          Code: 1,
          Message: `Could not find CLI config at: ${configPath}`,
          Data: { installed: false, binaryPath: '', target },
        };
      }

      // Import CLI module to get config
      const cliModuleUrl = toFileUrl(configPath).href;
      let cliModule = (await import(cliModuleUrl)).default;
      // Build the module if it's a builder
      if (cliModule instanceof CLIModuleBuilder) {
        cliModule = cliModule.Build();
      }
      const config = cliModule.Config ?? {};
      const tokens: string[] = config.Tokens ?? ['cli'];

      if (!tokens.length) {
        Log.Error('❌ No tokens specified in CLI config.');
        return {
          Code: 1,
          Message: 'No tokens specified in CLI config',
          Data: { installed: false, binaryPath: '', target },
        };
      }

      // Determine target - use flag or auto-detect from OS/arch
      const binaryExt = getBinaryExtension(target);
      const binaryName = `${tokens[0]}${binaryExt}`;

      const configDir = dirname(configPath);
      const distDir = `${configDir}/.dist`;

      // Find binary using InstallService
      const sourceBinaryPath = await findBinary({
        distDir,
        target,
        binaryName,
      });

      if (!sourceBinaryPath) {
        Log.Error(`❌ Could not find binary for target: ${target}`);
        Log.Error(`   Looked in: ${distDir}/exe/${target}/${binaryName}`);
        Log.Error(`   Also tried: ${distDir}/exe/${binaryName}`);
        Log.Error(`   And legacy: ${distDir}/${target}/${binaryName}`);
        return {
          Code: 1,
          Message: `Could not find binary for target: ${target}`,
          Data: { installed: false, binaryPath: '', target },
        };
      }

      Log.Info(`📦 Found binary: ${sourceBinaryPath}`);

      const installDir = await InstallDFS.ResolvePath(Params.To);
      const installedBinaryPath = `${installDir}/${binaryName}`;
      const aliases = tokens.slice(1);

      // Create logger adapter for InstallService
      const logger: InstallLogger = {
        info: (msg) => Log.Info(msg),
        success: (msg) => Log.Success(msg),
        warn: (msg) => Log.Warn(msg),
        error: (msg) => Log.Error(msg),
      };

      // Install using shared service
      try {
        await installBinary({
          sourcePath: sourceBinaryPath,
          installDir,
          binaryName,
          aliases,
          log: logger,
        });
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === 'Binary locked and cannot be replaced'
        ) {
          Log.Error('');
          Log.Error('Try one of these solutions:');
          Log.Error('  1. Close all terminal windows running the CLI');
          Log.Error('  2. Run the install command in a new terminal:');
          Log.Error(`     deno task cli:run cli install --useHome --to=.bin`);
          return {
            Code: 1,
            Message: 'Binary locked and cannot be replaced',
            Data: { installed: false, binaryPath: installedBinaryPath, target },
          };
        }
        throw err;
      }

      return {
        Code: 0,
        Message: `Successfully installed to ${installedBinaryPath}`,
        Data: {
          installed: true,
          binaryPath: installedBinaryPath,
          target,
          aliases: aliases.length ? aliases : undefined,
        },
      };
    },
  );
