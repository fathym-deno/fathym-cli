import { CommandIntents } from '@fathym/cli';
import RunCommand from '../../../commands/run.ts';

// Help intent suite validates root and command-level help output
// for the scaffolded tests/.temp/my-cli project.
CommandIntents(
  'Help Command Suite',
  RunCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  // Root help
  .Intent('Show root help', (int) =>
    int
      .Args(['--help'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'My CLI', // CLI name from .cli.json
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
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
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
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'Waves at a friend with optional excitement.',
        'Args:',
        '<target> - Name to wave at',
        'Flags:',
        '--excited - Add extra enthusiasm to the wave',
        '--dry-run - Show the wave without printing it',
      )
      .ExpectExit(0))
  // // === Schema-driven help validation ===
  // // These intents validate help output against actual Zod schemas
  // .Intent("Schema-validate 'hello' help args and flags", (int) =>
  //   int
  //     .Args(['hello', '--help'])
  //     .Flags({ config: './tests/.temp/my-cli/.cli.json' })
  //     .ExpectLogs(
  //       'Args:',
  //       ...helloArgs.map(formatArgHelpLine),
  //       'Flags:',
  //       ...helloFlags.map(formatFlagHelpLine)
  //     )
  //     .ExpectExit(0)
  // )
  // .Intent("Schema-validate 'wave' help args and flags", (int) =>
  //   int
  //     .Args(['wave', '--help'])
  //     .Flags({ config: './tests/.temp/my-cli/.cli.json' })
  //     .ExpectLogs(
  //       'Args:',
  //       ...waveArgs.map(formatArgHelpLine),
  //       'Flags:',
  //       ...waveFlags.map(formatFlagHelpLine)
  //     )
  //     .ExpectExit(0)
  // )
  .Run();

// import {
//   HelloArgsSchema,
//   HelloFlagsSchema,
// } from '../../.temp/my-cli/commands/hello.ts';
// import {
//   WaveArgsSchema,
//   WaveFlagsSchema,
// } from '../../.temp/my-cli/commands/wave.ts';
// // Extract schema metadata for validation
// const helloArgs = extractArgMeta(HelloArgsSchema);
// const helloFlags = extractFlagMeta(HelloFlagsSchema);
// const waveArgs = extractArgMeta(WaveArgsSchema);
// const waveFlags = extractFlagMeta(WaveFlagsSchema);
