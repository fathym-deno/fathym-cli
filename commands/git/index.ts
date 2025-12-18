/**
 * git command - commit local changes and sync with integration.
 *
 * This command replaces the legacy `fathym git` workflow:
 * 1. Validate that the current directory is a git repository
 * 2. Stage and commit pending changes (prompting for a commit message)
 * 3. Fetch origin and merge or rebase `origin/integration`
 * 4. Pull the current branch (creating/updating upstream if required)
 * 5. Push changes to origin and prune remote refs
 *
 * Flags allow rebase vs merge, disabling sync/push, and running in dry-run mode.
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { z } from 'zod';
import {
  CliffyPromptService,
  type GitRunOptions,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
} from '../../src/services/.exports.ts';
import { GitTargetFlagSchema, ResolveGitOpsWorkingDFS } from '../../src/git/.exports.ts';

const ArgsSchema = z.tuple([]);

const FlagsSchema = z
  .object({
    message: z.string().optional().describe('Commit message to use'),
    rebase: z.boolean().optional().describe('Rebase onto origin/integration instead of merging'),
    'dry-run': z.boolean().optional().describe('Print commands without executing them'),
    'no-push': z.boolean().optional().describe('Skip pushing to origin'),
    'no-sync': z.boolean().optional().describe('Skip integration sync (fetch/merge/pull/prune)'),
  })
  .merge(GitTargetFlagSchema)
  .passthrough();

class GitParams extends CommandParams<
  z.infer<typeof ArgsSchema>,
  z.infer<typeof FlagsSchema>
> {
  get Message(): string | undefined {
    return this.Flag('message');
  }

  get Rebase(): boolean {
    return this.Flag('rebase') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }

  get NoPush(): boolean {
    return this.Flag('no-push') ?? false;
  }

  get NoSync(): boolean {
    return this.Flag('no-sync') ?? false;
  }
}

type GitCommandServices = {
  DFS: DFSFileHandler;
  Git: GitService;
  Prompt: PromptService;
};

type GitPipelineContext = {
  cwd: string;
  git: GitService;
  prompt: PromptService;
  params: GitParams;
  currentBranch?: string;
  hasChanges?: boolean;
  commitMessage?: string;
};

export default Command('Git Workflow', 'Commit changes and sync with integration')
  .Args(ArgsSchema)
  .Flags(FlagsSchema)
  .Params(GitParams)
  .Services(async (_ctx, ioc): Promise<GitCommandServices> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const workingDFS = await ResolveGitOpsWorkingDFS(dfsCtx);

    let gitService: GitService;
    try {
      gitService = await ioc.Resolve(GitService);
    } catch {
      gitService = new GitService();
    }

    let promptService: PromptService;
    try {
      promptService = await ioc.Resolve(CliffyPromptService);
    } catch {
      promptService = new CliffyPromptService();
    }

    return {
      DFS: workingDFS,
      Git: gitService,
      Prompt: promptService,
    };
  })
  .Run(async ({ Services, Log, Params }) => {
    const cwd = Services.DFS.Root ?? Deno.cwd();
    const git = Services.Git.WithLogger(Log);

    const ctx: GitPipelineContext = {
      cwd,
      git,
      prompt: Services.Prompt,
      params: Params,
    };

    await TaskPipeline.Run(ctx, buildTasks(), Log);

    return 0;
  });

function buildTasks(): TaskDefinition<GitPipelineContext>[] {
  return [
    {
      title: 'Verify git repository',
      run: async (ctx, runtime) => {
        const isRepo = await ctx.git.IsRepository({ cwd: ctx.cwd });
        if (!isRepo) {
          throw new Error(
            'Not a git repository. Run inside a repository or set --config to target one.',
          );
        }

        ctx.currentBranch = await ctx.git.CurrentBranch({ cwd: ctx.cwd });
        runtime.UpdateTitle(`On branch ${ctx.currentBranch}`);
      },
    },
    {
      title: 'Commit local changes',
      skip: async (ctx) => {
        ctx.hasChanges = await ctx.git.HasUncommittedChanges({ cwd: ctx.cwd });
        return ctx.hasChanges ? false : 'No changes detected';
      },
      run: async (ctx, runtime) => {
        await ctx.git.RunChecked(['add', '-A'], gitOptions(ctx));

        const message = ctx.params.Message ??
          (ctx.params.DryRun ? 'dry-run commit' : await ctx.prompt.Input('Enter commit message'));

        ctx.commitMessage = message;
        await ctx.git.RunChecked(['commit', '-m', message], gitOptions(ctx));
        runtime.UpdateTitle(`Committed (${message})`);
      },
    },
    {
      title: 'Fetch from origin',
      skip: (ctx) => syncSkip(ctx, '--no-sync flag set'),
      run: async (ctx) => {
        await ctx.git.RunChecked(['fetch', '--all'], gitOptions(ctx));
      },
    },
    {
      title: 'Sync with integration',
      skip: (ctx) => syncSkip(ctx, '--no-sync flag set'),
      run: async (ctx, runtime) => {
        const action = ctx.params.Rebase
          ? ['rebase', 'origin/integration']
          : ['merge', 'origin/integration'];

        await ctx.git.RunChecked(action, gitOptions(ctx));
        runtime.UpdateTitle(
          ctx.params.Rebase ? 'Rebased onto origin/integration' : 'Merged origin/integration',
        );
      },
    },
    {
      title: 'Pull latest changes',
      skip: (ctx) => syncSkip(ctx, '--no-sync flag set'),
      run: async (ctx) => {
        await ctx.git.EnsureUpstream(ctx.currentBranch!, gitOptions(ctx));
        await ctx.git.RunChecked(['pull'], gitOptions(ctx));
      },
    },
    {
      title: 'Push to origin',
      skip: (ctx) => (ctx.params.NoPush ? '--no-push flag set' : false),
      run: async (ctx) => {
        await ctx.git.PushWithUpstream(ctx.currentBranch!, gitOptions(ctx));
      },
    },
    {
      title: 'Fetch prune',
      skip: (ctx) => syncSkip(ctx, '--no-sync flag set'),
      run: async (ctx) => {
        await ctx.git.RunChecked(['fetch', '--prune'], gitOptions(ctx));
      },
    },
  ];
}

function gitOptions(ctx: GitPipelineContext): GitRunOptions {
  return { cwd: ctx.cwd, dryRun: ctx.params.DryRun };
}

function syncSkip(
  ctx: GitPipelineContext,
  reason: string,
): boolean | string {
  return ctx.params.NoSync ? reason : false;
}
