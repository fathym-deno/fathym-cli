/**
 * PublishCheck command - validate a package is ready for publishing.
 *
 * The projects:[projectRef]:publish:check command runs `deno publish --dry-run --allow-dirty`
 * to validate that a package can be published without actually publishing it.
 *
 * ## Usage
 *
 * ```bash
 * # Check if a package is ready to publish
 * ftm projects @myorg/my-package publish check
 *
 * # Preview the command that would be run
 * ftm projects @myorg/my-package publish check --dry-run
 *
 * # Show detailed output
 * ftm projects @myorg/my-package publish check --verbose
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../../src/projects/ProjectResolver.ts';

/**
 * Segments schema for the publish:check command.
 */
const PublishCheckSegmentsSchema = z.object({
  projectRef: z.string().describe('Project name, path to deno.json(c), or directory'),
});

type PublishCheckSegments = z.infer<typeof PublishCheckSegmentsSchema>;

/**
 * Zod schema for publish:check command flags.
 */
const PublishCheckFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed output',
  ),
});

/**
 * Zod schema for publish:check command positional arguments.
 */
const PublishCheckArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the publish:check command.
 */
class PublishCheckParams extends CommandParams<
  z.infer<typeof PublishCheckArgsSchema>,
  z.infer<typeof PublishCheckFlagsSchema>,
  PublishCheckSegments
> {
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:[projectRef]:publish:check',
  'Validate a package is ready for publishing (dry-run publish).',
)
  .Args(PublishCheckArgsSchema)
  .Flags(PublishCheckFlagsSchema)
  .Segments(PublishCheckSegmentsSchema)
  .Params(PublishCheckParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
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
      const projectName = project.name ?? project.dir;

      const args = ['publish', '--dry-run', '--allow-dirty'];

      if (Params.DryRun) {
        Log.Info(
          `[DRY RUN] Would run: deno ${args.join(' ')} in ${project.dir}`,
        );
        return 0;
      }

      if (Params.Verbose) {
        Log.Info(`Checking publish readiness for ${projectName}...`);
        Log.Info(`Running: deno ${args.join(' ')}`);
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
        Log.Info(`Publish check passed for ${projectName}.`);
      }

      return code;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
