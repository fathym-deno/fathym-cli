import { CommandIntentSuite } from '@fathym/cli';
import GitReposCommand from '../../../../commands/git/repos.ts';
import GitIntentTestCLI from './.test.cli.ts';
import { MockFathymGitHubLookupService } from './_mocks.ts';

const cmd = GitReposCommand.Build();

CommandIntentSuite('git repos Command Suite', cmd, GitIntentTestCLI)
  .Intent('lists organizations and next steps', (int) =>
    int
      .WithServices({
        Lookup: new MockFathymGitHubLookupService({
          organizations: [
            { Lookup: 'fathym', Name: 'Fathym' },
            { Lookup: 'openindustrial', Name: 'OpenIndustrial' },
          ],
        }),
      })
      .ExpectLogs(
        'Organizations:',
        '  - Fathym (fathym)',
        '  - OpenIndustrial (openindustrial)',
        'Next steps:',
        '  - Run `ftm git configure -s` to provision a repository.',
        '  - Run `ftm git clone --target <path>` after configure completes.',
      )
      .ExpectExit(0))
  .Intent('lists repositories when organization flag is set', (int) =>
    int
      .Flags({ org: 'fathym' })
      .WithServices({
        Lookup: new MockFathymGitHubLookupService({
          organizations: [
            { Lookup: 'fathym', Name: 'Fathym' },
          ],
          repositories: {
            fathym: [
              { Lookup: 'cli', Name: 'CLI', Description: 'CLI tooling' },
              { Lookup: 'platform', Name: 'Platform' },
            ],
          },
        }),
      })
      .ExpectLogs(
        'Organizations:',
        '  - Fathym (fathym)',
        'Repositories under fathym:',
        '  - cli – CLI tooling',
        '  - platform',
        'Next steps:',
        '  - Run `ftm git configure -s` to provision a repository.',
        '  - Run `ftm git clone --target <path>` after configure completes.',
      )
      .ExpectExit(0))
  .Intent(
    'lists branches when organization and repository flags are set',
    (int) =>
      int
        .Flags({ org: 'fathym', repo: 'cli' })
        .WithServices({
          Lookup: new MockFathymGitHubLookupService({
            organizations: [
              { Lookup: 'fathym', Name: 'Fathym' },
            ],
            repositories: {
              fathym: [
                { Lookup: 'cli', Name: 'CLI' },
              ],
            },
            branches: {
              'fathym/cli': [
                { Name: 'integration', Protected: true },
                { Name: 'feature/test' },
              ],
            },
          }),
        })
        .ExpectLogs(
          'Organizations:',
          '  - Fathym (fathym)',
          'Repositories under fathym:',
          '  - cli',
          'Branches for fathym/cli:',
          '  - integration (protected)',
          '  - feature/test',
          'Next steps:',
          '  - Run `ftm git configure -s` to provision a repository.',
          '  - Run `ftm git clone --target <path>` after configure completes.',
        )
        .ExpectExit(0),
  )
  .Run();
