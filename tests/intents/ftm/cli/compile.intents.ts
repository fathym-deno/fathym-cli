import { CommandIntentSuite } from '@fathym/cli';
import CompileCommand from '../../../../commands/cli/compile.ts';

CommandIntentSuite(
  'Compile Command Suite',
  CompileCommand.Build(),
  import.meta.resolve('../../../../.cli.ts'),
)
  .Intent('Compile CLI binary from build output', (int) =>
    int
      .Args([])
      .Flags({
        entry: './tests/.temp/my-cli/.build/main.ts',
      })
      .ExpectLogs(
        '🔧 Compiling CLI for:',
        '- Entry:',
        '- Output:',
        '✅ Compiled:',
        '👉 To install, run: `ftm cli install',
      )
      .ExpectExit(0))
  .Run();
