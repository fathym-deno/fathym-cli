/**
 * Task command - runs any deno task from a resolved project.
 *
 * The task command provides a unified way to execute deno tasks for projects
 * in a workspace from any parent context. It uses the ProjectResolver to
 * locate projects by package name, config path, or directory path.
 *
 * ## Resolution Logic
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. deno.json(c) path → load single project from config            │
 * │  2. Directory path → look for deno.json(c) in directory            │
 * │  3. Package name → search discovered projects for matching name    │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage Examples
 *
 * ```bash
 * # Run 'build' task for @fathym/cli package
 * ftm task @fathym/cli build
 *
 * # Run 'publish:check' task from a directory path
 * ftm task ./projects/ref-arch publish:check
 *
 * # Run 'ftm:release' task from explicit config path
 * ftm task ./projects/open-source/fathym-cli/deno.jsonc ftm:release
 * ```
 *
 * @example Run build task by package name
 * ```bash
 * ftm task @myorg/my-package build
 * ```
 *
 * @example Run task by directory path
 * ```bash
 * ftm task ./packages/my-package test
 * ```
 *
 * @example Dry run to see what would execute
 * ```bash
 * ftm task @myorg/my-package build --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../src/projects/ProjectResolver.ts';

/**
 * Zod schema for task command flags.
 *
 * @property dry-run - Preview what would run without executing
 */
const TaskFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
});

/**
 * Zod schema for task command positional arguments.
 *
 * Requires both a project reference and task name:
 * - Project reference: Package name, path to deno.json(c), or directory path
 * - Task name: The deno task to execute (e.g., 'build', 'test', 'dev')
 */
const TaskArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
  z
    .string()
    .describe('The deno task name to execute')
    .meta({ argName: 'task' }),
]);

/**
 * Typed parameter accessor for the task command.
 *
 * Provides getters for the project reference, task name, and dry-run flag.
 */
class TaskCommandParams extends CommandParams<
  z.infer<typeof TaskArgsSchema>,
  z.infer<typeof TaskFlagsSchema>
> {
  /** Project reference from first positional argument */
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  /** Task name from second positional argument */
  get TaskName(): string {
    return this.Arg(1)!;
  }

  /** Whether to preview without executing */
  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command('task', 'Run a deno task from a resolved project.')
  .Args(TaskArgsSchema)
  .Flags(TaskFlagsSchema)
  .Params(TaskCommandParams)
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
      const taskName = Params.TaskName;

      // Check if the task exists in the project
      if (!project.tasks || !Object.hasOwn(project.tasks, taskName)) {
        const availableTasks = project.tasks ? Object.keys(project.tasks) : [];
        if (availableTasks.length > 0) {
          Log.Error(
            `Task '${taskName}' not found in ${project.configPath}.\n` +
              `Available tasks:\n` +
              availableTasks.map((t) => `  - ${t}`).join('\n'),
          );
        } else {
          Log.Error(
            `Task '${taskName}' not found in ${project.configPath}.\n` +
              `No tasks are defined in this project.`,
          );
        }
        return 1;
      }

      if (Params.DryRun) {
        Log.Info(
          `Dry run: Would run 'deno task ${taskName}' in ${project.dir} (${project.configPath}).`,
        );
        return 0;
      }

      Log.Info(
        `Starting 'deno task ${taskName}' in ${project.dir} (${project.configPath}).`,
      );

      const cmd = new Deno.Command('deno', {
        args: ['task', taskName],
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
