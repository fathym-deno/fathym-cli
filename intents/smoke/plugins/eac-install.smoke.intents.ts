/**
 * EaC Install plugin smoke tests.
 *
 * Verifies the ftm-eac-install plugin is properly composed
 * and accessible via `ftm eac` commands.
 *
 * @module
 */

import { CLIIntentSuite } from '@fathym/cli';
import CLI from '../../../.cli.ts';

CLIIntentSuite('EaC Install Plugin Smoke Tests', CLI)
  .Intent('ftm eac --help shows EaC commands', (int) =>
    int
      .Args(['eac', '--help'])
      .ExpectLogs('install', 'list')
      .ExpectExit(0))
  .Intent('ftm eac list shows templates', (int) =>
    int
      .Args(['eac', 'list'])
      .ExpectLogs('runtime', 'api', 'sink')
      .ExpectExit(0))
  .Run();
