/**
 * git import command - mirror an external remote into the configured GitHub repository.
 *
 * Workflow:
 * 1. Resolve organization/repository/remote (args, defaults, or prompts)
 * 2. Enforce configure gate (unless --force)
 * 3. Clone the remote as a bare repo inside the target DFS root
 * 4. Push with --mirror into the configured GitHub repo
 * 5. Emit CommandStatus so JSON consumers receive mirror metadata
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
import {
  CliffyPromptService,
  GitConfigStore,
  type GitDefaults,
  type GitRunOptions,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
} from "../../src/services/.exports.ts";
import {
  GitTargetFlagSchema,
  ResolveGitOpsWorkingDFS,
} from "../../src/git/.exports.ts";

const GitImportArgsSchema = z.tuple([
  z
    .string()
    .describe("GitHub organization (e.g., fathym)")
    .optional()
    .meta({ argName: "organization" }),
  z
    .string()
    .describe("Repository name (e.g., cli)")
    .optional()
    .meta({ argName: "repository" }),
  z
    .string()
    .describe("Remote URL (e.g., https://github.com/.../.git)")
    .optional()
    .meta({ argName: "remote" }),
]);

const GitImportFlagsSchema = z.object({
  branch: z
    .string()
    .optional()
    .describe("Optional branch/tag to mirror (defaults to all refs)"),
  depth: z
    .coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("Perform a shallow clone with the provided depth"),
  dir: z
    .string()
    .optional()
    .describe(
      "Directory name for the bare clone (defaults to repository name)",
    ),
  force: z
    .boolean()
    .optional()
    .describe(
      "Bypass the configured-repo gate (unsafe unless you know the repo is provisioned)",
    ),
  "dry-run": z
    .boolean()
    .optional()
    .describe("Preview git commands without running them"),
}).merge(GitTargetFlagSchema);

class GitImportParams extends CommandParams<
  z.infer<typeof GitImportArgsSchema>,
  z.infer<typeof GitImportFlagsSchema>
> {
  public get Organization(): string | undefined {
    return this.Arg(0);
  }

  public get Repository(): string | undefined {
    return this.Arg(1);
  }

  public get Remote(): string | undefined {
    return this.Arg(2);
  }

  public get Branch(): string | undefined {
    return this.Flag("branch");
  }

  public get Depth(): number | undefined {
    return this.Flag("depth");
  }

  public get Directory(): string | undefined {
    return this.Flag("dir");
  }

  public get Force(): boolean {
    return this.Flag("force") ?? false;
  }

  public override get DryRun(): boolean {
    return this.Flag("dry-run") ?? false;
  }
}

type GitImportServices = {
  DFS: DFSFileHandler;
  Git: GitService;
  Config: GitConfigStore;
  Prompt: PromptService;
};

type GitImportPipelineContext = {
  dfs: DFSFileHandler;
  git: GitService;
  config: GitConfigStore;
  prompt: PromptService;
  params: GitImportParams;
  defaults?: GitDefaults;
  cwd: string;
  organization?: string;
  repository?: string;
  remote?: string;
  branch?: string;
  destinationRelative?: string;
  destinationPath?: string;
  targetUrl?: string;
  wasConfigured?: boolean;
};

type GitImportResult = {
  organization: string;
  repository: string;
  remote: string;
  branch?: string;
  destination: string;
  directory: string;
  targetUrl: string;
  configured: boolean;
  forced: boolean;
  dryRun: boolean;
};

export default Command(
  "Import Repository",
  "Mirror an external git remote into the configured GitHub repo",
)
  .Args(GitImportArgsSchema)
  .Flags(GitImportFlagsSchema)
  .Params(GitImportParams)
  .Services(async (_ctx, ioc): Promise<GitImportServices> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const workingDFS = await ResolveGitOpsWorkingDFS(dfsCtx);

    return {
      DFS: workingDFS,
      Git: await ioc.Resolve(GitService),
      Config: await ioc.Resolve(GitConfigStore),
      Prompt: await ioc.Resolve(CliffyPromptService),
    };
  })
  .Run(
    async (
      { Services, Params, Log },
    ): Promise<CommandStatus<GitImportResult>> => {
      const ctx: GitImportPipelineContext = {
        dfs: Services.DFS,
        git: Services.Git.WithLogger(Log),
        config: Services.Config,
        prompt: Services.Prompt,
        params: Params,
        defaults: await Services.Config.GetDefaults(),
        cwd: Services.DFS.Root ?? Deno.cwd(),
        branch: Params.Branch?.trim(),
      };

      await TaskPipeline.Run(ctx, buildTasks(), Log);

      Log.Info("");
      Log.Info(
        `Imported ${ctx.remote} → ${ctx.organization}/${ctx.repository}`,
      );
      Log.Info("Next steps:");
      Log.Info("  - Verify the mirrored repository on GitHub");
      Log.Info(
        "  - Run `ftm git configure -s` again if you need to adjust defaults.",
      );

      return {
        Code: 0,
        Message:
          `Imported ${ctx.remote} into ${ctx.organization}/${ctx.repository}`,
        Data: {
          organization: ctx.organization!,
          repository: ctx.repository!,
          remote: ctx.remote!,
          branch: ctx.branch,
          destination: ctx.destinationPath!,
          directory: ctx.destinationRelative!,
          targetUrl: ctx.targetUrl!,
          configured: ctx.wasConfigured ?? false,
          forced: Params.Force,
          dryRun: Params.DryRun,
        },
      };
    },
  );

function buildTasks(): TaskDefinition<GitImportPipelineContext>[] {
  return [
    {
      title: "Resolve organization",
      run: async (ctx, runtime) => {
        ctx.organization = await resolveOrganization(ctx);
        runtime.UpdateTitle(`Organization: ${ctx.organization}`);
      },
    },
    {
      title: "Resolve repository",
      run: async (ctx, runtime) => {
        ctx.repository = await resolveRepository(ctx);
        ctx.targetUrl =
          `https://github.com/${ctx.organization}/${ctx.repository}.git`;
        runtime.UpdateTitle(`Repository: ${ctx.repository}`);
      },
    },
    {
      title: "Ensure repository configured",
      run: async (ctx, runtime) => {
        const configured = await ctx.config.IsConfigured(
          ctx.organization!,
          ctx.repository!,
        );
        ctx.wasConfigured = configured;

        if (!configured && !ctx.params.Force) {
          throw new Error(
            `Repository ${ctx.organization}/${ctx.repository} has not been configured. Run ` +
              "`ftm git configure -s` first or pass --force to bypass.",
          );
        }

        runtime.UpdateTitle(
          configured
            ? `Repository ${ctx.organization}/${ctx.repository} is configured`
            : "Proceeding without configure (--force)",
        );
      },
    },
    {
      title: "Resolve remote to import",
      run: async (ctx, runtime) => {
        ctx.remote = await resolveRemote(ctx);
        runtime.UpdateTitle(`Remote: ${ctx.remote}`);
      },
    },
    {
      title: "Determine working directory",
      run: async (ctx, runtime) => {
        const folder = ctx.params.Directory?.trim() || ctx.repository;
        if (!folder) {
          throw new Error("Destination directory could not be determined.");
        }

        ctx.destinationRelative = folder;
        ctx.destinationPath = await ctx.dfs.ResolvePath(folder);
        runtime.UpdateTitle(`Destination: ${ctx.destinationPath}`);
      },
    },
    {
      title: "Clone remote as bare repository",
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(`Clone ${ctx.remote} as bare repository`);
        await ctx.git.RunChecked(buildCloneArgs(ctx), gitOptions(ctx));
      },
    },
    {
      title: "Push mirror to GitHub",
      run: async (ctx, runtime) => {
        runtime.UpdateTitle(
          `Push mirror to ${ctx.organization}/${ctx.repository}`,
        );
        await ctx.git.RunChecked(
          ["push", "--mirror", ctx.targetUrl!],
          gitOptions({ ...ctx, cwd: ctx.destinationPath! }),
        );
      },
    },
  ];
}

async function resolveOrganization(
  ctx: GitImportPipelineContext,
): Promise<string> {
  const candidates = [ctx.params.Organization, ctx.defaults?.organization];
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  const answer = (await ctx.prompt.Input(
    "Which GitHub organization should receive the mirror?",
  ))
    .trim();
  if (answer) {
    return answer;
  }

  throw new Error("GitHub organization is required.");
}

async function resolveRepository(
  ctx: GitImportPipelineContext,
): Promise<string> {
  const candidates = [ctx.params.Repository, ctx.defaults?.repository];
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  const answer = (await ctx.prompt.Input(
    "Which GitHub repository should receive the mirror?",
  ))
    .trim();
  if (answer) {
    return answer;
  }

  throw new Error("GitHub repository is required.");
}

async function resolveRemote(ctx: GitImportPipelineContext): Promise<string> {
  const candidate = ctx.params.Remote?.trim();
  if (candidate) {
    return candidate;
  }

  const answer =
    (await ctx.prompt.Input("Remote URL to import (HTTPS or SSH):")).trim();
  if (answer) {
    return answer;
  }

  throw new Error("Remote URL is required for git import.");
}

function buildCloneArgs(ctx: GitImportPipelineContext): string[] {
  const args = ["clone", "--bare"];

  if (ctx.params.Depth) {
    args.push("--depth", ctx.params.Depth.toString());
  }

  if (ctx.branch) {
    args.push("--branch", ctx.branch);
  }

  args.push(ctx.remote!, ctx.destinationPath!);

  return args;
}

function gitOptions(
  ctx:
    & Pick<GitImportPipelineContext, "cwd" | "params">
    & Partial<GitImportPipelineContext>,
): GitRunOptions {
  return {
    cwd: ctx.cwd,
    dryRun: ctx.params.DryRun,
  };
}
