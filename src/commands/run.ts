import { z } from '../../.deps.ts';
import { Command } from '../../fluent/Command.ts';
import { CommandParams } from '../../commands/CommandParams.ts';
import { CLIDFSContextManager } from '../../CLIDFSContextManager.ts';
import type { TemplateLocator } from '../../templates/TemplateLocator.ts';
import { TemplateScaffolder } from '../../.exports.ts';
import { runCommandWithLogs } from '../../utils/runCommandWithLogs.ts'; // <-- new helper

const RunArgsSchema = z.tuple([z.string()]).rest(z.string());

const RunFlagsSchema = z
  .object({
    config: z.string().optional(),
  })
  .passthrough();

class RunParams extends CommandParams<
  z.infer<typeof RunArgsSchema>,
  z.infer<typeof RunFlagsSchema>
> {
  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  get ForwardedArgs(): string[] {
    return this.Args;
  }

  get ForwardedFlags(): string[] {
    return Object.entries(this.Flags)
      .filter(([key]) => key !== 'config')
      .map(([key, val]) => `--${key}=${val}`);
  }
}

export default Command('run', 'Run a specific command in a CLI project')
  .Args(RunArgsSchema)
  .Flags(RunFlagsSchema)
  .Params(RunParams)
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.ConfigPath) {
      await dfsCtx.RegisterProjectDFS(ctx.Params.ConfigPath, 'CLI');
    }

    const dfs = ctx.Params.ConfigPath ? await dfsCtx.GetDFS('CLI') : await dfsCtx.GetExecutionDFS();

    return {
      CLIDFS: dfs,
      Scaffolder: new TemplateScaffolder(
        await ioc.Resolve<TemplateLocator>(ioc.Symbol('TemplateLocator')),
        dfs,
      ),
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    const outputFile = './.temp/cli-runner.ts';

    Log.Info(`📦 Scaffolding runner script → ${outputFile}`);

    await Services.Scaffolder.Scaffold({
      templateName: 'cli-run',
      outputDir: './.temp',
    });

    const cliArgs = [
      await Services.CLIDFS.ResolvePath('./.cli.json'),
      ...Params.ForwardedArgs,
      ...Params.ForwardedFlags,
    ];

    const runner = await Services.CLIDFS.ResolvePath(outputFile);

    Log.Info(`🚀 Executing CLI in new process:`);
    Log.Info(`→ deno run -A ${runner} ${cliArgs.join(' ')}`);

    await runCommandWithLogs(
      ['run', '-A', runner, ...cliArgs],
      Log,
      { exitOnFail: true },
    );

    Log.Success('🎉 CLI run completed');
  });
