import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../src/projects/ProjectResolver.ts';
import { type ImportsSyncMode, syncImports } from '../../../src/projects/ImportsSync.ts';

const SyncArgsSchema = z.tuple([]);

const SyncFlagsSchema = z.object({
  mode: z
    .enum(['local', 'remote'])
    .describe("Either 'local' (enable local overrides) or 'remote' (restore jsr imports)."),
  target: z
    .string()
    .describe(
      'Path to a deno.jsonc file, a directory (walked for deno.jsonc files), or a local package name.',
    ),
});

class SyncParams extends CommandParams<
  z.infer<typeof SyncArgsSchema>,
  z.infer<typeof SyncFlagsSchema>
> {
  get Mode(): ImportsSyncMode {
    return this.Flag('mode') as ImportsSyncMode;
  }

  get Target(): string {
    return this.Flag('target') as string;
  }
}

export default Command(
  'projects:imports:sync',
  'Sync deno.jsonc imports between jsr and local workspace overrides.',
)
  .Args(SyncArgsSchema)
  .Flags(SyncFlagsSchema)
  .Params(SyncParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      // Cast to local DFSFileHandler type to resolve version mismatch between CLI's internal DFS
      // and the workspace's DFS version. Both support Walk at runtime.
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    try {
      const result = await syncImports({
        mode: Params.Mode,
        target: Params.Target,
        resolver: Services.ProjectResolver,
        log: (msg) => Log.Info(msg),
      });

      if (result.targetConfigs.length === 0) {
        Log.Error('No deno.jsonc targets were resolved.');
        return 1;
      }

      return 0;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
