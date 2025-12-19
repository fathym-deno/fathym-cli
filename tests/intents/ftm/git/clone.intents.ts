import { assertEquals } from '@std/assert';
import { CommandIntentSuite } from '@fathym/cli';
import GitCloneCommand from '../../../../commands/git/clone.ts';
import GitIntentTestCLI from './.test.cli.ts';
import { createMockDFS, MockGitConfigStore, MockGitService, MockPromptService } from './_mocks.ts';

const cmd = GitCloneCommand.Build();

CommandIntentSuite('git clone Command Suite', cmd, GitIntentTestCLI)
  .Intent('fails when repository is not configured', (int) =>
    int
      .Args(['fathym', 'cli'])
      .WithServices({
        DFS: createMockDFS('/workspace'),
        Git: new MockGitService(),
        Config: new MockGitConfigStore(),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        'Repository fathym/cli has not been configured. Run `ftm git configure -s` first or pass --force to bypass.',
      )
      .ExpectExit(1))
  .Intent('clones configured repo into DFS root', (int) => {
    const git = new MockGitService();
    const config = new MockGitConfigStore(
      { organization: 'fathym', repository: 'cli' },
      [{ organization: 'fathym', repository: 'cli' }],
    );

    return int
      .WithServices({
        DFS: createMockDFS('/workspace'),
        Git: git,
        Config: config,
        Prompt: new MockPromptService(),
      })
      .ExpectLogs('Cloned fathym/cli → /workspace/cli')
      .After(() => {
        assertEquals(git.Commands.at(-1)?.args, [
          'clone',
          'https://github.com/fathym/cli.git',
          '/workspace/cli',
        ]);
      })
      .ExpectExit(0);
  })
  .Intent('supports depth, branch, dir, and dry-run', (int) => {
    const git = new MockGitService();
    const config = new MockGitConfigStore(undefined, [
      { organization: 'openindustrial', repository: 'platform' },
    ]);

    return int
      .Args(['openindustrial', 'platform'])
      .Flags({ depth: 1, branch: 'integration', dir: 'platform-src', 'dry-run': true })
      .WithServices({
        DFS: createMockDFS('/git/target'),
        Git: git,
        Config: config,
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        '[dry-run] git clone --depth 1 --branch integration https://github.com/openindustrial/platform.git /git/target/platform-src',
      )
      .After(() => {
        assertEquals(git.Commands.at(-1)?.args, [
          'clone',
          '--depth',
          '1',
          '--branch',
          'integration',
          'https://github.com/openindustrial/platform.git',
          '/git/target/platform-src',
        ]);
      })
      .ExpectExit(0);
  })
  .Intent('allows --force to bypass configure gate', (int) => {
    const git = new MockGitService();
    const config = new MockGitConfigStore();

    return int
      .Args(['fathym', 'cli'])
      .Flags({ force: true })
      .WithServices({
        DFS: createMockDFS('/workspace'),
        Git: git,
        Config: config,
        Prompt: new MockPromptService(),
      })
      .ExpectLogs('Proceeding without configure (--force)')
      .After(() => {
        assertEquals(git.Commands.at(-1)?.args?.[0], 'clone');
      })
      .ExpectExit(0);
  })
  .Run();
