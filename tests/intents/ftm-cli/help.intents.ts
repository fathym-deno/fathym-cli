import { CommandIntents } from '../../../../../ref-arch/command-line-interface/src/.exports.ts';
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
        'Available Commands',
        'hello - hello - Prints a friendly greeting.',
        'wave - Wave - Waves at a friend with optional excitement.',
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
        '<name> - Name to greet',
        'Flags:',
        '--loud - Shout the greeting',
        '--dry-run - Show the message without printing',
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
        '<target> - Name to wave at',
        'Flags:',
        '--excited - Add extra enthusiasm to the wave',
        '--dry-run - Show the wave without printing it',
      )
      .ExpectExit(0))
  .Run();
