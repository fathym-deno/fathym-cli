/**
 * Fmt command - format project code with deno fmt.
 *
 * The projects:fmt command provides a unified way to format code in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Format a project by package name
 * ftm projects fmt @myorg/my-package
 *
 * # Check formatting without modifying (for CI)
 * ftm projects fmt @myorg/my-package --check
 *
 * # Dry run to see what would execute
 * ftm projects fmt @myorg/my-package --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

/**
 * Zod schema for fmt command flags.
 */
const FmtFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed output',
  ),
  'check': z.boolean().optional().describe(
    'Check formatting without modifying files',
  ),
});

/**
 * Zod schema for fmt command positional arguments.
 */
const FmtArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the fmt command.
 */
class FmtCommandParams extends CommandParams<
  z.infer<typeof FmtArgsSchema>,
  z.infer<typeof FmtFlagsSchema>
> {
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get Check(): boolean {
    return this.Flag('check') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:fmt',
  'Format project code with deno fmt.',
)
  .Args(FmtArgsSchema)
  .Flags(FmtFlagsSchema)
  .Params(FmtCommandParams)
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
        Log.Info(`Formatting ${projectName}...`);
      }

      const args = ['fmt'];
      if (Params.Check) {
        args.push('--check');
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
        Log.Info(`Formatting complete.`);
      }

      return code;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
