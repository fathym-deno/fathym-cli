import type { DFSFileHandler } from "@fathym/dfs";

export interface AccessTokenData {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface UserAuthConfig {
  accessToken?: AccessTokenData;
  activeEnterpriseLookup?: string;
}

export interface SystemConfig {
  apiRoot: string;
}

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  apiRoot: "https://fcp-cli-stateflow.azurewebsites.net/api",
};

const DEFAULT_USER_CONFIG: UserAuthConfig = {};

type ConfigPaths = {
  system: string;
  user: string;
};

/**
 * Persists the shared Fathym CLI configuration (API root + auth tokens) under
 * the CLI's ConfigDFS using the provided DFS file handler.
 *
 * Mirrors the legacy `.lcu.system.json` + `user-auth.config.json` files so the
 * new CLI stays interoperable with the old Node-based tooling.
 */
export class FathymConfigStore {
  public constructor(
    protected readonly dfs: DFSFileHandler,
    protected readonly paths: ConfigPaths = {
      system: "lcu.system.json",
      user: "user-auth.config.json",
    },
  ) {}

  //#region System Config
  public async LoadSystem(): Promise<SystemConfig> {
    return await this.loadConfig<SystemConfig>(
      this.paths.system,
      DEFAULT_SYSTEM_CONFIG,
    );
  }

  public async UpdateSystem(
    mutator: (config: SystemConfig) => void | Promise<void>,
  ): Promise<SystemConfig> {
    return await this.updateConfig<SystemConfig>(
      this.paths.system,
      DEFAULT_SYSTEM_CONFIG,
      mutator,
    );
  }

  public async GetApiRoot(): Promise<string> {
    const config = await this.LoadSystem();
    return config.apiRoot || DEFAULT_SYSTEM_CONFIG.apiRoot;
  }

  public async SetApiRoot(root: string): Promise<void> {
    const normalized = root.trim();
    if (normalized.length === 0) {
      return;
    }

    await this.UpdateSystem((config) => {
      config.apiRoot = normalized;
    });
  }
  //#endregion

  //#region User Auth Config
  public async LoadUserAuth(): Promise<UserAuthConfig> {
    return await this.loadConfig<UserAuthConfig>(
      this.paths.user,
      DEFAULT_USER_CONFIG,
    );
  }

  public async UpdateUserAuth(
    mutator: (config: UserAuthConfig) => void | Promise<void>,
  ): Promise<UserAuthConfig> {
    return await this.updateConfig<UserAuthConfig>(
      this.paths.user,
      DEFAULT_USER_CONFIG,
      mutator,
    );
  }

  public async GetAccessToken(): Promise<AccessTokenData | undefined> {
    const config = await this.LoadUserAuth();
    return config.accessToken;
  }

  public async SetAccessToken(token?: AccessTokenData): Promise<void> {
    await this.UpdateUserAuth((config) => {
      config.accessToken = token;
    });
  }

  public async GetActiveEnterpriseLookup(): Promise<string | undefined> {
    const config = await this.LoadUserAuth();
    return config.activeEnterpriseLookup;
  }

  public async SetActiveEnterpriseLookup(lookup: string): Promise<void> {
    await this.UpdateUserAuth((config) => {
      config.activeEnterpriseLookup = lookup.trim();
    });
  }
  //#endregion

  protected async loadConfig<T>(path: string, defaults: T): Promise<T> {
    try {
      const info = await this.dfs.GetFileInfo(path);
      if (!info?.Contents) {
        return { ...defaults };
      }

      const text = await new Response(info.Contents).text();
      return {
        ...defaults,
        ...JSON.parse(text),
      } as T;
    } catch {
      return { ...defaults };
    }
  }

  protected async updateConfig<T>(
    path: string,
    defaults: T,
    mutator: (config: T) => void | Promise<void>,
  ): Promise<T> {
    const current = await this.loadConfig(path, defaults);
    await mutator(current);
    await this.saveConfig(path, current);
    return current;
  }

  protected async saveConfig(path: string, config: unknown): Promise<void> {
    await this.dfs.WriteFile(path, JSON.stringify(config, null, 2));
  }
}
