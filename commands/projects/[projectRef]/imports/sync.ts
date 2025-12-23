/**
 * Sync command - synchronizes import mappings between local and remote modes.
 *
 * The projects:[projectRef]:imports:sync command manages deno.jsonc import maps to enable
 * seamless switching between local development (workspace paths) and production
 * (JSR registry) dependencies.
 *
 * ## Modes
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  LOCAL MODE                                                        │
 * │  ─────────                                                         │
 * │  1. Discovers all local packages in workspace                      │
 * │  2. Preserves original JSR imports in comments                     │
 * │  3. Rewrites imports to use relative workspace paths               │
 * │                                                                    │
 * │  REMOTE MODE                                                       │
 * │  ───────────                                                       │
 * │  1. Reads preserved original imports from comments                 │
 * │  2. Restores JSR registry imports                                  │
 * │  3. Removes local workspace overrides                              │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Local Mode Example
 *
 * Before:
 * ```jsonc
 * { "imports": { "@myorg/utils": "jsr:@myorg/utils@1.0.0" } }
 * ```
 *
 * After:
 * ```jsonc
 * {
 *   "imports": {
 *     // @sync-imports BEGIN ORIGINAL IMPORTS
 *     // "@myorg/utils": "jsr:@myorg/utils@1.0.0"
 *     // @sync-imports END ORIGINAL IMPORTS
 *     "@myorg/utils": "../utils/src/.exports.ts"
 *   }
 * }
 * ```
 *
 * @example Sync local imports for a package
 * ```bash
 * ftm projects @myorg/my-app imports sync --mode=local
 * ```
 *
 * @example Restore remote imports
 * ```bash
 * ftm projects @myorg/my-app imports sync --mode=remote
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../../src/projects/ProjectResolver.ts';
import { type ImportsSyncMode, syncImports } from '../../../../src/projects/ImportsSync.ts';

/**
 * Result data for the imports:sync command.
 */
export interface ImportsSyncResult {
  /** The project reference that was synced */
  target: string;
  /** Sync mode used */
  mode: ImportsSyncMode;
  /** Number of config files that were synced */
  configsSynced: number;
  /** Whether sync was successful */
  success: boolean;
}

/**
 * Segments schema for the imports:sync command.
 */
const SyncSegmentsSchema = z.object({
  projectRef: z.string().describe(
    'Project name, path to deno.json(c), or directory',
  ),
});

type SyncSegments = z.infer<typeof SyncSegmentsSchema>;

/**
 * Zod schema for sync command positional arguments.
 *
 * This command takes no positional arguments; all inputs are via flags.
 */
const SyncArgsSchema = z.tuple([]);

/**
 * Zod schema for sync command flags.
 *
 * @property mode - Sync direction: 'local' for workspace paths, 'remote' for JSR
 */
const SyncFlagsSchema = z.object({
  mode: z
    .enum(['local', 'remote'])
    .describe(
      "Either 'local' (enable local overrides) or 'remote' (restore jsr imports).",
    ),
});

/**
 * Typed parameter accessor for the sync command.
 *
 * Provides getters for mode and target from segment.
 */
class SyncParams extends CommandParams<
  z.infer<typeof SyncArgsSchema>,
  z.infer<typeof SyncFlagsSchema>,
  SyncSegments
> {
  /** Sync mode: 'local' or 'remote' */
  get Mode(): ImportsSyncMode {
    return this.Flag('mode') as ImportsSyncMode;
  }

  /** Target from dynamic segment */
  get Target(): string {
    return this.Segment('projectRef') ?? '';
  }
}

export default Command(
  'projects:[projectRef]:imports:sync',
  'Sync deno.jsonc imports between jsr and local workspace overrides.',
)
  .Args(SyncArgsSchema)
  .Flags(SyncFlagsSchema)
  .Segments(SyncSegmentsSchema)
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
  .Run(
    async (
      { Params, Log, Services },
    ): Promise<CommandStatus<ImportsSyncResult>> => {
      if (!Params.Target) {
        Log.Error('No project reference provided.');
        return {
          Code: 1,
          Message: 'No project reference provided',
          Data: {
            target: '',
            mode: Params.Mode,
            configsSynced: 0,
            success: false,
          },
        };
      }

      try {
        const result = await syncImports({
          mode: Params.Mode,
          target: Params.Target,
          resolver: Services.ProjectResolver,
          log: (msg) => Log.Info(msg),
        });

        if (result.targetConfigs.length === 0) {
          Log.Error('No deno.jsonc targets were resolved.');
          return {
            Code: 1,
            Message: 'No deno.jsonc targets were resolved',
            Data: {
              target: Params.Target,
              mode: Params.Mode,
              configsSynced: 0,
              success: false,
            },
          };
        }

        return {
          Code: 0,
          Message: `Synced ${result.targetConfigs.length} config(s) to ${Params.Mode} mode`,
          Data: {
            target: Params.Target,
            mode: Params.Mode,
            configsSynced: result.targetConfigs.length,
            success: true,
          },
        };
      } catch (error) {
        Log.Error(error instanceof Error ? error.message : String(error));
        return {
          Code: 1,
          Message: `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
          Data: {
            target: Params.Target,
            mode: Params.Mode,
            configsSynced: 0,
            success: false,
          },
        };
      }
    },
  );
