/**
 * CLI Framework plugin smoke tests.
 *
 * Verifies the ftm-cli plugin is properly composed
 * and accessible via `ftm cli` commands.
 *
 * @module
 */

import { CLIIntentSuite } from '@fathym/cli';
import CLI from '../../../.cli.ts';

CLIIntentSuite('CLI Framework Plugin Smoke Tests', CLI)
  .Intent('ftm cli --help shows CLI framework commands', (int) =>
    int
      .Args(['cli', '--help'])
      .ExpectLogs('build', 'compile')
      .ExpectExit(0))
  .Run();
