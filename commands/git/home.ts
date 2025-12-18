/**
 * git home command - open the configured repository on GitHub.
 *
 * Mirrors the legacy workflow by:
 * 1. Resolving the organization/repository (args, config defaults, or local git)
 * 2. Prompting for any missing pieces
 * 3. Launching the browser to the requested section
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { z } from 'zod';
import {
  CliffyPromptService,
  GitConfigStore,
  type GitDefaults,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
  UrlOpener,
} from '../../src/services/.exports.ts';
import {
  type GitHubRemote,
  GitTargetFlagSchema,
  ResolveGitHubRemoteFromOrigin,
  ResolveGitOpsWorkingDFS,
} from '../../src/git/.exports.ts';

const GitHomeArgsSchema = z.tuple([
  z
    .string()
    .describe('GitHub organization (e.g., fathym)')
    .optional()
    .meta({ argName: 'organization' }),
  z
    .string()
    .describe('Repository name (e.g., ftm-eac-cli)')
    .optional()
    .meta({ argName: 'repository' }),
]);

const GitHomeFlagsSchema = z.object({
  section: z
    .string()
    .optional()
    .describe('Optional repository section to open (pulls, issues, settings, etc.)'),
  'use-local': z
    .boolean()
    .optional()
    .describe('Infer organization/repository from the local git remote'),
}).merge(GitTargetFlagSchema);

class GitHomeParams extends CommandParams<
  z.infer<typeof GitHomeArgsSchema>,
  z.infer<typeof GitHomeFlagsSchema>
> {
  get Organization(): string | undefined {
    return this.Arg(0);
  }

  get Repository(): string | undefined {
    return this.Arg(1);
  }

  get Section(): string | undefined {
    return this.Flag('section');
  }

  get UseLocal(): boolean {
    return this.Flag('use-local') ?? false;
  }
}

type GitHomeServices = {
  DFS: DFSFileHandler;
  Git: GitService;
  Config: GitConfigStore;
  Prompt: PromptService;
  Urls: UrlOpener;
};

type GitHomePipelineContext = {
  cwd: string;
  git: GitService;
  config: GitConfigStore;
  prompt: PromptService;
  opener: UrlOpener;
  params: GitHomeParams;
  defaults?: GitDefaults;
  remote?: GitHubRemote;
  organization?: string;
  repository?: string;
  finalUrl?: string;
};

type IoCResolver = {
  Resolve<T>(token: new (...args: never[]) => T): Promise<T>;
};

export default Command('Open Repo Home', 'Open the configured GitHub repository in your browser')
  .Args(GitHomeArgsSchema)
  .Flags(GitHomeFlagsSchema)
  .Params(GitHomeParams)
  .Services(async (_ctx, ioc): Promise<GitHomeServices> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const workingDFS = await ResolveGitOpsWorkingDFS(dfsCtx);

    const git = await resolveOrFallback(ioc, GitService, () => new GitService());
    const config = await resolveOrFallback(
      ioc,
      GitConfigStore,
      async () => new GitConfigStore(await dfsCtx.GetConfigDFS()),
    );
    const prompt = await resolveOrFallback(
      ioc,
      CliffyPromptService,
      () => new CliffyPromptService(),
    );
    const urls = await resolveOrFallback(ioc, UrlOpener, () => new UrlOpener());

    return {
      DFS: workingDFS,
      Git: git,
      Config: config,
      Prompt: prompt,
      Urls: urls,
    };
  })
  .Run(async ({ Services, Params, Log }) => {
    const cwd = Services.DFS.Root ?? Deno.cwd();
    const defaults = await Services.Config.GetDefaults();

    const ctx: GitHomePipelineContext = {
      cwd,
      git: Services.Git.WithLogger(Log),
      config: Services.Config,
      prompt: Services.Prompt,
      opener: Services.Urls,
      params: Params,
      defaults,
    };

    await TaskPipeline.Run(ctx, buildTasks(), Log);

    return 0;
  });

function buildTasks(): TaskDefinition<GitHomePipelineContext>[] {
  return [
    {
      title: 'Load local git remote',
      skip: (ctx) => (ctx.params.UseLocal ? false : '--use-local flag not set'),
      run: async (ctx, runtime) => {
        const isRepo = await ctx.git.IsRepository({ cwd: ctx.cwd });
        if (!isRepo) {
          throw new Error('Not a git repository. Use --use-local only inside a repository.');
        }

        const remote = await ResolveGitHubRemoteFromOrigin(ctx.git, { cwd: ctx.cwd });
        if (!remote) {
          throw new Error(
            'Unable to determine the origin remote. Provide --organization/--repository explicitly.',
          );
        }

        ctx.remote = remote;
        runtime.UpdateTitle(`Detected ${remote.organization}/${remote.repository}`);
      },
    },
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
        runtime.UpdateTitle(`Repository: ${ctx.repository}`);
      },
    },
    {
      title: 'Open GitHub home',
      run: async (ctx, runtime) => {
        if (!ctx.organization || !ctx.repository) {
          throw new Error('Organization and repository must be resolved before opening GitHub.');
        }

        ctx.finalUrl = buildRepositoryUrl(ctx.organization, ctx.repository, ctx.params.Section);
        await ctx.opener.Open(ctx.finalUrl);
        runtime.UpdateTitle(`Opened ${ctx.finalUrl}`);
      },
    },
  ];
}

async function resolveOrFallback<T>(
  ioc: IoCResolver,
  token: new (...args: never[]) => T,
  fallback: () => T | Promise<T>,
): Promise<T> {
  try {
    return await ioc.Resolve(token);
  } catch {
    return await fallback();
  }
}

async function resolveOrganization(ctx: GitHomePipelineContext): Promise<string> {
  const candidates = [
    ctx.params.Organization,
    ctx.remote?.organization,
    ctx.defaults?.organization,
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  const answer = (await ctx.prompt.Input('Which GitHub organization?')).trim();
  if (answer) {
    return answer;
  }

  throw new Error('GitHub organization is required.');
}

async function resolveRepository(ctx: GitHomePipelineContext): Promise<string> {
  const candidates = [
    ctx.params.Repository,
    ctx.remote?.repository,
    ctx.defaults?.repository,
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  const answer = (await ctx.prompt.Input('Which GitHub repository?')).trim();
  if (answer) {
    return answer;
  }

  throw new Error('GitHub repository is required.');
}

function buildRepositoryUrl(
  organization: string,
  repository: string,
  section?: string,
): string {
  const base = `https://github.com/${organization}/${repository}`;
  const sanitizedSection = sanitizeSection(section);
  return sanitizedSection ? `${base}/${sanitizedSection}` : base;
}

function sanitizeSection(section?: string): string {
  if (!section) {
    return '';
  }

  return section.replace(/^\/*/, '').trim();
}
