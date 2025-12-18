import { CommandIntentSuite } from '@fathym/cli';
import GitCommand from '../../../../commands/git/index.ts';
import { createMockDFS, MockGitService, MockPromptService } from './_mocks.ts';

const cmd = GitCommand.Build();
const origin = import.meta.resolve('../../../../.cli.ts');

CommandIntentSuite('git Command Suite', cmd, origin)
  .Intent('fails when not inside a git repository', (int) =>
    int
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ isRepo: false }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs('❌ Not a git repository. Run inside a repository or set --config to target one.')
      .ExpectExit(1))
  .Intent('commits and syncs with merge flow', (int) =>
    int
      .Flags({ message: 'Auto commit' })
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({
          hasChanges: true,
          branch: 'feature/test',
          remoteExists: true,
        }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '✅ Committed (Auto commit)',
        '✅ Merged origin/integration',
        '✅ Push to origin',
      )
      .ExpectExit(0))
  .Intent('supports dry run without prompting', (int) =>
    int
      .Flags({ 'dry-run': true, rebase: true })
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({
          hasChanges: true,
          branch: 'feature/dry-run',
          remoteExists: false,
        }),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '[dry-run] git add -A',
        '[dry-run] git commit -m dry-run commit',
        '✅ Rebased onto origin/integration',
      )
      .ExpectExit(0))
  .Run();
