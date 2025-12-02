/**
 * Lint command - lint project code with deno lint.
 *
 * The projects:lint command provides a unified way to lint code in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Lint a project by package name
 * ftm projects lint @myorg/my-package
 *
 * # Lint and auto-fix issues
 * ftm projects lint @myorg/my-package --fix
 *
 * # Dry run to see what would execute
 * ftm projects lint @myorg/my-package --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

/**
 * Zod schema for lint command flags.
 */
const LintFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed output',
  ),
  'fix': z.boolean().optional().describe(
    'Automatically fix lint issues where possible',
  ),
});

/**
 * Zod schema for lint command positional arguments.
 */
const LintArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the lint command.
 */
class LintCommandParams extends CommandParams<
  z.infer<typeof LintArgsSchema>,
  z.infer<typeof LintFlagsSchema>
> {
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get Fix(): boolean {
    return this.Flag('fix') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:lint',
  'Lint project code with deno lint.',
)
  .Args(LintArgsSchema)
  .Flags(LintFlagsSchema)
  .Params(LintCommandParams)
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
        Log.Info(`Linting ${projectName}...`);
      }

      const args = ['lint'];
      if (Params.Fix) {
        args.push('--fix');
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
        Log.Info(`Linting complete.`);
      }

      return code;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
