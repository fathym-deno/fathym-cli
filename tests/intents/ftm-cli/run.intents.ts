import { CommandIntents } from '@fathym/cli';
import RunCommand from '../../../commands/run.ts';
import {
  HelloArgsSchema,
  HelloFlagsSchema,
} from '../../.temp/my-cli/commands/hello.ts';
import {
  WaveArgsSchema,
  WaveFlagsSchema,
} from '../../.temp/my-cli/commands/wave.ts';
import {
  extractArgMeta,
  extractFlagMeta,
  formatArgHelpLine,
  formatFlagHelpLine,
} from './schemaHelpers.ts';

// Extract schema metadata for validation
const helloArgs = extractArgMeta(HelloArgsSchema);
const helloFlags = extractFlagMeta(HelloFlagsSchema);
const waveArgs = extractArgMeta(WaveArgsSchema);
const waveFlags = extractFlagMeta(WaveFlagsSchema);

CommandIntents(
  'Run Command Suite',
  RunCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  // === HELLO COMMAND TESTS ===
  .Intent("Run 'hello' command with default args", (int) =>
    int
      .Args(['hello'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        '👋 Hello, world!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'hello' command with a name", (int) =>
    int
      .Args(['hello', 'testy'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        '👋 Hello, testy!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'hello' command with loud flag", (int) =>
    int
      .Args(['hello', 'team'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
        loud: true,
      })
      .ExpectLogs(
        '👋 HELLO, TEAM!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  // === WAVE COMMAND TESTS ===
  .Intent("Run 'wave' command with default args", (int) =>
    int
      .Args(['wave'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        '👋 Waving at friend',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'wave' command with a name", (int) =>
    int
      .Args(['wave', 'me'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        '👋 Waving at me',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'wave' command with excitement", (int) =>
    int
      .Args(['wave', 'you'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
        excited: true,
      })
      .ExpectLogs(
        '👋 Waving at you!!!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'wave' dry run", (int) =>
    int
      .Args(['wave', 'nobody'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
        'dry-run': true,
      })
      .ExpectLogs(
        '🛑 Dry run: "👋 Waving at nobody" would have been printed.',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'wave' dry run with excitement", (int) =>
    int
      .Args(['wave', 'everyone'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
        'dry-run': true,
        excited: true,
      })
      .ExpectLogs(
        '🛑 Dry run: "👋 Waving at everyone!!!" would have been printed.',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  // === Schema-driven help validation ===
  // These intents validate help output against actual Zod schemas
  .Intent("Schema-validate 'hello' help args and flags", (int) =>
    int
      .Args(['hello', '--help'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'Args:',
        ...helloArgs.map(formatArgHelpLine),
        'Flags:',
        ...helloFlags.map(formatFlagHelpLine),
      )
      .ExpectExit(0))
  .Intent("Schema-validate 'wave' help args and flags", (int) =>
    int
      .Args(['wave', '--help'])
      .Flags({ config: './tests/.temp/my-cli/.cli.json' })
      .ExpectLogs(
        'Args:',
        ...waveArgs.map(formatArgHelpLine),
        'Flags:',
        ...waveFlags.map(formatFlagHelpLine),
      )
      .ExpectExit(0))
  .Run();
