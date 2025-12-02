/**
 * Test command - run project tests with deno test.
 *
 * The projects:test command provides a unified way to run tests in a project.
 * It can be used standalone or as a building block in pipeline commands.
 *
 * ## Usage
 *
 * ```bash
 * # Run tests for a project by package name
 * ftm projects test @myorg/my-package
 *
 * # Run with coverage
 * ftm projects test @myorg/my-package --coverage
 *
 * # Dry run to see what would execute
 * ftm projects test @myorg/my-package --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

/**
 * Zod schema for test command flags.
 */
const TestFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed output',
  ),
  'coverage': z.boolean().optional().describe(
    'Collect coverage information',
  ),
});

/**
 * Zod schema for test command positional arguments.
 */
const TestArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the test command.
 */
class TestCommandParams extends CommandParams<
  z.infer<typeof TestArgsSchema>,
  z.infer<typeof TestFlagsSchema>
> {
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get Coverage(): boolean {
    return this.Flag('coverage') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:test',
  'Run project tests with deno test.',
)
  .Args(TestArgsSchema)
  .Flags(TestFlagsSchema)
  .Params(TestCommandParams)
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
        Log.Info(`Running tests for ${projectName}...`);
      }

      // Build test command args
      const args = ['test', '-A'];

      // Look for common test file patterns
      // Most projects use tests/tests.ts or tests/.tests.ts
      args.push('tests/');

      if (Params.Coverage) {
        args.push('--coverage=cov');
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
        Log.Info(`Tests complete.`);
      }

      return code;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
