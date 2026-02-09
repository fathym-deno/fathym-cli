/**
 * Schedule command - generate cascade release schedule for a package.
 *
 * The projects:[projectRef]:cascade:schedule command discovers all packages
 * that depend on the target package and generates a topologically sorted
 * release schedule with parallel layer grouping.
 *
 * ## Usage
 *
 * ```bash
 * # Generate cascade schedule (human-readable)
 * ftm projects @fathym/dfs cascade schedule
 *
 * # Output as JSON for programmatic consumption
 * ftm projects @fathym/dfs cascade schedule --json
 *
 * # Limit cascade depth
 * ftm projects @fathym/dfs cascade schedule --max-depth=3
 * ```
 *
 * ## Output
 *
 * The command displays:
 * - Root package and release channel
 * - Layers with packages that can be released in parallel
 * - Dependency relationships between packages
 * - Total package count
 *
 * ## How It Works
 *
 * 1. **Discovery Phase (BFS):**
 *    - Starts from the root package
 *    - Uses `referencedBy` data to find all packages that depend on the root
 *    - Recursively discovers transitive dependents
 *    - Builds a complete dependency graph
 *
 * 2. **Cycle Detection:**
 *    - Checks for circular dependencies in the discovered graph
 *    - Throws an error with the cycle path if found
 *
 * 3. **Topological Sort:**
 *    - Orders packages so dependencies come before dependents
 *    - Groups packages into layers by depth from root
 *    - Packages in the same layer have no interdependencies (parallel-safe)
 *
 * 4. **Schedule Generation:**
 *    - Creates a release schedule with layers for execution order
 *    - Includes metadata for each package (dir, branch, dependencies)
 *
 * ## Schedule Structure
 *
 * The generated schedule contains:
 * - `root` - The starting package name
 * - `channel` - Release channel derived from git branch
 * - `layers` - Ordered array of layers, each containing parallel-safe packages
 * - `totalPackages` - Count of all packages in the schedule
 * - `skipped` - Packages that were skipped (e.g., already at target version)
 *
 * ## Integration with Run Command
 *
 * The schedule output can be piped to the cascade run command:
 *
 * ```bash
 * # Generate schedule and execute
 * ftm projects @fathym/dfs cascade schedule --json | ftm projects cascade run
 *
 * # Or save schedule and execute separately
 * ftm projects @fathym/dfs cascade schedule --json > schedule.json
 * ftm projects cascade run --schedule-file=schedule.json
 * ```
 *
 * @example Generate schedule
 * ```bash
 * ftm projects @fathym/dfs cascade schedule
 * ```
 *
 * @example JSON output for piping to run command
 * ```bash
 * ftm projects @fathym/dfs cascade schedule --json | ftm projects cascade run
 * ```
 *
 * @example Limit cascade depth
 * ```bash
 * ftm projects @fathym/dfs cascade schedule --max-depth=2
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../../src/projects/ProjectResolver.ts';
import { CascadeScheduler } from '../../../../src/pipelines/CascadeScheduler.ts';
import type { CascadeSchedule } from '../../../../src/pipelines/CascadeScheduleTypes.ts';

/**
 * Segments schema for the schedule command.
 * Receives the project reference from the dynamic [projectRef] segment.
 */
const ScheduleSegmentsSchema = z.object({
  projectRef: z.string().describe(
    'Package name or project reference to generate schedule for',
  ),
});

type ScheduleSegments = z.infer<typeof ScheduleSegmentsSchema>;

/**
 * Zod schema for schedule command flags.
 */
const ScheduleFlagsSchema = z.object({
  json: z.boolean().optional().describe(
    'Output as JSON for programmatic consumption or piping to run command',
  ),
  'max-depth': z.number().optional().describe(
    'Maximum depth to traverse in dependency graph (default: unlimited)',
  ),
});

/**
 * Zod schema for schedule command positional arguments.
 * No positional args - project comes from dynamic segment.
 */
const ScheduleArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the schedule command.
 */
