/**
 * Dev command - runs a project's `deno task dev` by name or path.
 *
 * The projects:[projectRef]:dev command provides a unified way to start development servers
 * for projects in a workspace. It uses the ProjectResolver to locate projects
 * by package name, config path, or directory path.
 *
 * ## Project Requirements
 *
 * The target project must have a `dev` task defined in its deno.json(c):
 *
 * ```jsonc
 * {
 *   "name": "@myorg/my-package",
 *   "tasks": {
 *     "dev": "deno run -A --watch src/main.ts"
 *   }
 * }
 * ```
 *
 * @example Run dev task by package name
 * ```bash
 * ftm projects @myorg/my-package dev
 * ```
 *
 * @example Run dev task by directory path
 * ```bash
 * ftm projects ./packages/my-package dev
 * ```
 *
 * @example Dry run to see what would execute
 * ```bash
 * ftm projects @myorg/my-package dev --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../src/projects/ProjectResolver.ts';

/**
 * Segments schema for the dev command.
 */
const DevSegmentsSchema = z.object({
  projectRef: z.string().describe('Project name, path to deno.json(c), or directory'),
});

type DevSegments = z.infer<typeof DevSegmentsSchema>;

/**
 * Zod schema for dev command flags.
 *
 * @property dry-run - Preview what would run without executing
 */
const DevFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
});

/**
 * Zod schema for dev command positional arguments.
 */
const DevArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the dev command.
 *
 * Provides getters for the project reference and dry-run flag.
 */
class DevCommandParams extends CommandParams<
  z.infer<typeof DevArgsSchema>,
  z.infer<typeof DevFlagsSchema>,
  DevSegments
> {
  /** Project reference from dynamic segment */
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
  }

  /** Whether to preview without executing */
  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:[projectRef]:dev',
  "Run a project's `deno task dev` by project name or path.",
)
  .Args(DevArgsSchema)
  .Flags(DevFlagsSchema)
  .Segments(DevSegmentsSchema)
  .Params(DevCommandParams)
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
    const resolver = Services.ProjectResolver;

    if (!Params.ProjectRef) {
      Log.Error('No project reference provided.');
      return 1;
    }

    try {
      const projects = await resolver.Resolve(Params.ProjectRef);

      if (projects.length === 0) {
        Log.Error(`No projects found matching '${Params.ProjectRef}'.`);
        return 1;
      }

      if (projects.length > 1) {
        Log.Error(
          `Found ${projects.length} projects. Please specify a single project:\n` +
            projects.map((p) => `  - ${p.name ?? p.dir}`).join('\n'),
        );
        return 1;
      }

      const project = projects[0];

      if (!project.hasDev) {
        Log.Error(
          `No 'dev' task found in ${project.configPath}. ` +
            `This project may not be runnable with projects:dev.`,
        );
        return 1;
      }

      if (Params.DryRun) {
        Log.Info(
          `🛑 Dry run: Would run 'deno task dev' in ${project.dir} (${project.configPath}).`,
        );
        return 0;
      }

      Log.Info(
        `Starting 'deno task dev' in ${project.dir} (${project.configPath}).`,
      );

      const cmd = new Deno.Command('deno', {
        args: ['task', 'dev'],
        cwd: project.dir,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      });

      const { code } = await cmd.output();

      return code;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
