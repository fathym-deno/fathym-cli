/**
 * Dev command - runs a project's `deno task dev` by name or path.
 *
 * The projects:dev command provides a unified way to start development servers
 * for projects in a workspace. It uses the ProjectResolver to locate projects
 * by package name, config path, or directory path.
 *
 * ## Resolution Logic
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. No argument → discover all projects, fail if multiple found    │
 * │  2. deno.json(c) path → load single project from config            │
 * │  3. Directory path → look for deno.json(c) in directory            │
 * │  4. Package name → search discovered projects for matching name    │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
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
 * @example Run dev task for single project in workspace
 * ```bash
 * ftm projects:dev
 * ```
 *
 * @example Run dev task by package name
 * ```bash
 * ftm projects:dev @myorg/my-package
 * ```
 *
 * @example Run dev task by directory path
 * ```bash
 * ftm projects:dev ./packages/my-package
 * ```
 *
 * @example Dry run to see what would execute
 * ```bash
 * ftm projects:dev @myorg/my-package --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

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
 *
 * Accepts an optional project reference which can be:
 * - Package name (e.g., `@myorg/my-package`)
 * - Path to deno.json(c) (e.g., `./packages/my-package/deno.jsonc`)
 * - Directory path (e.g., `./packages/my-package`)
 */
const DevArgsSchema = z.tuple([
  z
    .string()
    .optional()
    .describe(
      'Project name, path to deno.json(c), or directory to find projects',
    )
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the dev command.
 *
 * Provides getters for the project reference and dry-run flag.
 */
class DevCommandParams extends CommandParams<
  z.infer<typeof DevArgsSchema>,
  z.infer<typeof DevFlagsSchema>
> {
  /** Project reference from first positional argument */
  get ProjectRef(): string | undefined {
    return this.Arg(0);
  }

  /** Whether to preview without executing */
  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:dev',
  "Run a project's `deno task dev` by project name or path.",
)
  .Args(DevArgsSchema)
  .Flags(DevFlagsSchema)
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

    try {
      const projects = await resolver.Resolve(Params.ProjectRef);

      if (projects.length === 0) {
        Log.Error(
          Params.ProjectRef
            ? `No projects found matching '${Params.ProjectRef}'.`
            : 'No projects found in workspace.',
        );
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
