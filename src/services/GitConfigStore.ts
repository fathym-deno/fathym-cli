import type { DFSFileHandler } from "@fathym/dfs";

export interface GitDefaults {
  organization?: string;
  repository?: string;
}

export interface GitConfiguredRepo {
  organization: string;
  repository: string;
  configuredAt: string;
  metadata?: Record<string, unknown>;
}

export interface GitAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface GitConfigData {
  defaults?: GitDefaults;
  configuredRepos: Record<string, GitConfiguredRepo>;
  auth?: GitAuthToken;
}

const DEFAULT_CONFIG: GitConfigData = {
  configuredRepos: {},
};

/**
 * Persists git-related configuration under the CLI's ConfigDFS.
 *
 * This mirrors the legacy CLI's behavior of caching org/repo selections and
 * "configured" repo state, but leverages the workspace DFS abstraction so it
 * respects --config/--useHome flags.
 */
export class GitConfigStore {
  public constructor(
    protected readonly dfs: DFSFileHandler,
    protected readonly filePath = "git/config.json",
  ) {}

  /**
   * Load the config file (creating it with defaults if it doesn't exist).
   */
  public async Load(): Promise<GitConfigData> {
    return await this.loadConfig();
  }

  /**
   * Persist the config to disk (ensuring directories exist).
   */
  public async Save(config: GitConfigData): Promise<void> {
    await this.saveConfig(config);
  }

  /**
   * Convenience helper for read-modify-write flows.
   */
  public async Update(
    mutator: (config: GitConfigData) => void | Promise<void>,
  ): Promise<GitConfigData> {
    const config = await this.Load();
    await mutator(config);
    await this.Save(config);
    return config;
  }

  public async GetDefaults(): Promise<GitDefaults | undefined> {
    const config = await this.Load();
    return config.defaults;
  }

  public async SetDefaults(defaults: GitDefaults): Promise<void> {
    await this.Update((config) => {
      config.defaults = {
        ...config.defaults,
        ...defaults,
      };
    });
  }

  public async MarkConfigured(
    organization: string,
    repository: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.Update((config) => {
      const key = GitConfigStore.repoKey(organization, repository);
      config.configuredRepos[key] = {
        organization,
        repository,
        configuredAt: new Date().toISOString(),
        metadata,
      };
    });
  }

  public async IsConfigured(
    organization: string,
    repository: string,
  ): Promise<boolean> {
    const config = await this.Load();
    const key = GitConfigStore.repoKey(organization, repository);
    return Boolean(config.configuredRepos[key]);
  }

  public async SetAuthToken(token: GitAuthToken): Promise<void> {
    await this.Update((config) => {
      config.auth = token;
    });
  }

  public async GetAuthToken(): Promise<GitAuthToken | undefined> {
    const config = await this.Load();
    return config.auth;
  }

  protected static repoKey(org: string, repo: string): string {
    return `${org}/${repo}`.toLowerCase();
  }

  protected async loadConfig(): Promise<GitConfigData> {
    try {
      const file = await this.dfs.GetFileInfo(this.filePath);
      if (!file?.Contents) {
        return this.cloneDefaults();
      }

      const text = await new Response(file.Contents).text();
      const parsed = JSON.parse(text) as GitConfigData;
      return this.mergeWithDefaults(parsed);
    } catch {
      return this.cloneDefaults();
    }
  }

  protected async saveConfig(config: GitConfigData): Promise<void> {
    await this.dfs.WriteFile(this.filePath, JSON.stringify(config, null, 2));
  }

  protected mergeWithDefaults(config?: GitConfigData): GitConfigData {
    const merged: GitConfigData = {
      ...DEFAULT_CONFIG,
      ...config,
      configuredRepos: {
        ...DEFAULT_CONFIG.configuredRepos,
        ...(config?.configuredRepos ?? {}),
      },
    };

    if (config?.defaults) {
      merged.defaults = { ...config.defaults };
    }

    if (config?.auth) {
      merged.auth = { ...config.auth };
    }

    return merged;
  }

  protected cloneDefaults(): GitConfigData {
    return {
      ...DEFAULT_CONFIG,
      configuredRepos: { ...DEFAULT_CONFIG.configuredRepos },
    };
  }
}