class ScheduleCommandParams extends CommandParams<
  z.infer<typeof ScheduleArgsSchema>,
  z.infer<typeof ScheduleFlagsSchema>,
  ScheduleSegments
> {
  /** Project reference from dynamic segment */
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
  }

  /** Whether to output as JSON */
  get Json(): boolean {
    return this.Flag('json') ?? false;
  }

  /** Maximum depth for BFS traversal */
  get MaxDepth(): number | undefined {
    return this.Flag('max-depth');
  }
}

/**
 * Format a schedule layer for human-readable output.
 *
 * @param layer - The layer to format
 * @param Log - Logger instance for output
 */
function formatLayer(
  layer: CascadeSchedule['layers'][0],
  Log: { Info: (msg: string) => void },
): void {
  const packageList = layer.packages.map((pkg) => pkg.name).join(', ');
  const parallelNote = layer.packages.length > 1 ? ` (${layer.packages.length} parallel)` : '';

  Log.Info(`  Layer ${layer.index}: ${packageList}${parallelNote}`);

  // Show dependencies for each package if they exist
  for (const pkg of layer.packages) {
    if (pkg.dependsOn.length > 0) {
      Log.Info(`    └─ ${pkg.name} depends on: ${pkg.dependsOn.join(', ')}`);
    }
  }
}

export default Command(
  'projects:[projectRef]:cascade:schedule',
  'Generate cascade release schedule for a package.',
)
  .Args(ScheduleArgsSchema)
  .Flags(ScheduleFlagsSchema)
  .Segments(ScheduleSegmentsSchema)
  .Params(ScheduleCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();
    const resolver = new DFSProjectResolver(dfs as unknown as DFSFileHandler);

    return {
      ProjectResolver: resolver,
      Scheduler: new CascadeScheduler(resolver),
    };
  })
  .Run(async ({ Params, Log, Services }): Promise<CommandStatus<CascadeSchedule | null>> => {
    const { Scheduler } = Services;

    if (!Params.ProjectRef) {
      Log.Error('No project reference provided.');
      return {
        Code: 1,
        Message: 'No project reference provided',
        Data: null,
      };
    }

    try {
      // Build the cascade schedule
      const schedule = await Scheduler.buildSchedule(Params.ProjectRef, {
        maxDepth: Params.MaxDepth,
      });

      if (Params.Json) {
        // JSON output for piping to run command
        console.log(JSON.stringify(schedule, null, 2));
      } else {
        // Human-readable output
        Log.Info(`### Cascade Schedule for ${schedule.root}`);
        Log.Info('');
        Log.Info(`Channel: ${schedule.channel}`);
        Log.Info(`Generated: ${schedule.generatedAt}`);
        if (schedule.maxDepth !== undefined) {
          Log.Info(`Max Depth: ${schedule.maxDepth}`);
        }
        Log.Info('');

        if (schedule.layers.length === 0) {
          Log.Info('No dependent packages found.');
        } else {
          Log.Info('Layers:');
          for (const layer of schedule.layers) {
            formatLayer(layer, Log);
          }
        }

        Log.Info('');
        Log.Info(
          `Total: ${schedule.totalPackages} package(s) in ${schedule.layers.length} layer(s)`,
        );

        if (schedule.skipped.length > 0) {
          Log.Info('');
          Log.Info(`Skipped: ${schedule.skipped.join(', ')}`);
        }
      }

      return {
        Code: 0,
        Message: `Schedule generated for ${schedule.root}`,
        Data: schedule,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check for specific error types for better messaging
      if (message.includes('cycle') || message.includes('Cycle')) {
        Log.Error(`Dependency cycle detected: ${message}`);
      } else if (message.includes('not found')) {
        Log.Error(`Package not found: ${message}`);
      } else if (message.includes('Multiple projects')) {
        Log.Error(`Ambiguous project reference: ${message}`);
      } else {
        Log.Error(`Schedule generation failed: ${message}`);
      }

      return {
        Code: 1,
        Message: message,
        Data: null,
      };
    }
  });
