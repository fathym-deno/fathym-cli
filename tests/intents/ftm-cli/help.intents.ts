import { CommandIntents } from '@fathym/cli';
import RunCommand from '../../../commands/run.ts';

// Help intent suite validates root and command-level help output
// for the scaffolded .temp/my-cli project.
CommandIntents(
  'Help Command Suite',
  RunCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  // Root help
  .Intent('Show root help', (int) =>
    int
      .Args(['--help'])
      .Flags({ config: './.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'Fathym CLI', // CLI name from .cli.json
        'Usage:',
        'Commands:',
        'hello',
        'wave',
      )
      .ExpectExit(0))
  // hello command help
  .Intent("Show 'hello' command help", (int) =>
    int
      .Args(['hello', '--help'])
      .Flags({ config: './.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'Prints a friendly greeting.',
        'Args:',
        'Name to greet',
        'Flags:',
        '--loud',
        '--dry-run',
      )
      .ExpectExit(0))
  // wave command help
  .Intent("Show 'wave' command help", (int) =>
    int
      .Args(['wave', '--help'])
      .Flags({ config: './.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'Waves at a friend with optional excitement.',
        'Args:',
        'Name to wave at',
        'Flags:',
        '--excited',
        '--dry-run',
      )
      .ExpectExit(0))
  .Run();
