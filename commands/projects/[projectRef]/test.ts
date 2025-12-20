/**
 * Test command - run tests for a project with deno test.
 *
 * The projects:[projectRef]:test command provides a unified way to run tests in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Run tests for a project by package name
 * ftm projects @myorg/my-package test
 *
 * # Run tests with watch mode
 * ftm projects @myorg/my-package test --watch
 *
 * # Dry run to see what would execute
 * ftm projects @myorg/my-package test --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../src/projects/ProjectResolver.ts';

/**
 * Result data for the test command.
 */
export interface ProjectTestResult {
  /** The project that was tested */
  project: string;
  /** Whether tests passed */
  success: boolean;
  /** Exit code from deno test */
  exitCode: number;
}

/**
 * Segments schema for the test command.
 */
const TestSegmentsSchema = z.object({
  projectRef: z.string().describe('Project name, path to deno.json(c), or directory'),
});

type TestSegments = z.infer<typeof TestSegmentsSchema>;

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
  'watch': z.boolean().optional().describe(
    'Run in watch mode',
  ),
  'filter': z.string().optional().describe(
    'Filter tests by name pattern',
  ),
});

/**
 * Zod schema for test command positional arguments.
 */
const TestArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the test command.
 */
class TestCommandParams extends CommandParams<
  z.infer<typeof TestArgsSchema>,
  z.infer<typeof TestFlagsSchema>,
  TestSegments
> {
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get Watch(): boolean {
    return this.Flag('watch') ?? false;
  }

  get Filter(): string | undefined {
    return this.Flag('filter');
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:[projectRef]:test',
  'Run tests for a project with deno test.',
)
  .Args(TestArgsSchema)
  .Flags(TestFlagsSchema)
  .Segments(TestSegmentsSchema)
  .Params(TestCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
    };
  })
  .Run(async ({ Params, Log, Services }): Promise<CommandStatus<ProjectTestResult>> => {
    const resolver = Services.ProjectResolver;

    if (!Params.ProjectRef) {
      Log.Error('No project reference provided.');
      return {
        Code: 1,
        Message: 'No project reference provided',
        Data: { project: '', success: false, exitCode: 1 },
      };
    }

    try {
      const projects = await resolver.Resolve(Params.ProjectRef);

      if (projects.length === 0) {
        Log.Error(`No projects found matching '${Params.ProjectRef}'.`);
        return {
          Code: 1,
          Message: `No projects found matching '${Params.ProjectRef}'`,
          Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
        };
      }

      if (projects.length > 1) {
        Log.Error(
          `Found ${projects.length} projects. Please specify a single project:\n` +
            projects.map((p) => `  - ${p.name ?? p.dir}`).join('\n'),
        );
        return {
          Code: 1,
          Message: `Found ${projects.length} projects, please specify a single project`,
          Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
        };
      }

      const project = projects[0];
      const projectName = project.name ?? project.dir;

      if (Params.Verbose) {
        Log.Info(`Running tests for ${projectName}...`);
      }

      const args = ['test', '-A'];
      if (Params.Watch) {
        args.push('--watch');
      }
      if (Params.Filter) {
        args.push('--filter', Params.Filter);
      }

      if (Params.DryRun) {
        Log.Info(
          `[DRY RUN] Would run: deno ${args.join(' ')} in ${project.dir}`,
        );
        return {
          Code: 0,
          Message: `[DRY RUN] Would run tests for ${projectName}`,
          Data: { project: projectName, success: true, exitCode: 0 },
        };
      }

      const cmd = new Deno.Command('deno', {
        args,
        cwd: project.dir,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      });

      const { code } = await cmd.output();
      const success = code === 0;

      if (Params.Verbose && success) {
        Log.Info(`Tests complete.`);
      }

      return {
        Code: code,
        Message: success ? `Tests passed for ${projectName}` : `Tests failed for ${projectName}`,
        Data: { project: projectName, success, exitCode: code },
      };
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return {
        Code: 1,
        Message: `Tests failed: ${error instanceof Error ? error.message : String(error)}`,
        Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
      };
    }
  });
