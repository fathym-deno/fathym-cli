import { CLIIntent, CLIIntents } from '@fathym/cli';

const origin = './.cli.ts';

// ═══════════════════════════════════════════════════════════════════
// Help Command Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntent('Fathym CLI – help renders CLI info', origin)
  .Args(['--help'])
  .ExpectLogs('Fathym CLI', 'Usage:')
  .ExpectExit(0)
  .Run();

CLIIntent('Fathym CLI – shows available commands', origin)
  .Args(['--help'])
  .ExpectLogs('Available Commands')
  .ExpectExit(0)
  .Run();

// ═══════════════════════════════════════════════════════════════════
// CLI Command Group Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – cli command group', origin)
  .Intent('cli build help shows description', (int) =>
    int
      .Args(['cli', 'build', '--help'])
      .ExpectLogs('Prepare static CLI build folder')
      .ExpectExit(0))
  .Intent('cli compile help shows description', (int) =>
    int
      .Args(['cli', 'compile', '--help'])
      .ExpectLogs('Compile the CLI into a native binary')
      .ExpectExit(0))
  .Intent('cli init help shows description', (int) =>
    int
      .Args(['cli', 'init', '--help'])
      .ExpectLogs('Initialize a new CLI project')
      .ExpectExit(0))
  .Intent('cli install help shows description', (int) =>
    int
      .Args(['cli', 'install', '--help'])
      .ExpectLogs('Install a compiled CLI binary')
      .ExpectExit(0))
  .Intent('cli run help shows description', (int) =>
    int
      .Args(['cli', 'run', '--help'])
      .ExpectLogs('Run a specific command in a CLI project')
      .ExpectExit(0))
  .Intent('cli test help shows description', (int) =>
    int
      .Args(['cli', 'test', '--help'])
      .ExpectLogs('Run CLI tests')
      .ExpectExit(0))
  .Intent('cli release help shows description', (int) =>
    int
      .Args(['cli', 'release', '--help'])
      .ExpectLogs('Build and compile CLI for all target platforms')
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════
// CLI Config Command Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – cli config commands', origin)
  .Intent('cli config get help', (int) =>
    int
      .Args(['cli', 'config', 'get', '--help'])
      .ExpectLogs('Get a value from a JSON config file')
      .ExpectExit(0))
  .Intent('cli config set help', (int) =>
    int
      .Args(['cli', 'config', 'set', '--help'])
      .ExpectLogs('Set a value in a JSON config file')
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════
// CLI Install Subcommands Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – cli install subcommands', origin)
  .Intent('cli install scripts help', (int) =>
    int
      .Args(['cli', 'install', 'scripts', '--help'])
      .ExpectLogs('Generate install.sh')
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════
// Projects Command Group Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – projects command group help', origin)
  .Intent('projects help shows dynamic segment', (int) =>
    int
      .Args(['projects', '--help'])
      .ExpectLogs('[projectRef]')
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════
// Task Command Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – task command', origin)
  .Intent('task help shows description', (int) =>
    int
      .Args(['task', '--help'])
      .ExpectLogs('Run a deno task', 'project', 'task')
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════
// Upgrade Command Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – upgrade command', origin)
  .Intent('upgrade help shows description', (int) =>
    int
      .Args(['upgrade', '--help'])
      .ExpectLogs('Upgrade ftm CLI')
      .ExpectExit(0))
  .Run();

// ═══════════════════════════════════════════════════════════════════
// Error Handling Tests
// ═══════════════════════════════════════════════════════════════════

CLIIntents('Fathym CLI – error handling', origin)
  .Intent('unknown command shows error', (int) =>
    int
      .Args(['notfound'])
      .ExpectLogs('Unknown command')
      .ExpectExit(1))
  .Intent('empty args shows help', (int) =>
    int
      .Args([])
      .ExpectLogs('Available Commands')
      .ExpectExit(0))
  .Run();
