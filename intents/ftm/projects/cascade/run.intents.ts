/**
 * Intent tests for the cascade run command.
 *
 * The run command executes a cascade schedule layer by layer,
 * with packages in each layer running in parallel.
 *
 * @module
 */

import { CommandIntentSuite } from '@fathym/cli';
import RunCommand from '../../../../commands/projects/cascade/run.ts';
import CLI from '../../../../.cli.ts';

CommandIntentSuite(
  'projects:cascade:run Command Suite',
  RunCommand,
  CLI,
)
  .Intent('Dry run shows what would be executed', (int) =>
    int
      .Flags({
        'dry-run': true,
        'schedule-file': './tests/fixtures/cascade-schedule.json',
      })
      .ExpectLogs('[DRY RUN]', 'Layer 0', 'Layer 1')
      .ExpectExit(0))
  .Intent('Fails for invalid schedule JSON', (int) =>
    int
      .Flags({
        'schedule-file': './tests/fixtures/invalid-schedule.json',
      })
      .ExpectLogs('Failed to read', 'schedule file')
      .ExpectExit(1))
  .Intent('Fails for empty layers', (int) =>
    int
      .Flags({
        'schedule-file': './tests/fixtures/empty-layers-schedule.json',
      })
      .ExpectLogs('no layers')
      .ExpectExit(1))
  .Intent('Reports progress for each layer', (int) =>
    int
      .Flags({
        'dry-run': true,
        'schedule-file': './tests/fixtures/cascade-schedule.json',
      })
      .ExpectLogs('Layer 0', 'Layer 1', 'Summary')
      .ExpectExit(0))
  .Intent('JSON output contains execution results', (int) =>
    int
      .Flags({
        'dry-run': true,
        json: true,
        'schedule-file': './tests/fixtures/cascade-schedule.json',
      })
      .ExpectLogs('"root":', '"success":', '"totalPackages":')
      .ExpectExit(0))
  .Intent('Fails for non-existent schedule file', (int) =>
    int
      .Flags({
        'schedule-file': './nonexistent-file.json',
      })
      .ExpectLogs('not found')
      .ExpectExit(1))
  .Run();
