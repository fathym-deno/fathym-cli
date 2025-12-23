/**
 * git repos command - list available GitHub orgs/repos/branches from Fathym.
 *
 * This mirrors the legacy lookup helpers that powered `fathym git configure`,
 * exposing organization, repository, and branch metadata directly in the CLI.
 *
 * @module
 */

import { Command, type CommandLog, CommandParams, type CommandStatus } from '@fathym/cli';
import { z } from 'zod';
import {
  type FathymGitHubBranch,
  FathymGitHubLookupService,
  type FathymGitHubOrganization,
  type FathymGitHubRepository,
} from '../../src/services/.exports.ts';

const GitReposArgs = z.tuple([]);

const GitReposFlags = z.object({
  org: z
    .string()
    .optional()
    .describe('Organization lookup to inspect (e.g., fathym).'),
  repo: z
    .string()
    .optional()
    .describe('Repository lookup to inspect (requires --org).'),
});

class GitReposParams extends CommandParams<
  z.infer<typeof GitReposArgs>,
  z.infer<typeof GitReposFlags>
> {
  public get Organization(): string | undefined {
    return this.Flag('org');
  }

  public get Repository(): string | undefined {
    return this.Flag('repo');
  }
}

type GitReposServices = {
  Lookup: FathymGitHubLookupService;
};

type GitReposResult = {
  Organizations: FathymGitHubOrganization[];
  Repositories: FathymGitHubRepository[];
  Branches: FathymGitHubBranch[];
  Filters: {
    Organization?: string;
    Repository?: string;
  };
};

export default Command(
  'Git Repository Lookups',
  'List Fathym GitHub orgs/repos/branches',
)
  .Args(GitReposArgs)
  .Flags(GitReposFlags)
  .Params(GitReposParams)
  .Services(async (_ctx, ioc): Promise<GitReposServices> => {
    const lookup = await ioc.Resolve(FathymGitHubLookupService);
    return { Lookup: lookup };
  })
  .Run(
    async (
      { Services, Params, Log },
    ): Promise<CommandStatus<GitReposResult>> => {
      const organizations = await Services.Lookup.ListOrganizations();

      let repositories: FathymGitHubRepository[] = [];
      if (Params.Organization) {
        repositories = await Services.Lookup.ListRepositories(
          Params.Organization,
        );
      }

      let branches: FathymGitHubBranch[] = [];
      if (Params.Organization && Params.Repository) {
        branches = await Services.Lookup.ListBranches(
          Params.Organization,
          Params.Repository,
        );
      }

      const result: GitReposResult = {
        Organizations: organizations,
        Repositories: repositories,
        Branches: branches,
        Filters: {
          Organization: Params.Organization,
          Repository: Params.Repository,
        },
      };

      renderOrganizations(Log, organizations);

      if (Params.Organization) {
        renderRepositories(Log, Params.Organization, repositories);
      }

      if (Params.Organization && Params.Repository) {
        renderBranches(Log, Params.Organization, Params.Repository, branches);
      }

      Log.Info('');
      Log.Info('Next steps:');
      Log.Info('  - Run `ftm git configure -s` to provision a repository.');
      Log.Info(
        '  - Run `ftm git clone --target <path>` after configure completes.',
      );

      return {
        Code: 0,
        Message: 'GitHub lookup metadata retrieved.',
        Data: result,
      };
    },
  );

function renderOrganizations(
  Log: CommandLog,
  organizations: FathymGitHubOrganization[],
): void {
  if (organizations.length === 0) {
    Log.Warn('No GitHub organizations found for your account.');
    return;
  }

  Log.Info('Organizations:');
  for (const org of organizations) {
    Log.Info(`  - ${org.Name} (${org.Lookup})`);
  }
}

function renderRepositories(
  Log: CommandLog,
  orgLookup: string,
  repositories: FathymGitHubRepository[],
): void {
  if (repositories.length === 0) {
    Log.Warn(
      `No repositories returned for organization ${orgLookup}.`,
    );
    return;
  }

  Log.Info('');
  Log.Info(`Repositories under ${orgLookup}:`);
  for (const repo of repositories) {
    const description = repo.Description ? ` – ${repo.Description}` : '';
    Log.Info(`  - ${repo.Lookup}${description}`);
  }
}

function renderBranches(
  Log: CommandLog,
  orgLookup: string,
  repoLookup: string,
  branches: FathymGitHubBranch[],
): void {
  if (branches.length === 0) {
    Log.Warn(`No branches returned for ${orgLookup}/${repoLookup}.`);
    return;
  }

  Log.Info('');
  Log.Info(`Branches for ${orgLookup}/${repoLookup}:`);
  for (const branch of branches) {
    const protection = branch.Protected ? ' (protected)' : '';
    Log.Info(`  - ${branch.Name}${protection}`);
  }
}
