import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

const DevFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe('Show what would run without executing'),
});

const DevArgsSchema = z.tuple([
  z
    .string()
    .optional()
    .describe('Project name, path to deno.json(c), or directory to find projects')
    .meta({ argName: 'project' }),
]);

class DevCommandParams extends CommandParams<
  z.infer<typeof DevArgsSchema>,
  z.infer<typeof DevFlagsSchema>
> {
  get ProjectRef(): string | undefined {
    return this.Arg(0);
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command('projects:dev', "Run a project's `deno task dev` by project name or path.")
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

      Log.Info(`Starting 'deno task dev' in ${project.dir} (${project.configPath}).`);

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
