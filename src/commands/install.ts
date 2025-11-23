import { dirname, join, z } from '../../.deps.ts';
import { Command } from '../../fluent/Command.ts';
import { CommandParams } from '../../commands/CommandParams.ts';
import { CLIDFSContextManager } from '../../CLIDFSContextManager.ts';

export const InstallArgsSchema = z.tuple([]);

export const InstallFlagsSchema = z.object({
  to: z.string().optional().describe('Target install dir (default: ~/.bin)'),
  config: z
    .string()
    .optional()
    .describe('Path to .cli.json (default: ./.cli.json)'),
  useHome: z
    .boolean()
    .optional()
    .describe('Use the user home directory as DFS root (default: false)'),
});

export class InstallParams extends CommandParams<
  z.infer<typeof InstallArgsSchema>,
  z.infer<typeof InstallFlagsSchema>
> {
  get To(): string {
    return this.Flag('to') ?? './.bin';
  }

  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  get UseHome(): boolean {
    return this.Flag('useHome') ?? false;
  }
}

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
