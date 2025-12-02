/**
 * Check command - type check project code with deno check.
 *
 * The projects:check command provides a unified way to type check code in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Type check a project by package name
 * ftm projects check @myorg/my-package
 *
 * # Check all TypeScript files
 * ftm projects check @myorg/my-package --all
 *
 * # Dry run to see what would execute
 * ftm projects check @myorg/my-package --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

/**
 * Zod schema for check command flags.
 */
const CheckFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed output',
  ),
  'all': z.boolean().optional().describe(
    'Check all TypeScript files (not just entry points)',
  ),
});

/**
 * Zod schema for check command positional arguments.
 */
const CheckArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the check command.
 */
class CheckCommandParams extends CommandParams<
  z.infer<typeof CheckArgsSchema>,
  z.infer<typeof CheckFlagsSchema>
> {
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get All(): boolean {
    return this.Flag('all') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:check',
  'Type check project code with deno check.',
)
  .Args(CheckArgsSchema)
  .Flags(CheckFlagsSchema)
  .Params(CheckCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
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
      const projectName = project.name ?? project.dir;

      if (Params.Verbose) {
        Log.Info(`Type checking ${projectName}...`);
      }

      // Default to checking all .ts files if --all, otherwise check common entry points
      const args = ['check'];
      if (Params.All) {
        args.push('**/*.ts');
      } else {
        // Check common entry points - mod.ts, main.ts, or src/**/*.ts
        args.push('**/*.ts');
      }

      if (Params.DryRun) {
        Log.Info(
          `[DRY RUN] Would run: deno ${args.join(' ')} in ${project.dir}`,
        );
        return 0;
      }

      const cmd = new Deno.Command('deno', {
        args,
        cwd: project.dir,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      });

      const { code } = await cmd.output();

      if (Params.Verbose && code === 0) {
        Log.Info(`Type check complete.`);
      }

      return code;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
