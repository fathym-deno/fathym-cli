import { CommandIntents } from '@fathym/cli';
import UpgradeCommand from '../../../commands/upgrade.ts';

const cmd = UpgradeCommand.Build();
const origin = import.meta.resolve('../../../.cli.json');

CommandIntents('upgrade Command Suite', cmd, origin)
  .Intent('List shows available versions', (int) =>
    int
      .Args([])
      .Flags({ list: true })
      .ExpectExit(0))
  .Intent('Audit mode checks for upgrades', (int) =>
    int
      .Args([])
      .Flags({ audit: true })
      .ExpectExit(0))
  .Intent('Specific version flag is accepted', (int) =>
    int
      .Args([])
      .Flags({ version: '0.0.70-integration' })
      // This will try to install, which may fail in test env, but the flag parsing works
      .ExpectExit(0))
  .Run();
