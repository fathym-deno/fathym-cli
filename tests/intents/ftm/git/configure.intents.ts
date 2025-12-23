import { assert, assertEquals } from '@std/assert';
import { CommandIntentSuite } from '@fathym/cli';
import GitConfigureCommand from '../../../../commands/git/configure.ts';
import GitIntentTestCLI from './.test.cli.ts';
import {
  createMockDFS,
  MockFathymApiClient,
  MockFathymGitHubLookupService,
  MockGitConfigStore,
  MockGitService,
  MockPromptService,
} from './_mocks.ts';

const cmd = GitConfigureCommand.Build();

CommandIntentSuite('git configure Command Suite', cmd, GitIntentTestCLI)
  .Intent('configures with provided organization and repository', (int) => {
    const config = new MockGitConfigStore();
    const api = new MockFathymApiClient();
    api.responses.set(
      'POST /github/organizations/fathym/repositories/cli/configure',
      { Model: { Success: true } },
    );

    return int
      .Args(['fathym', 'cli'])
      .Flags({ license: 'apache', 'skip-local': true })
      .WithServices({
        DFS: createMockDFS('/repo'),
        Git: new MockGitService({ isRepo: true }),
        Config: config,
        Prompt: new MockPromptService(),
        Lookup: new MockFathymGitHubLookupService(),
        Api: api,
      })
      .After(() => {
        assertEquals(
          api.requests[0],
          'POST /github/organizations/fathym/repositories/cli/configure',
        );
        assertEquals(config.defaults, {
          organization: 'fathym',
          repository: 'cli',
        });
        assertEquals(config.configuredRecords.length, 1);
      })
      .ExpectLogs('✅ Defaults saved for fathym/cli')
      .ExpectExit(0);
  })
  .Intent('prompts for organization and repository from lookups', (int) => {
    const prompts = new MockPromptService({
      selects: ['openindustrial', 'data-platform', 'mit'],
    });
    const config = new MockGitConfigStore();
    const api = new MockFathymApiClient();
    api.responses.set(
      'POST /github/organizations/openindustrial/repositories/data-platform/configure',
      { Model: { Success: true } },
    );

    return int
      .Flags({ 'skip-local': true })
      .WithServices({
        DFS: createMockDFS('/repo'),
        Git: new MockGitService({ isRepo: true }),
        Config: config,
        Prompt: prompts,
        Lookup: new MockFathymGitHubLookupService({
          organizations: [
            { Lookup: 'fathym', Name: 'Fathym' },
            { Lookup: 'openindustrial', Name: 'OpenIndustrial' },
          ],
          repositories: {
            openindustrial: [
              { Lookup: 'data-platform', Name: 'Data Platform' },
            ],
          },
        }),
        Api: api,
      })
      .After(() => {
        assertEquals(config.defaults, {
          organization: 'openindustrial',
          repository: 'data-platform',
        });
        assert(
          api.requests.some((req) =>
            req.includes(
              '/github/organizations/openindustrial/repositories/data-platform/configure',
            )
          ),
        );
      })
      .ExpectLogs(
        '✅ Organization: openindustrial',
        '✅ Repository: data-platform',
        '✅ License template: mit',
      )
      .ExpectExit(0);
  })
  .Intent('prefers local remote when skip-local is disabled', (int) => {
    const config = new MockGitConfigStore();
    const api = new MockFathymApiClient();
    api.responses.set(
      'POST /github/organizations/fathym/repositories/local-repo/configure',
      { Model: { Success: true } },
    );

    return int
      .WithServices({
        DFS: createMockDFS('/repo'),
        Git: new MockGitService({
          isRepo: true,
          remoteUrl: 'https://github.com/fathym/local-repo.git',
        }),
        Config: config,
        Prompt: new MockPromptService({
          selects: ['mit'],
        }),
        Lookup: new MockFathymGitHubLookupService(),
        Api: api,
      })
      .After(() => {
        assertEquals(config.defaults, {
          organization: 'fathym',
          repository: 'local-repo',
        });
        assertEquals(
          api.requests[0],
          'POST /github/organizations/fathym/repositories/local-repo/configure',
        );
      })
      .ExpectLogs('✅ Detected fathym/local-repo')
      .ExpectExit(0);
  })
  .Run();
