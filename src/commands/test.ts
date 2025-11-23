import { z } from '../../.deps.ts';
import { Command } from '../../fluent/Command.ts';
import { CommandParams } from '../../commands/CommandParams.ts';
import { CLIDFSContextManager } from '../../CLIDFSContextManager.ts';
import { runCommandWithLogs } from '../../utils/runCommandWithLogs.ts';

export const TestArgsSchema = z.tuple([
  z
    .string()
    .optional()
    .describe('Test file to run (default: test/my-cli/intents/.intents.ts)'),
]);

export const TestFlagsSchema = z
  .object({
    coverage: z.string().optional().describe('Directory for coverage output'),
    filter: z.string().optional().describe('Run only tests with this name'),
    'no-check': z.boolean().optional().describe('Skip type checking'),
    watch: z
      .boolean()
      .optional()
      .describe('Watch for file changes and rerun tests'),
    doc: z.boolean().optional().describe('Type-check and run jsdoc tests'),
    shuffle: z.boolean().optional().describe('Run tests in random order'),
    config: z
      .string()
      .optional()
      .describe('Path to .cli.json (default: ./.cli.json)'),
  })
  .passthrough();

export class TestParams extends CommandParams<
  z.infer<typeof TestArgsSchema>,
  z.infer<typeof TestFlagsSchema>
> {
  get TestFile(): string {
    return this.Arg(0) ?? './intents/.intents.ts';
  }

  get DenoFlags(): string[] {
    const mapFlag = (key: string, val: unknown): string | undefined => {
      if (key === 'baseTemplatesDir') return undefined;
      if (val === true) return `--${key}`;
      if (val === false) return undefined;
      return `--${key}=${val}`;
    };

    return Object.entries(this.Flags)
      .filter(([k]) => k !== 'config')
      .map(([k, v]) => mapFlag(k, v))
      .filter(Boolean) as string[];
  }

  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }
}

export default Command('test', 'Run CLI tests using Deno')
  .Args(TestArgsSchema)
  .Flags(TestFlagsSchema)
  .Params(TestParams)
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    await dfsCtx.RegisterProjectDFS(
      ctx.Params.ConfigPath || ctx.Params.TestFile,
      'CLI',
    );

    const cliDFS = await dfsCtx.GetDFS('CLI');

    console.log('-------------------------------------');
    console.log(cliDFS.Root);

    return {
      CLIDFS: cliDFS,
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    const rootPath = Services.CLIDFS.Root.replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      '\\$&',
    );

    const testFileRel = Params.TestFile.replace(
      new RegExp(`^${rootPath}[\\/]*`),
      '',
    );

    const testPath = await Services.CLIDFS.ResolvePath(testFileRel);
    const denoFlags = Params.DenoFlags;

    Log.Info(`🧪 Running tests from: ${testFileRel}`);
    Log.Info(`➡️  deno test -A ${denoFlags.join(' ')} ${testPath}`);

    await runCommandWithLogs(['test', '-A', ...denoFlags, testPath], Log, {
      exitOnFail: true,
    });

    Log.Success('✅ Tests passed successfully');
  });
