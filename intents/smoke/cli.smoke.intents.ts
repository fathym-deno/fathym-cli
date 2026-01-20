/**
 * CLI smoke tests for Fathym CLI.
 *
 * Verifies the CLI loads and basic functionality works.
 *
 * @module
 */

import { CLIIntentSuite } from '@fathym/cli';
import CLI from '../../.cli.ts';

CLIIntentSuite('Fathym CLI Smoke Tests', CLI)
  .Intent('CLI loads and shows help', (int) =>
    int
      .Args(['--help'])
      .ExpectLogs('Fathym CLI')
      .ExpectExit(0))
  .Intent('CLI shows version', (int) =>
    int
      .Args(['--version'])
      .ExpectLogs('0.0.0')
      .ExpectExit(0))
  .Run();
