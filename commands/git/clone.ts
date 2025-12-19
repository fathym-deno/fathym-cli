/**
 * git clone command - clone a configured GitHub repository into the selected DFS root.
 *
 * Mirrors the legacy workflow by:
 * 1. Resolving organization/repository from args, config defaults, or prompts
 * 2. Enforcing the configure gate (unless --force is provided)
 * 3. Cloning via `git clone`, respecting optional branch/depth flags
 * 4. Returning a structured CommandStatus for JSON output / chaining
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { z } from 'zod';
import {
  CliffyPromptService,
  GitConfigStore,
  type GitDefaults,
  type GitRunOptions,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
} from '../../src/services/.exports.ts';
import { GitTargetFlagSchema, ResolveGitOpsWorkingDFS } from '../../src/git/.exports.ts';

const GitCloneArgsSchema = z.tuple([
  z
    .string()
    .describe('GitHub organization (e.g., fathym)')
    .optional()
    .meta({ argName: 'organization' }),
  z
    .string()
    .describe('Repository name (e.g., cli)')
    .optional()
    .meta({ argName: 'repository' }),
]);

const GitCloneFlagsSchema = z.object({
  branch: z
    .string()
    .optional()
    .describe('Branch to check out after cloning (defaults to the repo default branch)'),
  depth: z
    .coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe('Perform a shallow clone with the provided depth'),
  dir: z
    .string()
    .optional()
    .describe('Directory name relative to the target DFS root (defaults to the repository name)'),
  force: z
    .boolean()
    .optional()
    .describe('Bypass the configured-repo gate (unsafe unless you know the repo is provisioned)'),
  'dry-run': z
    .boolean()
    .optional()
    .describe('Preview git commands without running them'),
}).merge(GitTargetFlagSchema);

class GitCloneParams extends CommandParams<
  z.infer<typeof GitCloneArgsSchema>,
  z.infer<typeof GitCloneFlagsSchema>
> {
  public get Organization(): string | undefined {
    return this.Arg(0);
  }

  public get Repository(): string | undefined {
    return this.Arg(1);
  }

  public get Branch(): string | undefined {
    return this.Flag('branch');
  }

  public get Depth(): number | undefined {
    return this.Flag('depth');
  }

  public get Directory(): string | undefined {
    return this.Flag('dir');
  }

  public get Force(): boolean {
    return this.Flag('force') ?? false;
  }

  public override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

type GitCloneServices = {
  DFS: DFSFileHandler;
  Git: GitService;
  Config: GitConfigStore;
  Prompt: PromptService;
};

type GitClonePipelineContext = {
  dfs: DFSFileHandler;
  git: GitService;
  config: GitConfigStore;
  prompt: PromptService;
  params: GitCloneParams;
  defaults?: GitDefaults;
  cwd: string;
  organization?: string;
  repository?: string;
  branch?: string;
  destinationRelative?: string;
  destinationPath?: string;
  cloneUrl?: string;
  wasConfigured?: boolean;
};

type GitCloneResult = {
  organization: string;
  repository: string;
  branch?: string;
  destination: string;
  directory: string;
  url: string;
  configured: boolean;
  forced: boolean;
  dryRun: boolean;
};

export default Command(
  'Clone Repository',
  'Clone a configured GitHub repository into the target workspace',
)
  .Args(GitCloneArgsSchema)
  .Flags(GitCloneFlagsSchema)
  .Params(GitCloneParams)
  .Services(async (_ctx, ioc): Promise<GitCloneServices> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const workingDFS = await ResolveGitOpsWorkingDFS(dfsCtx);

    return {
      DFS: workingDFS,
      Git: await ioc.Resolve(GitService),
      Config: await ioc.Resolve(GitConfigStore),
      Prompt: await ioc.Resolve(CliffyPromptService),
    };
  })
  .Run(async ({ Services, Params, Log }): Promise<CommandStatus<GitCloneResult>> => {
    const cwd = Services.DFS.Root ?? Deno.cwd();
    const defaults = await Services.Config.GetDefaults();

    const ctx: GitClonePipelineContext = {
      dfs: Services.DFS,
      git: Services.Git.WithLogger(Log),
      config: Services.Config,
      prompt: Services.Prompt,
      params: Params,
      defaults,
      cwd,
      branch: Params.Branch?.trim(),
    };

    await TaskPipeline.Run(ctx, buildTasks(), Log);

    Log.Info('');
    Log.Info(`Cloned ${ctx.organization}/${ctx.repository} → ${ctx.destinationPath}`);
    Log.Info('Next steps:');
    Log.Info(`  - cd ${ctx.destinationRelative}`);
    Log.Info('  - Run `ftm git` regularly to stage, commit, and sync changes.');

    return {
      Code: 0,
      Message: `Cloned ${ctx.organization}/${ctx.repository}`,
      Data: {
        organization: ctx.organization!,
        repository: ctx.repository!,
        branch: ctx.branch,
        destination: ctx.destinationPath!,
        directory: ctx.destinationRelative!,
        url: ctx.cloneUrl!,
        configured: ctx.wasConfigured ?? false,
        forced: Params.Force,
        dryRun: Params.DryRun,
      },
    };
  });

function buildTasks(): TaskDefinition<GitClonePipelineContext>[] {
  return [
    {
      title: 'Resolve organization',
      run: async (ctx, runtime) => {
        ctx.organization = await resolveOrganization(ctx);
        runtime.UpdateTitle(`Organization: ${ctx.organization}`);
      },
    },
    {
      title: 'Resolve repository',
      run: async (ctx, runtime) => {
        ctx.repository = await resolveRepository(ctx);
        ctx.cloneUrl = buildCloneUrl(ctx.organization!, ctx.repository!);
        runtime.UpdateTitle(`Repository: ${ctx.repository}`);
      },
    },
    {
      title: 'Ensure repository configured',
      run: async (ctx, runtime) => {
        const configured = await ctx.config.IsConfigured(
          ctx.organization!,
          ctx.repository!,
        );

        ctx.wasConfigured = configured;

        if (!configured && !ctx.params.Force) {
          throw new Error(
            `Repository ${ctx.organization}/${ctx.repository} has not been configured. Run ` +
              '`ftm git configure -s` first or pass --force to bypass.',
          );
        }

        runtime.UpdateTitle(
          configured
            ? `Repository ${ctx.organization}/${ctx.repository} is configured`
            : 'Proceeding without configure (--force)',
        );
      },
    },
    {
      title: 'Determine destination directory',
      run: async (ctx, runtime) => {
        const dir = ctx.params.Directory?.trim();
        const folder = dir && dir.length > 0 ? dir : ctx.repository;

        if (!folder) {
          throw new Error('Destination directory could not be determined.');
        }

        ctx.destinationRelative = folder;
        ctx.destinationPath = await ctx.dfs.ResolvePath(folder);
        runtime.UpdateTitle(`Destination: ${ctx.destinationPath}`);
      },
    },
    {
      title: 'Clone repository',
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(`Clone repository ${ctx.organization}/${ctx.repository}`);
        await ctx.git.RunChecked(buildCloneArgs(ctx), gitOptions(ctx));
      },
    },
  ];
}

async function resolveOrganization(ctx: GitClonePipelineContext): Promise<string> {
  const candidates = [ctx.params.Organization, ctx.defaults?.organization];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  const answer = (await ctx.prompt.Input('Which GitHub organization should be cloned?')).trim();
  if (answer) {
    return answer;
  }

  throw new Error('GitHub organization is required.');
}

async function resolveRepository(ctx: GitClonePipelineContext): Promise<string> {
  const candidates = [ctx.params.Repository, ctx.defaults?.repository];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  const answer = (await ctx.prompt.Input('Which GitHub repository should be cloned?')).trim();
  if (answer) {
    return answer;
  }

  throw new Error('GitHub repository is required.');
}

function buildCloneUrl(organization: string, repository: string): string {
  return `https://github.com/${organization}/${repository}.git`;
}

function buildCloneArgs(ctx: GitClonePipelineContext): string[] {
  const args = ['clone'];

  if (ctx.params.Depth) {
    args.push('--depth', ctx.params.Depth.toString());
  }

  if (ctx.branch) {
    args.push('--branch', ctx.branch);
  }

  args.push(ctx.cloneUrl!, ctx.destinationPath!);

  return args;
}

function gitOptions(ctx: GitClonePipelineContext): GitRunOptions {
  return {
    cwd: ctx.cwd,
    dryRun: ctx.params.DryRun,
  };
}
