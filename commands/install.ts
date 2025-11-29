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
 * │  3. Copy binary from .dist/<token> to install directory            │
 * │  4. For each alias token, create shell/batch wrapper script        │
 * │  5. Set executable permissions on Unix (chmod 755)                 │
 * │  6. Check if install directory is in PATH and warn if not          │
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
 * ftm install
 * ```
 *
 * @example Install to custom directory
 * ```bash
 * ftm install --to=~/.local/bin
 * ```
 *
 * @example Install to user home directory
 * ```bash
 * ftm install --useHome --to=.bin
 * ```
 *
 * @example Install from specific project
 * ```bash
 * ftm install --config=./my-cli/.cli.json
 * ```
 *
 * @module
 */

import { dirname, join } from '@std/path';
import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';

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
  })
  .passthrough();

/**
 * Typed parameter accessor for the install command.
 *
 * Provides getters for installation directory, config path,
 * and home directory mode flag.
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
}

/**
 * Install command - copies CLI binary to system PATH.
 *
 * Handles cross-platform binary naming, alias script creation,
 * and PATH verification.
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

    const configDir = dirname(configPath);
    const binaryName = `${tokens[0]}${isWindows ? '.exe' : ''}`;
    const sourceBinaryPath = join(configDir, '.dist', binaryName);

    const installBase = await InstallDFS.ResolvePath(Params.To);

    await Deno.mkdir(installBase, { recursive: true });

    const targetBinaryPath = join(installBase, binaryName);
    await Deno.copyFile(sourceBinaryPath, targetBinaryPath);
    Log.Success(`✅ Installed: ${targetBinaryPath}`);

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
      Log.Info('👉 Add it to your shell profile to use CLI globally');
    }

    Log.Success('🎉 CLI installed successfully');
  });
