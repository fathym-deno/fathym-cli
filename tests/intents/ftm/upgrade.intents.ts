import { CommandIntentSuite } from '@fathym/cli';
import UpgradeCommand from '../../../commands/upgrade.ts';

const cmd = UpgradeCommand.Build();
const origin = import.meta.resolve('../../../.cli.ts');

CommandIntentSuite('upgrade Command Suite', cmd, origin)
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
  // Note: We don't test actual install (--version flag) here because it installs
  // to user's home ~/.bin and would overwrite their production CLI.
  // Version flag parsing is covered in unit tests (upgrade.test.ts).
  .Run();
