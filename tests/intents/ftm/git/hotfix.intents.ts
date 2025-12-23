import { CommandIntentSuite } from '@fathym/cli';
import HotfixCommand from '../../../../commands/git/hotfix.ts';
import { createMockDFS, MockGitService, MockPromptService } from './_mocks.ts';
import GitIntentTestCLI from './.test.cli.ts';

const cmd = HotfixCommand.Build();
CommandIntentSuite('git hotfix Command Suite', cmd, GitIntentTestCLI)
  .Intent('fails outside a git repository', (int) =>
    int
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ isRepo: false }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '⏳ Verify git repository',
        '❌ Not a git repository. Run inside a repository or set --config to target one.',
      )
      .ExpectExit(1))
  .Intent('fails when working tree has changes', (int) =>
    int
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ hasChanges: true }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '⏳ Ensure clean working tree',
        '❌ Working tree has uncommitted changes. Run `ftm git` (or stash/commit) before creating a hotfix branch.',
      )
      .ExpectExit(1))
  .Intent('creates hotfix branch and pushes', (int) =>
    int
      .Args(['Critical Patch'])
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ branch: 'hotfix/critical-patch' }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '✅ Using branch hotfix/critical-patch',
        '✅ Create hotfix branch hotfix/critical-patch',
        '✅ Push hotfix/critical-patch to origin',
      )
      .ExpectExit(0))
  .Intent('dry run honors custom base and skipping push', (int) =>
    int
      .Flags({ 'dry-run': true, 'no-push': true, base: 'origin/release' })
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ branch: 'hotfix/dry-run-hotfix' }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '✅ Using branch hotfix/dry-run-hotfix',
        '[dry-run] git checkout -b hotfix/dry-run-hotfix origin/release',
        '⚪ Push hotfix branch to origin (--no-push flag set)',
        '[dry-run] git fetch --prune',
      )
      .ExpectExit(0))
  .Run();
