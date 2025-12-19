import type { CLIDFSContextManager } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import type { SelectOptions } from '@cliffy/prompt';
import {
  type GitRunOptions,
  type GitRunResult,
  GitService,
} from '../../../../src/services/GitService.ts';
import type { PromptService } from '../../../../src/services/PromptService.ts';
import {
  type AccessTokenData,
  FathymConfigStore,
  type FathymGitHubBranch,
  FathymGitHubLookupService,
  type FathymGitHubOrganization,
  type FathymGitHubRepository,
  GitConfigStore,
  type GitDefaults,
} from '../../../../src/services/.exports.ts';
import { FathymApiClient } from '../../../../src/services/FathymApiClient.ts';
import { UrlOpener } from '../../../../src/services/UrlOpener.ts';
import { RegisterGitOpsTargetDFS } from '../../../../src/git/.exports.ts';

export function createMockDFS(root: string = '/mock/repo'): DFSFileHandler {
  return {
    Root: root,
    ResolvePath: (...parts: string[]) => [root, ...parts].join('/'),
  } as DFSFileHandler;
}

export async function registerMockGitTargetDFS(
  dfsCtx: CLIDFSContextManager,
  root: string = '/mock/git-target',
): Promise<void> {
  await RegisterGitOpsTargetDFS(dfsCtx, root);
}

export type PromptResponses = {
  inputs?: string[];
  confirms?: boolean[];
  selects?: string[];
};

export class MockPromptService implements PromptService {
  public constructor(private readonly responses: PromptResponses = {}) {}

  public Input(): Promise<string> {
    if (this.responses.inputs?.length) {
      return Promise.resolve(this.responses.inputs.shift()!);
    }

    return Promise.resolve('Mock input');
  }

  public Confirm(): Promise<boolean> {
    if (this.responses.confirms?.length) {
      return Promise.resolve(this.responses.confirms.shift()!);
    }

    return Promise.resolve(true);
  }

  public Select<T extends string>(
    _message: string,
    options: Omit<SelectOptions<T>, 'message'>,
  ): Promise<T> {
    if (this.responses.selects?.length) {
      return Promise.resolve(this.responses.selects.shift() as T);
    }

    return Promise.resolve(MockPromptService.firstOption(options));
  }

  private static firstOption<T extends string>(
    options: Omit<SelectOptions<T>, 'message'>,
  ): T {
    const opts = (options as SelectOptions<T>).options ?? [];

    for (const option of opts) {
      if (typeof option === 'string') {
        return option as T;
      }

      if (typeof option === 'number') {
        return String(option) as T;
      }

      if (typeof option === 'object' && option) {
        if ('type' in option && option.type === 'separator') {
          continue;
        }

        if ('options' in option && Array.isArray(option.options)) {
          return MockPromptService.firstOption({
            ...options,
            options: option.options,
          } as Omit<SelectOptions<T>, 'message'>);
        }

        if ('value' in option) {
          return option.value as T;
        }
      }
    }

    throw new Error('No select options provided for mock prompt.');
  }
}

export type GitMockOptions = {
  isRepo?: boolean;
  hasChanges?: boolean;
  branch?: string;
  remoteExists?: boolean;
  remoteUrl?: string;
};

export class MockGitService extends GitService {
  private readonly remoteBranches = new Set<string>();

  public constructor(private readonly opts: GitMockOptions = {}) {
    super();

    const branch = this.opts.branch ?? 'feature/mock';
    if (this.opts.remoteExists !== false) {
      this.remoteBranches.add(branch);
    }
  }

  public override IsRepository(): Promise<boolean> {
    return Promise.resolve(this.opts.isRepo ?? true);
  }

  public override CurrentBranch(): Promise<string> {
    return Promise.resolve(this.opts.branch ?? 'feature/mock');
  }

  public override HasUncommittedChanges(): Promise<boolean> {
    return Promise.resolve(this.opts.hasChanges ?? false);
  }

  public override Run(
    args: string[],
    options: GitRunOptions = {},
  ): Promise<GitRunResult> {
    if (args[0] === 'remote' && args[1] === 'get-url') {
      const stdout = this.opts.remoteUrl ?? 'https://github.com/fathym/mock.git';

      return Promise.resolve({
        stdout,
        stderr: '',
        success: true,
        code: 0,
      });
    }

    if (options.dryRun) {
      this.logger?.Info?.(`[dry-run] git ${args.join(' ')}`);
    }

    if (args[0] === 'push' && args.includes('--set-upstream')) {
      const branch = args.at(-1);
      if (branch) {
        this.remoteBranches.add(branch);
      }
    } else if (args[0] === 'push' && args[1] === 'origin') {
      const branch = args.at(-1);
      if (branch) {
        this.remoteBranches.add(branch);
      }
    }

    return Promise.resolve({ stdout: '', stderr: '', success: true, code: 0 });
  }

