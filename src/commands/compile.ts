import { join, z } from '../../.deps.ts';
import { Command } from '../../fluent/Command.ts';
import { CommandParams } from '../../commands/CommandParams.ts';
import BuildCommand from './build.ts';
import { CLIDFSContextManager } from '../../CLIDFSContextManager.ts';
import { runCommandWithLogs } from '../../utils/runCommandWithLogs.ts';

export const CompileArgsSchema = z.tuple([]);

export const CompileFlagsSchema = z.object({
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
});

export class CompileParams extends CommandParams<
  z.infer<typeof CompileArgsSchema>,
  z.infer<typeof CompileFlagsSchema>
> {
  get Entry(): string {
    return this.Flag('entry') ?? './.build/cli.ts';
  }

  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  get OutputDir(): string {
    return this.Flag('output') ?? './.dist';
  }

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
}

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
    const outputDir = await CLIDFS.ResolvePath(Params.OutputDir);
    const permissions = Params.Permissions;

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
    const outputBinaryPath = join(outputDir, primaryToken);

    Log.Info(`🔧 Compiling CLI for: ${primaryToken}`);
    Log.Info(`- Entry: ${entryPath}`);
    Log.Info(`- Output dir: ${outputDir}`);
    Log.Info(`- Permissions: ${permissions.join(' ')}`);

    const { Build } = Commands!;
    await Build([], { config: join(Services.CLIRoot, configInfo.Path) });

    await runCommandWithLogs(
      [
        'compile',
        ...permissions,
        '--output',
        outputBinaryPath,
        entryPath,
      ],
      Log,
      { stdin: 'null', exitOnFail: true },
    );

    Log.Success(`✅ Compiled: ${outputBinaryPath}`);
    Log.Info(
      `👉 To install, run: \`your-cli install --from ${outputBinaryPath}\``,
    );
  });
