/**
 * Run command - executes CLI commands during development.
 *
 * The run command provides a development workflow for testing CLI commands
 * without compiling. It scaffolds a temporary runner script and executes
 * the specified command in a new Deno process with full permissions.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Resolve DFS context (execution dir or --config path)           │
 * │  2. Scaffold cli-run template to .temp/cli-runner.ts               │
 * │  3. Build CLI args: .cli.json path + forwarded args + flags        │
 * │  4. Execute `deno run -A .temp/cli-runner.ts [args]`               │
 * │  5. Forward exit code from CLI process                             │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Argument Forwarding
 *
 * All positional arguments after the command name and all flags
 * (except `--config`) are forwarded to the target command:
 *
 * ```bash
 * ftm run hello world --loud --config=./my-cli/.cli.json
 *          ↓     ↓      ↓           ↓
 *      command  arg   flag    (not forwarded)
 * ```
 *
 * ## Development Workflow
 *
 * Use `ftm run` for rapid iteration during command development:
 *
 * 1. Edit command source in `commands/`
 * 2. Run `ftm run <command>` to test
 * 3. Iterate without rebuilding
 *
 * @example Run hello command with default args
 * ```bash
 * ftm run hello
 * ```
 *
 * @example Run hello command with a name argument
 * ```bash
 * ftm run hello world
 * ```
 *
 * @example Run command with flags
 * ```bash
 * ftm run hello --loud
 * ```
 *
 * @example Run command from a specific project
 * ```bash
 * ftm run hello --config=./my-cli/.cli.json
 * ```
 *
 * @module
 */

import { z } from 'zod';
import {
  CLIDFSContextManager,
  Command,
  CommandParams,
  runCommandWithLogs,
  TemplateLocator,
  TemplateScaffolder,
} from '@fathym/cli';

/**
 * Zod schema for run command positional arguments.
 *
 * Uses `.rest()` to capture the command name and all subsequent
 * arguments as variadic positional args for forwarding.
 */
const RunArgsSchema = z
  .tuple([z.string().meta({ argName: 'command' })])
  .rest(z.string());

/**
 * Zod schema for run command flags.
 *
 * Uses `.passthrough()` to allow any additional flags, which
 * are forwarded to the target command.
 *
 * @property config - Path to .cli.json (not forwarded to target)
 */
const RunFlagsSchema = z
  .object({
    config: z.string().optional(),
  })
  .passthrough();

/**
 * Typed parameter accessor for the run command.
 *
 * Provides getters for config path and methods to extract
 * forwarded arguments and flags for the target command.
 */
class RunParams extends CommandParams<
  z.infer<typeof RunArgsSchema>,
  z.infer<typeof RunFlagsSchema>
> {
  /**
   * Override path to .cli.json configuration.
   * This flag is consumed by run and not forwarded to target.
   */
  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  /**
   * All positional arguments to forward to the target command.
   * Includes the command name as the first element.
   */
  get ForwardedArgs(): string[] {
    return this.Args;
  }

  /**
   * Flags to forward to the target command.
   *
   * Excludes `--config` flag and formats remaining flags
   * as `--key=value` strings.
   */
  get ForwardedFlags(): string[] {
    return Object.entries(this.Flags)
      .filter(([key]) => key !== 'config')
      .map(([key, val]) => `--${key}=${val}`);
  }
}

/**
 * Run command - executes CLI commands in development mode.
 *
 * Scaffolds a temporary runner and executes the target command
 * in a new Deno process without requiring compilation.
 */
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

    await runCommandWithLogs(['run', '-A', runner, ...cliArgs], Log, {
      exitOnFail: true,
      cwd: Services.CLIDFS.Root,
    });

    Log.Success('🎉 CLI run completed');
  });
