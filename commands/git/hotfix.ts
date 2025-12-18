/**
 * git hotfix command - create a hotfix branch from main.
 *
 * Mirrors the legacy workflow by:
 * 1. Verifying we're inside a git repo with a clean working tree
 * 2. Prompting (or accepting an arg) for the hotfix name
 * 3. Creating `hotfix/<name>` from `origin/main` (override via --base)
 * 4. Pushing the branch (unless --no-push) and pruning remotes
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { z } from 'zod';
import { EnsureBranchPrefix, NormalizeBranchInput } from '../../src/git/.exports.ts';
import {
  CliffyPromptService,
  type GitRunOptions,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
} from '../../src/services/.exports.ts';

const HotfixArgsSchema = z.tuple([
  z
    .string()
    .describe('Name for the hotfix branch (without prefix)')
    .optional()
    .meta({ argName: 'name' }),
]);

const HotfixFlagsSchema = z.object({
  base: z
    .string()
    .optional()
    .describe("Base ref to branch from (default: 'origin/main')"),
  'no-push': z.boolean().optional().describe('Skip pushing the branch to origin'),
  'dry-run': z.boolean().optional().describe('Preview commands without executing them'),
});

class HotfixCommandParams extends CommandParams<
  z.infer<typeof HotfixArgsSchema>,
  z.infer<typeof HotfixFlagsSchema>
> {
  get HotfixName(): string | undefined {
    return this.Arg(0);
  }

  get BaseRef(): string {
    return this.Flag('base') ?? 'origin/main';
  }

  get NoPush(): boolean {
    return this.Flag('no-push') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

type HotfixCommandServices = {
  DFS?: DFSFileHandler;
  Git: GitService;
  Prompt: PromptService;
};

type HotfixPipelineContext = {
  cwd: string;
  git: GitService;
  prompt: PromptService;
  params: HotfixCommandParams;
  baseRef: string;
  branchName?: string;
};

export default Command('Create Hotfix Branch', 'Create a hotfix branch from origin/main')
  .Args(HotfixArgsSchema)
  .Flags(HotfixFlagsSchema)
  .Params(HotfixCommandParams)
  .Services(async (_ctx, ioc): Promise<HotfixCommandServices> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const executionDFS = await dfsCtx.GetExecutionDFS();

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
      DFS: executionDFS,
      Git: gitService,
      Prompt: promptService,
    };
  })
  .Run(async ({ Services, Params, Log }) => {
    const cwd = Services.DFS?.Root ?? Deno.cwd();
    const git = Services.Git.WithLogger(Log);

    const ctx: HotfixPipelineContext = {
      cwd,
      git,
      prompt: Services.Prompt,
      params: Params,
      baseRef: Params.BaseRef,
    };

    await TaskPipeline.Run(ctx, buildTasks(), Log);

    return 0;
  });

function buildTasks(): TaskDefinition<HotfixPipelineContext>[] {
  return [
    {
      title: 'Verify git repository',
      run: async (ctx) => {
        const isRepo = await ctx.git.IsRepository({ cwd: ctx.cwd });
        if (!isRepo) {
          throw new Error(
            'Not a git repository. Run inside a repository or set --config to target one.',
          );
        }
      },
    },
    {
      title: 'Ensure clean working tree',
      run: async (ctx) => {
        const hasChanges = await ctx.git.HasUncommittedChanges({ cwd: ctx.cwd });
        if (hasChanges) {
          throw new Error(
            'Working tree has uncommitted changes. Run `ftm git` (or stash/commit) before creating a hotfix branch.',
          );
        }
      },
    },
    {
      title: 'Determine hotfix branch name',
      run: async (ctx, runtime) => {
        let name = ctx.params.HotfixName?.trim();

        if (!name || name.length === 0) {
          if (ctx.params.DryRun) {
            name = 'dry-run-hotfix';
          } else {
            name = (await ctx.prompt.Input('What is the name of the hotfix branch?')).trim();
          }
        }

        const normalized = NormalizeBranchInput(name);
        if (!normalized) {
          throw new Error('Hotfix branch name is required.');
        }

        ctx.branchName = EnsureBranchPrefix(normalized, 'hotfix');
        runtime.UpdateTitle(`Using branch ${ctx.branchName}`);
      },
    },
    {
      title: 'Create hotfix branch',
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(`Create hotfix branch ${ctx.branchName}`);
        await ctx.git.RunChecked(
          ['checkout', '-b', ctx.branchName!, ctx.baseRef],
          gitOptions(ctx),
        );
      },
    },
    {
      title: 'Push hotfix branch to origin',
      skip: (ctx) => (ctx.params.NoPush ? '--no-push flag set' : false),
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(`Push ${ctx.branchName} to origin`);
        await ctx.git.PushWithUpstream(ctx.branchName!, gitOptions(ctx));
      },
    },
    {
      title: 'Fetch prune',
      run: async (ctx) => {
        await ctx.git.RunChecked(['fetch', '--prune'], gitOptions(ctx));
      },
    },
  ];
}

function gitOptions(ctx: HotfixPipelineContext): GitRunOptions {
  return { cwd: ctx.cwd, dryRun: ctx.params.DryRun };
}
