import { FathymApiClient } from './FathymApiClient.ts';

export type FathymGitHubOrganization = {
  Lookup: string;
  Name: string;
  Slug?: string;
};

export type FathymGitHubRepository = {
  Lookup: string;
  Name: string;
  Description?: string;
  DefaultBranch?: string;
};

export type FathymGitHubBranch = {
  Name: string;
  Protected?: boolean;
};

type OrganizationsResponse = {
  Model?: {
    GithubOrganizations?: FathymGitHubOrganization[];
  };
};

type RepositoriesResponse = {
  Model?: {
    GithubRepositories?: FathymGitHubRepository[];
  };
};

type BranchesResponse = {
  Model?: {
    GithubBranches?: FathymGitHubBranch[];
  };
};

/**
 * Thin wrapper around the Fathym API for listing GitHub-related metadata.
 *
 * The legacy CLI used Axios helpers for these lookups; this service gives
 * the new Deno CLI an equivalent abstraction on top of {@link FathymApiClient}.
 */
export class FathymGitHubLookupService {
  public constructor(private readonly api: FathymApiClient) {}

  public async ListOrganizations(): Promise<FathymGitHubOrganization[]> {
    const response = await this.api.GetJson<OrganizationsResponse>(
      '/github/organizations',
    );

    return response.Model?.GithubOrganizations ?? [];
  }

  public async ListRepositories(
    organizationLookup: string,
  ): Promise<FathymGitHubRepository[]> {
    const response = await this.api.GetJson<RepositoriesResponse>(
      `/github/organizations/${organizationLookup}/repositories`,
    );

    return response.Model?.GithubRepositories ?? [];
  }

  public async ListBranches(
    organizationLookup: string,
    repositoryLookup: string,
  ): Promise<FathymGitHubBranch[]> {
    const response = await this.api.GetJson<BranchesResponse>(
      `/github/organizations/${organizationLookup}/repositories/${repositoryLookup}/branches`,
    );

    return response.Model?.GithubBranches ?? [];
  }
}
