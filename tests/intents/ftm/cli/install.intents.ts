import { CommandIntentSuite } from '@fathym/cli';
import InstallCommand from '../../../../commands/cli/install.ts';
import CLI from '../../../../.cli.ts';

CommandIntentSuite('Install Command Suite', InstallCommand, CLI)
  .Intent('Install CLI binary to system path', (int) =>
    int
      .Args([])
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
      })
      .ExpectLogs(
        '📦 Found binary', // binary location detection
        '✅ Installed: ', // main binary copy success
        '🎉 CLI installed successfully', // final success message
      )
      .ExpectExit(0))
  .Run();