  public override RunChecked(
    args: string[],
    options: GitRunOptions = {},
  ): Promise<GitRunResult> {
    return this.Run(args, options);
  }

  public override RemoteBranchExists(
    branch: string,
    _options: GitRunOptions = {},
  ): Promise<boolean> {
    return Promise.resolve(this.remoteBranches.has(branch));
  }

  public override PushWithUpstream(
    branch: string,
    options: GitRunOptions = {},
  ): Promise<void> {
    if (!this.remoteBranches.has(branch)) {
      this.remoteBranches.add(branch);
      return this.Run(['push', '--set-upstream', 'origin', branch], options).then(
        () => undefined,
      );
    }

    return this.Run(['push', 'origin', branch], options).then(() => undefined);
  }

  public override EnsureUpstream(
    branch: string,
    options: GitRunOptions = {},
  ): Promise<void> {
    if (this.remoteBranches.has(branch)) {
      return Promise.resolve();
    }

    return this.Run(['push', '--set-upstream', 'origin', branch], options).then(
      () => undefined,
    );
  }
}

export class MockGitConfigStore extends GitConfigStore {
  public constructor(private readonly defaults?: GitDefaults) {
    super({} as DFSFileHandler);
  }

  public override GetDefaults(): Promise<GitDefaults | undefined> {
    return Promise.resolve(this.defaults);
  }
}

export class MockUrlOpener extends UrlOpener {
  public opened: string[] = [];

  public override Open(url: string): Promise<void> {
    this.opened.push(url);
    return Promise.resolve();
  }
}

type MockFathymConfigOptions = {
  activeLookup?: string;
  apiRoot?: string;
  token?: AccessTokenData;
};

export class MockFathymConfigStore extends FathymConfigStore {
  public constructor(private readonly options: MockFathymConfigOptions = {}) {
    super({} as DFSFileHandler);
  }

  public override GetActiveEnterpriseLookup(): Promise<string | undefined> {
    return Promise.resolve(this.options.activeLookup);
  }

  public override SetActiveEnterpriseLookup(lookup: string): Promise<void> {
    this.options.activeLookup = lookup;
    return Promise.resolve();
  }

  public override GetApiRoot(): Promise<string> {
    return Promise.resolve(this.options.apiRoot ?? 'https://api.fathym.com/');
  }

  public override GetAccessToken(): Promise<AccessTokenData | undefined> {
    return Promise.resolve(this.options.token);
  }

  public override SetAccessToken(token?: AccessTokenData): Promise<void> {
    this.options.token = token;
    return Promise.resolve();
  }
}

export class MockFathymApiClient extends FathymApiClient {
  public requests: string[] = [];
  public responses = new Map<string, unknown>();

  public constructor() {
    // Pass a mock store but it won't be used since tests override GetJson directly
    super(new MockFathymConfigStore());
  }

  public override GetJson<T>(path: string): Promise<T> {
    this.requests.push(path);
    if (!this.responses.has(path)) {
      throw new Error(`No mock response for ${path}`);
    }

    return Promise.resolve(this.responses.get(path) as T);
  }
}

type MockLookupOptions = {
  organizations?: FathymGitHubOrganization[];
  repositories?: Record<string, FathymGitHubRepository[]>;
  branches?: Record<string, FathymGitHubBranch[]>;
};

export class MockFathymGitHubLookupService extends FathymGitHubLookupService {
  public constructor(private readonly options: MockLookupOptions = {}) {
    super({} as FathymApiClient);
  }

  public override ListOrganizations(): Promise<FathymGitHubOrganization[]> {
    return Promise.resolve(this.options.organizations ?? []);
  }

  public override ListRepositories(
    organizationLookup: string,
  ): Promise<FathymGitHubRepository[]> {
    const key = organizationLookup.toLowerCase();
    return Promise.resolve(this.options.repositories?.[key] ?? []);
  }

  public override ListBranches(
    organizationLookup: string,
    repositoryLookup: string,
  ): Promise<FathymGitHubBranch[]> {
    const key = `${organizationLookup}/${repositoryLookup}`.toLowerCase();
    return Promise.resolve(this.options.branches?.[key] ?? []);
  }
}
