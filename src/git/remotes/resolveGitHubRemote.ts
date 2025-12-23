import type { GitRunOptions, GitService } from '../../services/GitService.ts';

export interface GitHubRemote {
  organization: string;
  repository: string;
}

/**
 * Attempt to resolve the GitHub organization/repository from the local `origin` remote.
 */
export async function ResolveGitHubRemoteFromOrigin(
  git: GitService,
  options: GitRunOptions = {},
): Promise<GitHubRemote | undefined> {
  try {
    const result = await git.Run(['remote', 'get-url', 'origin'], {
      ...options,
      allowFailure: true,
    });

    const remote = (result.stdout ?? '').trim();
    if (!remote) {
      return undefined;
    }

    const parsed = parseRemote(remote);
    if (!parsed) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

function parseRemote(remote: string): GitHubRemote | undefined {
  const githubMatch = remote.match(
    /github\.com[:/](?<org>[^/]+)\/(?<repo>.+?)(?:\.git)?$/i,
  );

  if (!githubMatch || !githubMatch.groups) {
    return undefined;
  }

  const organization = githubMatch.groups.org.trim();
  const repository = githubMatch.groups.repo.trim();

  if (!organization || !repository) {
    return undefined;
  }

  return {
    organization,
    repository,
  };
}
