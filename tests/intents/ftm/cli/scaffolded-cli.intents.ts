/**
 * Scaffolded CLI Lifecycle Integration Tests
 *
 * This suite tests the complete CLI development workflow:
 * 1. Initialize a new CLI project
 * 2. Build the CLI
 * 3. Compile to binary
 * 4. Run commands in development mode
 * 5. Run the CLI's test suite
 *
 * All tests share the same scaffolded CLI at ./tests/.temp/my-cli/
 * Tests run in sequence within this file.
 */
import { CLIIntentSuite, CommandIntentSuite } from '@fathym/cli';
import CLI from '../../../../.cli.ts';
import BuildCommand from '../../../../commands/cli/build.ts';
import CompileCommand from '../../../../commands/cli/compile.ts';
import RunCommand from '../../../../commands/cli/run.ts';
import TestCommand from '../../../../commands/cli/test.ts';

const TEMP_CLI_PATH = './tests/.temp/my-cli';
const TEMP_CLI_CONFIG = `${TEMP_CLI_PATH}/.cli.ts`;

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1: Initialize
// ═══════════════════════════════════════════════════════════════════════════════
CLIIntentSuite('Scaffolded CLI Lifecycle', CLI)
  .BeforeAll(async () => {
    // Clean up any existing temp CLI before starting
    await Deno.remove(TEMP_CLI_PATH, { recursive: true }).catch(() => {});
  })
  .Intent('Initialize scaffolded CLI', (int) =>
    int
      .Args(['cli', 'init', TEMP_CLI_PATH])
      .ExpectLogs(
        'Project created from "init" template.',
        '📂 Initialized at:',
      )
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2: Build
// ═══════════════════════════════════════════════════════════════════════════════
CommandIntentSuite('Scaffolded CLI Build', BuildCommand, CLI)
  .Intent('Build scaffolded CLI', (int) =>
    int
      .Args([])
      .Flags({ config: TEMP_CLI_CONFIG })
      .ExpectLogs(
        '📦 Embedded templates →',
        '📘 Embedded command entries →',
        '🧩 Scaffolder rendered build-static template to ./.build',
        'Build complete! Run `ftm compile` on .build/main.ts to finalize.',
      )
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3: Compile
// ═══════════════════════════════════════════════════════════════════════════════
CommandIntentSuite('Scaffolded CLI Compile', CompileCommand, CLI)
  .Intent('Compile scaffolded CLI to binary', (int) =>
    int
      .Args([])
      .Flags({ entry: `${TEMP_CLI_PATH}/.build/main.ts` })
      .ExpectLogs(
        '🔧 Compiling CLI for:',
        '- Entry:',
        '- Output:',
        '✅ Compiled:',
        '👉 To install, run: `ftm cli install',
      )
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4: Run Commands
// ═══════════════════════════════════════════════════════════════════════════════
CommandIntentSuite('Scaffolded CLI Run Commands', RunCommand, CLI)
  .Intent("Run 'hello' command with default args", (int) =>
    int
      .Args(['hello'])
      .Flags({ config: TEMP_CLI_CONFIG })
      .ExpectLogs(
        '👋 Hello, world!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'hello' command with a name", (int) =>
    int
      .Args(['hello', 'testy'])
      .Flags({ config: TEMP_CLI_CONFIG })
      .ExpectLogs(
        '👋 Hello, testy!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'hello' command with loud flag", (int) =>
    int
      .Args(['hello', 'team'])
      .Flags({ config: TEMP_CLI_CONFIG, loud: true })
      .ExpectLogs(
        '👋 HELLO, TEAM!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' command with default args", (int) =>
    int
      .Args(['secondary/wave'])
      .Flags({ config: TEMP_CLI_CONFIG })
      .ExpectLogs(
        '👋 Waving at friend',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' command with a name", (int) =>
    int
      .Args(['secondary/wave', 'me'])
      .Flags({ config: TEMP_CLI_CONFIG })
      .ExpectLogs(
        '👋 Waving at me',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' command with excitement", (int) =>
    int
      .Args(['secondary/wave', 'you'])
      .Flags({ config: TEMP_CLI_CONFIG, excited: true })
      .ExpectLogs(
        '👋 Waving at you!!!',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' dry run", (int) =>
    int
      .Args(['secondary/wave', 'nobody'])
      .Flags({ config: TEMP_CLI_CONFIG, 'dry-run': true })
      .ExpectLogs(
        '🛑 Dry run: "👋 Waving at nobody" would have been printed.',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Intent("Run 'secondary/wave' dry run with excitement", (int) =>
    int
      .Args(['secondary/wave', 'everyone'])
      .Flags({ config: TEMP_CLI_CONFIG, 'dry-run': true, excited: true })
      .ExpectLogs(
        '🛑 Dry run: "👋 Waving at everyone!!!" would have been printed.',
        '🎉 CLI run completed',
      )
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 5: Run Tests
// ═══════════════════════════════════════════════════════════════════════════════
CommandIntentSuite('Scaffolded CLI Test Suite', TestCommand, CLI)
  .Intent('Run default CLI test file', (int) =>
    int
      .Args([])
      .Flags({ config: TEMP_CLI_CONFIG })
      .ExpectLogs(
        '🧪 Running tests from:',
        '➡️  deno test -A',
        '✅ Tests passed successfully',
      )
      .ExpectExit(0))
  .Intent('Run tests with filter', (int) =>
    int
      .Args(['./intents/.intents.ts'])
      .Flags({ config: TEMP_CLI_CONFIG, filter: 'hello' })
      .ExpectLogs(
        '🧪 Running tests from:',
        '➡️  deno test -A --filter=hello',
        '✅ Tests passed successfully',
      )
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 6: Help Output Tests (tests the scaffolded CLI directly)
// ═══════════════════════════════════════════════════════════════════════════════
// @ts-ignore - The scaffolded CLI path doesn't exist at type-check time
CLIIntentSuite('Scaffolded CLI Help Output', TEMP_CLI_CONFIG)
  .Intent('Show root help', (int) =>
    int
      .Args(['--help'])
      .ExpectLogs(
        'My CLI',
        'Usage:',
        'Available Commands',
        'hello',
        'manage',
        'Available Groups',
        'secondary',
      )
      .ExpectExit(0))
  .Intent("Show 'hello' command help", (int) =>
    int
      .Args(['hello', '--help'])
      .ExpectLogs(
        'Prints a friendly greeting.',
        'Args:',
        '<name>',
        'Flags:',
        '--loud',
        '--dry-run',
      )
      .ExpectExit(0))
  .Intent("Show 'secondary' group help", (int) =>
    int
      .Args(['secondary', '--help'])
      .ExpectLogs(
        'Group: secondary',
        'Available Commands',
        'wave',
      )
      .ExpectExit(0))
  .Intent("Show 'secondary/wave' command help", (int) =>
    int
      .Args(['secondary/wave', '--help'])
      .ExpectLogs(
        'Waves at a friend',
        'Args:',
        '<target>',
        'Flags:',
        '--excited',
        '--dry-run',
      )
      .ExpectExit(0))
  .Intent("Show 'manage' command help", (int) =>
    int
      .Args(['manage', '--help'])
      .ExpectLogs(
        'Show management status and options.',
        'Flags:',
        '--verbose',
        '--dry-run',
      )
      .ExpectExit(0))
  .Intent("Show 'manage/users' command help", (int) =>
    int
      .Args(['manage/users', '--help'])
      .ExpectLogs(
        'List and manage users.',
        'Flags:',
        '--all',
        '--dry-run',
      )
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 7: Compiled Binary Tests
// ═══════════════════════════════════════════════════════════════════════════════
import { assertMatch } from 'jsr:@std/assert@1.0.3';
import { join } from '@std/path';

const BINARY_NAME = Deno.build.os === 'windows' ? 'my-cli.exe' : 'my-cli';
const COMPILED_BINARY = join(Deno.cwd(), TEMP_CLI_PATH, '.dist/exe', BINARY_NAME);

async function runCompiledCLI(args: string[]): Promise<string> {
  const command = new Deno.Command(COMPILED_BINARY, {
    args,
    stdout: 'piped',
    stderr: 'piped',
  });

  const { stdout, stderr } = await command.output();
  const output = new TextDecoder().decode(stdout);
  const errors = new TextDecoder().decode(stderr);

  return output + errors;
}

Deno.test('Compiled Binary – root help shows groups', async () => {
  const output = await runCompiledCLI(['--help']);

  assertMatch(output, /My CLI/i);
  assertMatch(output, /Usage:/i);
  assertMatch(output, /Available Commands/i);
  assertMatch(output, /hello/i);
  assertMatch(output, /Available Groups/i);
  assertMatch(output, /secondary/i);
});

Deno.test('Compiled Binary – group help shows child commands', async () => {
  const output = await runCompiledCLI(['secondary', '--help']);

  assertMatch(output, /Group: secondary/i);
  assertMatch(output, /Secondary commands/i);
  assertMatch(output, /Available Commands/i);
  assertMatch(output, /wave/i);
});

Deno.test('Compiled Binary – nested command help works', async () => {
  const output = await runCompiledCLI(['secondary/wave', '--help']);

  assertMatch(output, /Wave/i);
  assertMatch(output, /Waves at a friend/i);
  assertMatch(output, /--excited/i);
  assertMatch(output, /--dry-run/i);
});

Deno.test('Compiled Binary – nested command executes', async () => {
  const output = await runCompiledCLI(['secondary/wave', 'tester']);

  assertMatch(output, /Waving at tester/i);
});
