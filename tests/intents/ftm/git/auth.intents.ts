import { assertEquals } from '@std/assert';
import { CommandIntentSuite } from '@fathym/cli';
import GitAuthCommand from '../../../../commands/git/auth.ts';
import GitIntentTestCLI from './.test.cli.ts';
import { MockFathymApiClient, MockFathymConfigStore, MockUrlOpener } from './_mocks.ts';

const cmd = GitAuthCommand.Build();

CommandIntentSuite('git auth Command Suite', cmd, GitIntentTestCLI)
  .Intent('opens edit mode when --edit flag passed', (int) => {
    const opener = new MockUrlOpener();

    return int
      .Flags({ edit: true })
      .WithServices({
        Config: new MockFathymConfigStore({ activeLookup: 'ent-active' }),
        Api: new MockFathymApiClient(),
        Opener: opener,
      })
      .After(() => {
        assertEquals(
          opener.opened[0],
          'https://www.fathym.com/.oauth/GitHubOAuth?oauth-force-edit=true',
        );
      })
      .ExpectExit(0);
  })
  .Intent('uses parent enterprise lookup by default', (int) => {
    const opener = new MockUrlOpener();
    const api = new MockFathymApiClient();
    api.responses.set('ent-active/eac', {
      Model: { Enterprise: { ParentEnterpriseLookup: 'ent-parent' } },
    });

    return int
      .WithServices({
        Config: new MockFathymConfigStore({ activeLookup: 'ent-active' }),
        Api: api,
        Opener: opener,
      })
      .After(() => {
        assertEquals(
          opener.opened[0],
          'https://www.fathym.com/.oauth/GitHubOAuth?entLookup=ent-parent',
        );
      })
      .ExpectExit(0);
  })
  .Intent('uses active enterprise when --self is provided', (int) => {
    const opener = new MockUrlOpener();

    return int
      .Flags({ self: true })
      .WithServices({
        Config: new MockFathymConfigStore({ activeLookup: 'ent-active' }),
        Api: new MockFathymApiClient(),
        Opener: opener,
      })
      .After(() => {
        assertEquals(
          opener.opened[0],
          'https://www.fathym.com/.oauth/GitHubOAuth?entLookup=ent-active',
        );
      })
      .ExpectExit(0);
  })
  .Intent('fails when parent lookup is missing and --self not set', (int) => {
    const api = new MockFathymApiClient();
    api.responses.set('ent-active/eac', {
      Model: { Enterprise: {} },
    });

    return int
      .WithServices({
        Config: new MockFathymConfigStore({ activeLookup: 'ent-active' }),
        Api: api,
        Opener: new MockUrlOpener(),
      })
      .ExpectLogs('Parent enterprise lookup not found')
      .ExpectExit(1);
  })
  .Run();
