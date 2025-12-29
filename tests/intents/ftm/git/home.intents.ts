import { CommandIntentSuite } from '@fathym/cli';
import GitHomeCommand from '../../../../commands/git/home.ts';
import GitIntentTestCLI from './.test.cli.ts';
import {
  createMockDFS,
  MockGitConfigStore,
  MockGitService,
  MockPromptService,
  MockUrlOpener,
} from './_mocks.ts';

CommandIntentSuite('git home Command Suite', GitHomeCommand, GitIntentTestCLI)
  .Intent('fails when --use-local is used outside a repo', (int) =>
    int
      .Flags({ 'use-local': true })
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService({ isRepo: false }),
        Config: new MockGitConfigStore(),
        Prompt: new MockPromptService(),
        Urls: new MockUrlOpener(),
      })
      .ExpectLogs(
        '⏳ Load local git remote',
        '❌ Not a git repository. Use --use-local only inside a repository.',
      )
      .ExpectExit(1))
  .Intent('uses config defaults when available', (int) =>
    int
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService(),
        Config: new MockGitConfigStore({
          organization: 'fathym',
          repository: 'awesome',
        }),
        Prompt: new MockPromptService(),
        Urls: new MockUrlOpener(),
      })
      .ExpectLogs(
        '✅ Organization: fathym',
        '✅ Repository: awesome',
        '✅ Opened https://github.com/fathym/awesome',
      )
      .ExpectExit(0))
  .Intent('prompts for missing organization and repository', (int) =>
    int
      .WithServices({
        DFS: createMockDFS(),
        Git: new MockGitService(),
        Config: new MockGitConfigStore(),
        Prompt: new MockPromptService({
          inputs: ['fathym', 'ftm-cli'],
        }),
        Urls: new MockUrlOpener(),
      })
      .ExpectLogs(
        '✅ Organization: fathym',
        '✅ Repository: ftm-cli',
        '✅ Opened https://github.com/fathym/ftm-cli',
      )
      .ExpectExit(0))
  .Intent(
    'resolves organization/repository from --use-local and applies section',
    (int) =>
      int
        .Flags({ 'use-local': true, section: 'pulls' })
        .WithServices({
          DFS: createMockDFS(),
          Git: new MockGitService({
            isRepo: true,
            remoteUrl: 'https://github.com/fathym/local.git',
          }),
          Config: new MockGitConfigStore(),
          Prompt: new MockPromptService(),
          Urls: new MockUrlOpener(),
        })
        .ExpectLogs(
          '✅ Detected fathym/local',
          '✅ Organization: fathym',
          '✅ Repository: local',
          '✅ Opened https://github.com/fathym/local/pulls',
        )
        .ExpectExit(0),
  )
  .Run();
