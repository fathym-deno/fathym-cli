/**
 * git feature command - create a feature branch from integration.
 *
 * Mirrors the legacy OCLIF workflow by:
 * 1. Verifying we're inside a git repo with a clean working tree
 * 2. Prompting (or accepting an arg) for the feature name
 * 3. Creating `feature/<name>` from `origin/integration`
 * 4. Pushing the branch and pruning remotes
 *
 * Flags allow overriding the base ref, skipping push, and dry-running.
 *
 * @module
 */

import {
  CLIDFSContextManager,
  Command,
  CommandParams,
  type CommandStatus,
} from "@fathym/cli";
import type { DFSFileHandler } from "@fathym/dfs";
import { z } from "zod";

/**
 * Result data for the git feature command.
 */
export interface GitFeatureResult {
  /** The branch that was created */
  branch: string;
  /** The base ref it was created from */
  baseRef: string;
  /** Whether the branch was pushed */
  pushed: boolean;
}
import {
  CliffyPromptService,
  type GitRunOptions,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
} from "../../src/services/.exports.ts";
import {
  EnsureBranchPrefix,
  GitTargetFlagSchema,
  NormalizeBranchInput,
  ResolveGitOpsWorkingDFS,
} from "../../src/git/.exports.ts";

const FeatureArgsSchema = z.tuple([
  z
    .string()
    .describe("Name for the feature branch (without prefix)")
    .optional()
    .meta({ argName: "name" }),
]);

const FeatureFlagsSchema = z.object({
  base: z
    .string()
    .optional()
    .describe("Base ref to branch from (default: 'origin/integration')"),
  "no-push": z.boolean().optional().describe(
    "Skip pushing the branch to origin",
  ),
  "dry-run": z.boolean().optional().describe(
    "Preview commands without executing them",
  ),
}).merge(GitTargetFlagSchema);

class FeatureCommandParams extends CommandParams<
  z.infer<typeof FeatureArgsSchema>,
  z.infer<typeof FeatureFlagsSchema>
> {
  get FeatureName(): string | undefined {
    return this.Arg(0);
  }

  get BaseRef(): string {
    return this.Flag("base") ?? "origin/integration";
  }

  get NoPush(): boolean {
    return this.Flag("no-push") ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag("dry-run") ?? false;
  }
}

type FeatureCommandServices = {
  DFS: DFSFileHandler;
  Git: GitService;
  Prompt: PromptService;
};

type FeaturePipelineContext = {
  cwd: string;
  git: GitService;
  prompt: PromptService;
  params: FeatureCommandParams;
  baseRef: string;
  branchName?: string;
};

export default Command(
  "Create Feature Branch",
  "Create a feature branch from origin/integration",
)
  .Args(FeatureArgsSchema)
  .Flags(FeatureFlagsSchema)
  .Params(FeatureCommandParams)
  .Services(async (_ctx, ioc): Promise<FeatureCommandServices> => {
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
  .Run(
    async (
      { Services, Params, Log },
    ): Promise<CommandStatus<GitFeatureResult>> => {
      const cwd = Services.DFS.Root ?? Deno.cwd();
      const git = Services.Git.WithLogger(Log);

      const ctx: FeaturePipelineContext = {
        cwd,
        git,
        prompt: Services.Prompt,
        params: Params,
        baseRef: Params.BaseRef,
      };

      await TaskPipeline.Run(ctx, buildTasks(), Log);

      return {
        Code: 0,
        Message: `Created feature branch ${ctx.branchName}`,
        Data: {
          branch: ctx.branchName!,
          baseRef: ctx.baseRef,
          pushed: !Params.NoPush,
        },
      };
    },
  );

function buildTasks(): TaskDefinition<FeaturePipelineContext>[] {
  return [
    {
      title: "Verify git repository",
      run: async (ctx) => {
        const isRepo = await ctx.git.IsRepository({ cwd: ctx.cwd });
        if (!isRepo) {
          throw new Error(
            "Not a git repository. Run inside a repository or set --config to target one.",
          );
        }
      },
    },
    {
      title: "Ensure clean working tree",
      run: async (ctx) => {
        const hasChanges = await ctx.git.HasUncommittedChanges({
          cwd: ctx.cwd,
        });
        if (hasChanges) {
          throw new Error(
            "Working tree has uncommitted changes. Run `ftm git` (or stash/commit) before creating a feature branch.",
          );
        }
      },
    },
    {
      title: "Determine feature branch name",
      run: async (ctx, runtime) => {
        let name = ctx.params.FeatureName?.trim();

        if (!name || name.length === 0) {
          if (ctx.params.DryRun) {
            name = "dry-run-feature";
          } else {
            name = (await ctx.prompt.Input(
              "What is the name of the feature branch?",
            )).trim();
          }
        }

        const normalized = NormalizeBranchInput(name);
        if (!normalized) {
          throw new Error("Feature branch name is required.");
        }

        ctx.branchName = EnsureBranchPrefix(normalized, "feature");
        runtime.UpdateTitle(`Using branch ${ctx.branchName}`);
      },
    },
    {
      title: "Create feature branch",
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(`Create feature branch ${ctx.branchName}`);
        await ctx.git.RunChecked(
          ["checkout", "-b", ctx.branchName!, ctx.baseRef],
          gitOptions(ctx),
        );
      },
    },
    {
      title: "Push feature branch to origin",
      skip: (ctx) => (ctx.params.NoPush ? "--no-push flag set" : false),
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(`Push ${ctx.branchName} to origin`);
        await ctx.git.PushWithUpstream(ctx.branchName!, gitOptions(ctx));
      },
    },
    {
      title: "Fetch prune",
      run: async (ctx) => {
        await ctx.git.RunChecked(["fetch", "--prune"], gitOptions(ctx));
      },
    },
  ];
}

function gitOptions(ctx: FeaturePipelineContext): GitRunOptions {
  return { cwd: ctx.cwd, dryRun: ctx.params.DryRun };
}
