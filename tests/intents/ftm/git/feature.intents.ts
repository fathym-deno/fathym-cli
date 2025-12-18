import { CommandIntentSuite } from '@fathym/cli';
import FeatureCommand from '../../../../commands/git/feature.ts';
import { createMockDFS, MockGitService, MockPromptService } from './_mocks.ts';
import GitIntentTestCLI from './.test.cli.ts';

const cmd = FeatureCommand.Build();
CommandIntentSuite('git feature Command Suite', cmd, GitIntentTestCLI)
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
        '❌ Working tree has uncommitted changes. Run `ftm git` (or stash/commit) before creating a feature branch.',
      )
      .ExpectExit(1))
  .Intent('creates feature branch and pushes', (int) =>
    int
      .Args(['My New Feature'])
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ branch: 'feature/my-new-feature' }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '⏳ Using branch feature/my-new-feature',
        '✅ Create feature branch feature/my-new-feature',
        '✅ Push feature/my-new-feature to origin',
      )
      .ExpectExit(0))
  .Intent('dry run skips prompts and push', (int) =>
    int
      .Flags({ 'dry-run': true, 'no-push': true })
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ branch: 'feature/dry-run-feature' }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '⏳ Using branch feature/dry-run-feature',
        '[dry-run] git checkout -b feature/dry-run-feature origin/integration',
        '⚪ Push feature branch to origin (--no-push flag set)',
        '[dry-run] git fetch --prune',
      )
      .ExpectExit(0))
  .Run();
