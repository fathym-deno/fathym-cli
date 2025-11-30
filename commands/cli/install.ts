/**
 * Install command - copies compiled CLI binary to system PATH.
 *
 * The install command takes a compiled CLI binary from `.dist/` and copies
 * it to a target directory (default: `./.bin` or user home). It also creates
 * shell/batch script aliases for additional tokens defined in `.cli.json`.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Resolve config DFS and install DFS (project or home)           │
 * │  2. Read .cli.json to get binary name from Tokens[0]               │
 * │  3. Detect target from --target flag or auto-detect from OS/arch   │
 * │  4. Locate binary in .dist/<target>/ or .dist/ (flat structure)    │
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
 * When `.cli.json` defines multiple tokens (e.g., `["my-cli", "mc"]`),
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
 * ftm cli install --config=./my-cli/.cli.json
 * ```
 *
 * @example Install specific target (override auto-detection)
 * ```bash
 * ftm cli install --target=x86_64-unknown-linux-gnu
 * ```
 *
 * @module
 */

import { dirname, join } from '@std/path';
import { exists } from '@fathym/common/path';
import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import { detectTarget, getBinaryExtension } from '../../src/config/FathymCLIConfig.ts';

/**
 * Zod schema for install command positional arguments.
 * The install command takes no positional arguments.
 */
export const InstallArgsSchema = z.tuple([]);

/**
 * Zod schema for install command flags.
 *
 * @property to - Target installation directory
 * @property config - Path to .cli.json configuration
 * @property useHome - Use user home directory as DFS root
 * @property target - Override target auto-detection
 */
export const InstallFlagsSchema = z
  .object({
    to: z.string().optional().describe('Target install dir (default: ~/.bin)'),
    config: z
      .string()
      .optional()
      .describe('Path to .cli.json (default: ./.cli.json)'),
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
   * Override path to .cli.json configuration.
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
   * from the corresponding target folder in `.dist/<target>/`.
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
  .Run(async ({ Log, Services, Params }) => {
    const { ConfigDFS, InstallDFS } = Services;
    const isWindows = Deno.build.os === 'windows';

    const configPath = await ConfigDFS.ResolvePath('.cli.json');
    const configInfo = await ConfigDFS.GetFileInfo('.cli.json');

    if (!configInfo) {
      Log.Error(`❌ Could not find CLI config at: ${configPath}`);
      Deno.exit(1);
    }

    const configRaw = await new Response(configInfo.Contents).text();
    const config = JSON.parse(configRaw);
    const tokens: string[] = config.Tokens ?? ['cli'];

    if (!tokens.length) {
      Log.Error('❌ No tokens specified in CLI config.');
      Deno.exit(1);
    }

    // Determine target - use flag or auto-detect from OS/arch
    const target = Params.Target ?? detectTarget();
    const binaryExt = getBinaryExtension(target);
    const binaryName = `${tokens[0]}${binaryExt}`;

    const configDir = dirname(configPath);
    const distDir = join(configDir, '.dist');

    // Try target folder first (cross-compiled), then flat structure (local compile)
    const targetDistDir = join(distDir, target);
    const targetBinaryPath = join(targetDistDir, binaryName);
    const flatBinaryPath = join(distDir, binaryName);

    let sourceBinaryPath: string;
    if (await exists(targetBinaryPath)) {
      sourceBinaryPath = targetBinaryPath;
      Log.Info(`📦 Found binary for target: ${target}`);
    } else if (await exists(flatBinaryPath)) {
      sourceBinaryPath = flatBinaryPath;
      Log.Info(`📦 Found binary in flat structure`);
    } else {
      Log.Error(`❌ Could not find binary for target: ${target}`);
      Log.Error(`   Looked in: ${targetBinaryPath}`);
      Log.Error(`   Also tried: ${flatBinaryPath}`);
      Deno.exit(1);
    }

    const installBase = await InstallDFS.ResolvePath(Params.To);

    await Deno.mkdir(installBase, { recursive: true });

    const destBinaryPath = join(installBase, binaryName);
    await Deno.copyFile(sourceBinaryPath, destBinaryPath);

    // Set executable permission on Unix
    if (!isWindows) {
      await Deno.chmod(destBinaryPath, 0o755);
    }

    Log.Success(`✅ Installed: ${destBinaryPath}`);

    for (const alias of tokens.slice(1)) {
      const aliasName = `${alias}${isWindows ? '.cmd' : ''}`;
      const aliasPath = join(installBase, aliasName);

      const aliasContent = isWindows
        ? `@echo off\r\n${binaryName} %*`
        : `#!/bin/sh\nexec ${binaryName} "$@"`;

      await Deno.writeTextFile(aliasPath, aliasContent);
      if (!isWindows) {
        await Deno.chmod(aliasPath, 0o755);
      }

      Log.Info(`🔗 Alias installed: ${aliasPath}`);
    }

    const envPath = Deno.env.get('PATH') ?? '';
    const pathSep = isWindows ? ';' : ':';
    const inPath = envPath.split(pathSep).includes(installBase);

    if (!inPath) {
      Log.Warn(`⚠️  Install path (${installBase}) is not in your PATH`);
      if (isWindows) {
        Log.Info(`👉 Add to PATH: setx PATH "%PATH%;${installBase}"`);
      } else {
        Log.Info(`👉 Add to your shell profile: export PATH="${installBase}:$PATH"`);
      }
    }

    Log.Success('🎉 CLI installed successfully');
  });
