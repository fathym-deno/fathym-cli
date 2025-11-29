import { CommandIntents } from '@fathym/cli';
import CompileCommand from '../../../commands/compile.ts';

CommandIntents(
  'Compile Command Suite',
  CompileCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  .Intent('Compile CLI binary from build output', (int) =>
    int
      .Args([])
      .Flags({
        entry: './tests/.temp/my-cli/.build/cli.ts',
      })
      .ExpectLogs(
        '🔧 Compiling CLI for:',
        '- Entry:',
        '- Output dir:',
        '✅ Compiled:',
        '👉 To install, run: `your-cli install --from',
      )
      .ExpectExit(0))
  .Run();
