/**
 * Fmt command - format project code with deno fmt.
 *
 * The projects:[projectRef]:fmt command provides a unified way to format code in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Format a project by package name
 * ftm projects @myorg/my-package fmt
 *
 * # Check formatting without modifying (for CI)
 * ftm projects @myorg/my-package fmt --check
 *
 * # Dry run to see what would execute
 * ftm projects @myorg/my-package fmt --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../src/projects/ProjectResolver.ts';

/**
 * Result data for the fmt command.
 */
export interface ProjectFmtResult {
  /** The project that was formatted */
  project: string;
  /** Whether formatting passed/succeeded */
  success: boolean;
  /** Exit code from deno fmt */
  exitCode: number;
  /** Whether --check mode was used */
  checkOnly: boolean;
}

/**
 * Segments schema for the fmt command.
 */
const FmtSegmentsSchema = z.object({
  projectRef: z.string().describe(
    'Project name, path to deno.json(c), or directory',
  ),
});

type FmtSegments = z.infer<typeof FmtSegmentsSchema>;

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
const FmtArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the fmt command.
 */
class FmtCommandParams extends CommandParams<
  z.infer<typeof FmtArgsSchema>,
  z.infer<typeof FmtFlagsSchema>,
  FmtSegments
> {
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
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
  'projects:[projectRef]:fmt',
  'Format project code with deno fmt.',
)
  .Args(FmtArgsSchema)
  .Flags(FmtFlagsSchema)
  .Segments(FmtSegmentsSchema)
  .Params(FmtCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
    };
  })
  .Run(
    async (
      { Params, Log, Services },
    ): Promise<CommandStatus<ProjectFmtResult>> => {
      const resolver = Services.ProjectResolver;
      const checkOnly = Params.Check;

      if (!Params.ProjectRef) {
        Log.Error('No project reference provided.');
        return {
          Code: 1,
          Message: 'No project reference provided',
          Data: { project: '', success: false, exitCode: 1, checkOnly },
        };
      }

      try {
        const projects = await resolver.Resolve(Params.ProjectRef);

        if (projects.length === 0) {
          Log.Error(`No projects found matching '${Params.ProjectRef}'.`);
          return {
            Code: 1,
            Message: `No projects found matching '${Params.ProjectRef}'`,
            Data: {
              project: Params.ProjectRef,
              success: false,
              exitCode: 1,
              checkOnly,
            },
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
            Data: {
              project: Params.ProjectRef,
              success: false,
              exitCode: 1,
              checkOnly,
            },
          };
        }

        const project = projects[0];
        const projectName = project.name ?? project.dir;

        if (Params.Verbose) {
          Log.Info(`Formatting ${projectName}...`);
        }

        const args = ['fmt'];
        if (checkOnly) {
          args.push('--check');
        }

        if (Params.DryRun) {
          Log.Info(
            `[DRY RUN] Would run: deno ${args.join(' ')} in ${project.dir}`,
          );
          return {
            Code: 0,
            Message: `[DRY RUN] Would format ${projectName}`,
            Data: {
              project: projectName,
              success: true,
              exitCode: 0,
              checkOnly,
            },
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
          Log.Info(`Formatting complete.`);
        }

        return {
          Code: code,
          Message: success
            ? `Formatting ${checkOnly ? 'check passed' : 'complete'} for ${projectName}`
            : `Formatting ${checkOnly ? 'check failed' : 'failed'} for ${projectName}`,
          Data: { project: projectName, success, exitCode: code, checkOnly },
        };
      } catch (error) {
        Log.Error(error instanceof Error ? error.message : String(error));
        return {
          Code: 1,
          Message: `Formatting failed: ${error instanceof Error ? error.message : String(error)}`,
          Data: {
            project: Params.ProjectRef,
            success: false,
            exitCode: 1,
            checkOnly,
          },
        };
      }
    },
  );
