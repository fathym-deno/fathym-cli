/**
 * git configure command - provision a repository via the Fathym backend.
 *
 * Mirrors the legacy `fathym git configure -s` workflow by:
 * 1. Resolving organization/repository via args, defaults, or prompts
 * 2. Selecting a license template
 * 3. Calling the backend configure endpoint
 * 4. Recording the configured repo inside `GitConfigStore`
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { z } from 'zod';
import {
  CliffyPromptService,
  FathymApiClient,
  FathymGitHubLookupService,
  type FathymGitHubOrganization,
  type FathymGitHubRepository,
  GitConfigStore,
  GitService,
  type PromptService,
  type TaskDefinition,
  TaskPipeline,
} from '../../src/services/.exports.ts';
import {
  type GitHubRemote,
  GitTargetFlagSchema,
  ResolveGitHubRemoteFromOrigin,
  ResolveGitOpsWorkingDFS,
} from '../../src/git/.exports.ts';

const GitConfigureArgsSchema = z.tuple([
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

const GitConfigureFlagsSchema = z.object({
  license: z
    .string()
    .optional()
    .describe('License template to apply (mit, apache, gpl3, or custom entry).'),
  'skip-local': z
    .boolean()
    .optional()
    .describe('Skip inferring organization/repository from the local git remote.'),
}).merge(GitTargetFlagSchema);

class GitConfigureParams extends CommandParams<
  z.infer<typeof GitConfigureArgsSchema>,
  z.infer<typeof GitConfigureFlagsSchema>
> {
  get Organization(): string | undefined {
    return this.Arg(0);
  }

  get Repository(): string | undefined {
    return this.Arg(1);
  }

  get License(): string | undefined {
    return this.Flag('license');
  }

  get SkipLocal(): boolean {
    return this.Flag('skip-local') ?? false;
  }
}

type GitConfigureServices = {
  DFS: DFSFileHandler;
  Git: GitService;
  Config: GitConfigStore;
  Prompt: PromptService;
  Lookup: FathymGitHubLookupService;
  Api: FathymApiClient;
};

type GitConfigureResult = {
  organization: string;
  repository: string;
  license?: string;
  configured: boolean;
  response?: Record<string, unknown>;
};

type GitConfigurePipelineContext = {
  cwd: string;
  git: GitService;
  config: GitConfigStore;
  prompt: PromptService;
  lookup: FathymGitHubLookupService;
  api: FathymApiClient;
  params: GitConfigureParams;
  defaults?: Awaited<ReturnType<GitConfigStore['GetDefaults']>>;
  remote?: GitHubRemote;
  organization?: string;
  repository?: string;
  license?: string;
  configureResponse?: Record<string, unknown>;
};

export default Command('Configure Repository', 'Provision a GitHub repository with Fathym defaults')
  .Args(GitConfigureArgsSchema)
  .Flags(GitConfigureFlagsSchema)
  .Params(GitConfigureParams)
  .Services(async (_ctx, ioc): Promise<GitConfigureServices> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const workingDFS = await ResolveGitOpsWorkingDFS(dfsCtx);

    const git = await ioc.Resolve(GitService);
    const config = await ioc.Resolve(GitConfigStore);
    const prompt = await ioc.Resolve(CliffyPromptService);
    const api = await ioc.Resolve(FathymApiClient);
    const lookup = await ioc.Resolve(FathymGitHubLookupService);

    return {
      DFS: workingDFS,
      Git: git,
      Config: config,
      Prompt: prompt,
      Lookup: lookup,
      Api: api,
    };
  })
  .Run(async ({ Services, Params, Log }): Promise<CommandStatus<GitConfigureResult>> => {
    const cwd = Services.DFS.Root ?? Deno.cwd();
    const defaults = await Services.Config.GetDefaults();

    const ctx: GitConfigurePipelineContext = {
      cwd,
      git: Services.Git.WithLogger(Log),
      config: Services.Config,
      prompt: Services.Prompt,
      lookup: Services.Lookup,
      api: Services.Api,
      params: Params,
      defaults,
    };

    await TaskPipeline.Run(ctx, buildTasks(), Log);

    if (!ctx.organization || !ctx.repository) {
      throw new Error('Organization and repository resolution failed.');
    }

    Log.Info('');
    Log.Info(`Configured repository: ${ctx.organization}/${ctx.repository}`);
    Log.Info('Next steps:');
    Log.Info('  - Run `ftm git clone --target <path>` to clone the repository.');
    Log.Info('  - Run `ftm git` regularly to keep your branch in sync.');

    return {
      Code: 0,
      Message: `Configured ${ctx.organization}/${ctx.repository}`,
      Data: {
        organization: ctx.organization,
        repository: ctx.repository,
        license: ctx.license,
        configured: true,
        response: ctx.configureResponse,
      },
    };
  });

function buildTasks(): TaskDefinition<GitConfigurePipelineContext>[] {
  return [
    {
      title: 'Detect local git remote',
      skip: (ctx) => (ctx.params.SkipLocal ? '--skip-local flag set' : false),
      run: async (ctx, runtime) => {
        const isRepo = await ctx.git.IsRepository({ cwd: ctx.cwd });
        if (!isRepo) {
          runtime.UpdateTitle('Detect local git remote (not a git repository)');
          return;
        }

        const remote = await ResolveGitHubRemoteFromOrigin(ctx.git, { cwd: ctx.cwd });
        if (remote) {
          ctx.remote = remote;
          runtime.UpdateTitle(`Detected ${remote.organization}/${remote.repository}`);
        } else {
          runtime.UpdateTitle('No origin remote found');
        }
      },
    },
    {
      title: 'Select organization',
      run: async (ctx, runtime) => {
        ctx.organization = await resolveOrganization(ctx);
        runtime.UpdateTitle(`Organization: ${ctx.organization}`);
      },
    },
    {
      title: 'Select repository',
      run: async (ctx, runtime) => {
        ctx.repository = await resolveRepository(ctx);
        runtime.UpdateTitle(`Repository: ${ctx.repository}`);
      },
    },
    {
      title: 'Select license',
      run: async (ctx, runtime) => {
        ctx.license = await resolveLicense(ctx);
        runtime.UpdateTitle(
          ctx.license ? `License template: ${ctx.license}` : 'License template: none',
        );
      },
    },
    {
      title: 'Configure repository',
      run: async (ctx, runtime) => {
        if (!ctx.organization || !ctx.repository) {
          throw new Error('Organization and repository must be resolved before configuring.');
        }

        const response = await ctx.api.PostJson<Record<string, unknown>, Record<string, unknown>>(
          `/github/organizations/${ctx.organization}/repositories/${ctx.repository}/configure`,
          { License: ctx.license ?? '' },
        );

        ctx.configureResponse = response;
        runtime.UpdateTitle(`Configured ${ctx.organization}/${ctx.repository}`);
      },
    },
    {
      title: 'Persist defaults',
      run: async (ctx, runtime) => {
        if (!ctx.organization || !ctx.repository) {
          return;
        }

        await ctx.config.SetDefaults({
          organization: ctx.organization,
          repository: ctx.repository,
        });

        await ctx.config.MarkConfigured(
          ctx.organization,
          ctx.repository,
          ctx.configureResponse,
        );

        runtime.UpdateTitle(
          `Defaults saved for ${ctx.organization}/${ctx.repository}`,
        );
      },
    },
  ];
}

async function resolveOrganization(ctx: GitConfigurePipelineContext): Promise<string> {
  const candidates = [
    ctx.params.Organization,
    ctx.defaults?.organization,
    ctx.params.SkipLocal ? undefined : ctx.remote?.organization,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  const list = await ctx.lookup.ListOrganizations();
  if (list.length === 0) {
    const answer = (await ctx.prompt.Input('Which GitHub organization?')).trim();
    if (answer) {
      return answer;
    }

    throw new Error('GitHub organization is required.');
  }

  const selection = await ctx.prompt.Select('Select a GitHub organization', {
    options: buildOrganizationOptions(ctx, list),
  });

  if (selection === '__custom__') {
    const custom = (await ctx.prompt.Input('Organization name:')).trim();
    if (!custom) {
      throw new Error('GitHub organization is required.');
    }
    return custom;
  }

  return selection;
}

async function resolveRepository(ctx: GitConfigurePipelineContext): Promise<string> {
  if (!ctx.organization) {
    throw new Error('Organization must be resolved before selecting a repository.');
  }

  const candidates = [
    ctx.params.Repository,
    ctx.defaults?.repository,
    ctx.params.SkipLocal ? undefined : ctx.remote?.repository,
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  const repos = await ctx.lookup.ListRepositories(ctx.organization);
  if (repos.length === 0) {
    const answer = (await ctx.prompt.Input('Which GitHub repository?')).trim();
    if (answer) {
      return answer;
    }

    throw new Error('GitHub repository is required.');
  }

  const selection = await ctx.prompt.Select('Select a GitHub repository', {
    options: buildRepositoryOptions(ctx, repos),
  });

  if (selection === '__custom__') {
    const custom = (await ctx.prompt.Input('Repository name:')).trim();
    if (!custom) {
      throw new Error('GitHub repository is required.');
    }

    return custom;
  }

  return selection;
}

async function resolveLicense(ctx: GitConfigurePipelineContext): Promise<string | undefined> {
  const provided = ctx.params.License?.trim();
  if (provided) {
    return provided;
  }

  const selection = await ctx.prompt.Select('Select license template', {
    options: [
      { name: 'MIT License', value: 'mit' },
      { name: 'Apache License 2.0', value: 'apache' },
      { name: 'GNU General Public License v3.0', value: 'gpl3' },
      { name: 'Enter custom template name', value: '__custom__' },
      { name: 'No template', value: '__none__' },
    ],
  });

  if (selection === '__custom__') {
    const custom = (await ctx.prompt.Input('License template name:')).trim();
    return custom || undefined;
  }

  if (selection === '__none__') {
    return undefined;
  }

  return selection;
}

function buildOrganizationOptions(
  ctx: GitConfigurePipelineContext,
  organizations: FathymGitHubOrganization[],
) {
  const options = organizations.map((org) => ({
    name: org.Name ?? org.Lookup,
    value: org.Lookup,
  }));

  if (!ctx.params.SkipLocal && ctx.remote?.organization) {
    const exists = options.find((opt) => opt.value === ctx.remote!.organization);
    if (!exists) {
      options.unshift({
        name: `Use local (${ctx.remote.organization})`,
        value: ctx.remote.organization,
      });
    }
  }

  options.push({ name: 'Enter a custom organization', value: '__custom__' });

  return options;
}

function buildRepositoryOptions(
  ctx: GitConfigurePipelineContext,
  repositories: FathymGitHubRepository[],
) {
  const options = repositories.map((repo) => ({
    name: repo.Name ?? repo.Lookup,
    value: repo.Lookup,
  }));

  if (!ctx.params.SkipLocal && ctx.remote?.repository) {
    const exists = options.find((opt) => opt.value === ctx.remote!.repository);
    if (!exists) {
      options.unshift({
        name: `Use local (${ctx.remote.repository})`,
        value: ctx.remote.repository,
      });
    }
  }

  options.push({ name: 'Enter a custom repository', value: '__custom__' });

  return options;
}
