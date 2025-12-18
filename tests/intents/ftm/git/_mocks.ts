import type { DFSFileHandler } from '@fathym/dfs';
import type { SelectOptions } from '@cliffy/prompt';
import {
  type GitRunOptions,
  type GitRunResult,
  GitService,
} from '../../../../src/services/GitService.ts';
import type { PromptService } from '../../../../src/services/PromptService.ts';
import { GitConfigStore, type GitDefaults } from '../../../../src/services/GitConfigStore.ts';
import { UrlOpener } from '../../../../src/services/UrlOpener.ts';

export function createMockDFS(): DFSFileHandler {
  return {
    Root: '/mock/repo',
  } as DFSFileHandler;
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
