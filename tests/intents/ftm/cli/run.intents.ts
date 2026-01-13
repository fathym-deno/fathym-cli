import { CommandIntentSuite } from '@fathym/cli';
import RunCommand from '../../../../commands/cli/run.ts';
import CLI from '../../../../.cli.ts';

CommandIntentSuite('Run Command Suite', RunCommand, CLI)
  // === HELLO COMMAND TESTS ===
  .Intent("Run 'hello' command with default args", (int) =>
    int
      .Args(['hello'])
      .Flags({ config: './tests/.temp/my-cli/.cli.ts' })
      .ExpectLogs(
        '👋 Hello, world!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'hello' command with a name", (int) =>
    int
      .Args(['hello', 'testy'])
      .Flags({ config: './tests/.temp/my-cli/.cli.ts' })
      .ExpectLogs(
        '👋 Hello, testy!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'hello' command with loud flag", (int) =>
    int
      .Args(['hello', 'team'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
        loud: true,
      })
      .ExpectLogs(
        '👋 HELLO, TEAM!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  // === WAVE COMMAND TESTS (now under secondary group) ===
  .Intent("Run 'secondary/wave' command with default args", (int) =>
    int
      .Args(['secondary/wave'])
      .Flags({ config: './tests/.temp/my-cli/.cli.ts' })
      .ExpectLogs(
        '👋 Waving at friend',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' command with a name", (int) =>
    int
      .Args(['secondary/wave', 'me'])
      .Flags({ config: './tests/.temp/my-cli/.cli.ts' })
      .ExpectLogs(
        '👋 Waving at me',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' command with excitement", (int) =>
    int
      .Args(['secondary/wave', 'you'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
        excited: true,
      })
      .ExpectLogs(
        '👋 Waving at you!!!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' dry run", (int) =>
    int
      .Args(['secondary/wave', 'nobody'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
        'dry-run': true,
      })
      .ExpectLogs(
        '🛑 Dry run: "👋 Waving at nobody" would have been printed.',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' dry run with excitement", (int) =>
    int
      .Args(['secondary/wave', 'everyone'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
        'dry-run': true,
        excited: true,
      })
      .ExpectLogs(
        '🛑 Dry run: "👋 Waving at everyone!!!" would have been printed.',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  // // === Schema-driven help validation ===
  // // These intents validate help output against actual Zod schemas
  // .Intent("Schema-validate 'hello' help args and flags", (int) =>
  //   int
  //     .Args(['hello', '--help'])
  //     .Flags({ config: './tests/.temp/my-cli/.cli.ts' })
  //     .ExpectLogs(
  //       'Args:',
  //       ...helloArgs.map(formatArgHelpLine),
  //       'Flags:',
  //       ...helloFlags.map(formatFlagHelpLine),
  //     )
  //     .ExpectExit(0))
  // .Intent("Schema-validate 'wave' help args and flags", (int) =>
  //   int
  //     .Args(['wave', '--help'])
  //     .Flags({ config: './tests/.temp/my-cli/.cli.ts' })
  //     .ExpectLogs(
  //       'Args:',
  //       ...waveArgs.map(formatArgHelpLine),
  //       'Flags:',
  //       ...waveFlags.map(formatFlagHelpLine),
  //     )
  //     .ExpectExit(0))
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
