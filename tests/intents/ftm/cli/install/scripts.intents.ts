import { CommandIntents } from '@fathym/cli';
import ScriptsCommand from '../../../../../commands/cli/install/scripts.ts';

const cmd = ScriptsCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.ts');

// Note: The scripts command generates install.sh, install.ps1, and install.ts
// files. These tests verify that the correct package name is used in the
// generated Deno install script.

CommandIntents('Install Scripts Command Suite', cmd, origin)
  .Intent('Generates install scripts with correct package name', (int) =>
    int
      .Args([])
      .Flags({})
      .ExpectLogs(
        '✅ Generated:', // at least one script was generated
        'install.ts', // Deno script was created
        'deno run -A jsr:@fathym/ftm/install', // correct package name in output
      )
      .ExpectExit(0))
  .Intent('Detects GitHub repo automatically', (int) =>
    int
      .Args([])
      .Flags({})
      .ExpectLogs(
        '📦 Detected GitHub repo:', // auto-detection worked
        'fathym-deno/fathym-cli', // correct repo detected
      )
      .ExpectExit(0))
  .Run();
