/**
 * Thin wrapper around `git` subprocess execution.
 *
 * Provides helpers for dry-run logging, capturing output, and common git queries.
 */
export class GitService {
  public constructor(protected logger?: GitLogger) {}

  /**
   * Attach a logger to this GitService instance.
   */
  public WithLogger(logger: GitLogger): this {
    this.logger = logger;
    return this;
  }

  /**
   * Run a git command. Use `RunChecked` if you want failures to throw.
   */
  public async Run(args: string[], options: GitRunOptions = {}): Promise<GitRunResult> {
    const cmdText = `git ${args.join(' ')}`;
    if (options.dryRun) {
      this.logger?.Info?.(`[dry-run] ${cmdText}`);
      return {
        stdout: '',
        stderr: '',
        success: true,
        code: 0,
      };
    }

    const command = new Deno.Command('git', {
      args,
      cwd: options.cwd,
      stdin: options.stdin ?? 'null',
      stdout: options.stdout ?? 'piped',
      stderr: options.stderr ?? 'piped',
      env: options.env,
    });

    const result = await command.output();
    const decoder = new TextDecoder();

    const formatted: GitRunResult = {
      stdout: result.stdout ? decoder.decode(result.stdout).trim() : '',
      stderr: result.stderr ? decoder.decode(result.stderr).trim() : '',
      success: result.success,
      code: result.code,
    };

    if (!result.success && !options.allowFailure) {
      throw new GitCommandError(cmdText, formatted);
    }

    return formatted;
  }

  /**
   * Run a git command and throw if it fails.
   */
  public async RunChecked(
    args: string[],
    options: GitRunOptions = {},
  ): Promise<GitRunResult> {
    return await this.Run(args, { ...options, allowFailure: false });
  }

  /**
   * Execute a git command and return trimmed stdout.
   */
  public async Output(args: string[], options: GitRunOptions = {}): Promise<string> {
    const result = await this.RunChecked(args, options);
    return result.stdout;
  }

  /**
   * Determine if the current directory is inside a git repository.
   */
  public async IsRepository(options: GitRunOptions = {}): Promise<boolean> {
    try {
      await this.RunChecked(['rev-parse', '--is-inside-work-tree'], options);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current branch name.
   */
  public async CurrentBranch(options: GitRunOptions = {}): Promise<string> {
    const result = await this.Output(['rev-parse', '--abbrev-ref', 'HEAD'], options);
    return result.trim();
  }

  /**
   * Check if there are staged or unstaged changes.
   */
  public async HasUncommittedChanges(options: GitRunOptions = {}): Promise<boolean> {
    const result = await this.Output(['status', '--porcelain'], options);
    return result.trim().length > 0;
  }

  /**
   * Determine whether the given branch exists on origin.
   */
  public async RemoteBranchExists(branch: string, options: GitRunOptions = {}): Promise<boolean> {
    const result = await this.Run(['ls-remote', '--heads', 'origin', branch], {
      ...options,
      allowFailure: true,
    });
    return result.stdout.trim().length > 0;
  }

  /**
   * Convenience helper to push with upstream auto-creation.
   */
  public async PushWithUpstream(branch: string, options: GitRunOptions = {}): Promise<void> {
    const exists = await this.RemoteBranchExists(branch, options);
    if (!exists) {
      await this.RunChecked(['push', '--set-upstream', 'origin', branch], options);
      return;
    }

    await this.RunChecked(['push', 'origin', branch], options);
  }

  /**
   * Ensure the local branch has an upstream tracking branch.
   *
   * When the remote branch does not exist, this pushes using --set-upstream.
   */
  public async EnsureUpstream(branch: string, options: GitRunOptions = {}): Promise<void> {
    const exists = await this.RemoteBranchExists(branch, options);
    if (!exists) {
      await this.RunChecked(['push', '--set-upstream', 'origin', branch], options);
    }
  }
}

export interface GitLogger {
  Info?: (...args: unknown[]) => void;
  Warn?: (...args: unknown[]) => void;
  Error?: (...args: unknown[]) => void;
}

export interface GitRunOptions {
  cwd?: string;
  dryRun?: boolean;
  env?: Record<string, string>;
  stdin?: 'inherit' | 'null' | 'piped';
  stdout?: 'inherit' | 'piped';
  stderr?: 'inherit' | 'piped';
  allowFailure?: boolean;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
  success: boolean;
  code: number;
}

export class GitCommandError extends Error {
  public constructor(command: string, public result: GitRunResult) {
    super(`git command failed: ${command}\n${result.stderr || result.stdout}`);
    this.name = 'GitCommandError';
  }
}
