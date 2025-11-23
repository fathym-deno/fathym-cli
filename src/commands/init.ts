import { z } from '../../.deps.ts';
import { Command } from '../../fluent/Command.ts';
import { TemplateScaffolder } from '../../.exports.ts';
import { CommandParams } from '../../commands/CommandParams.ts';
import type { TemplateLocator } from '../../templates/TemplateLocator.ts';
import { CLIDFSContextManager } from '../../CLIDFSContextManager.ts';

// --- Schemas ---
const InitArgsSchema = z.tuple([
  z.string().optional().describe('Project name'),
]);

const InitFlagsSchema = z.object({
  template: z
    .string()
    .optional()
    .describe('Template to use (e.g. hello, web, api)'),

  baseTemplatesDir: z
    .string()
    .optional()
    .describe('Root directory for templates (default injected by CLI)'),

  targetDir: z
    .string()
    .optional()
    .describe('Where to scaffold the project (relative to execution DFS)'),
});

// --- Params Class ---
class InitParams extends CommandParams<
  z.infer<typeof InitArgsSchema>,
  z.infer<typeof InitFlagsSchema>
> {
  get Name(): string {
    const arg = this.Arg(0);
    return !arg || arg === '.' ? '.' : arg;
  }

  get Template(): string {
    return this.Flag('template') ?? 'hello';
  }

  get BaseTemplatesDir(): string | undefined {
    return this.Flag('baseTemplatesDir');
  }

  get TargetDir(): string | undefined {
    return this.Flag('targetDir');
  }
}

// --- Command ---
export default Command('init', 'Initialize a new CLI project')
  .Args(InitArgsSchema)
  .Flags(InitFlagsSchema)
  .Params(InitParams)
  .Services(async (ctx, ioc) => {
    const dfsCtxMgr = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.TargetDir) {
      await dfsCtxMgr.RegisterProjectDFS(ctx.Params.TargetDir, 'Target');
    }

    const buildDFS = ctx.Params.TargetDir
      ? await dfsCtxMgr.GetDFS('Target')
      : await dfsCtxMgr.GetExecutionDFS();

    return {
      BuildDFS: buildDFS,
      Scaffolder: new TemplateScaffolder(
        await ioc.Resolve<TemplateLocator>(ioc.Symbol('TemplateLocator')),
        buildDFS,
        { name: ctx.Params.Name },
      ),
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    const { Name, Template } = Params;

    await Services.Scaffolder.Scaffold({
      templateName: Template,
      outputDir: Name,
    });

    const fullPath = await Services.BuildDFS.ResolvePath(Name);

    Log.Success(`Project created from "${Template}" template.`);
    Log.Info(`📂 Initialized at: ${fullPath}`);
  });
