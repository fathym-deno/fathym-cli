import { CommandIntents } from '@fathym/cli';
import UpgradeCommand from '../../../../commands/projects/upgrade.ts';

const cmd = UpgradeCommand.Build();
const origin = import.meta.resolve('../../../../.cli.json');

// Note: The upgrade command modifies files in the workspace.
// Tests use --dry-run to avoid actual file modifications.
// The test fixture workspace is used for predictable test results.

CommandIntents('projects:upgrade Command Suite', cmd, origin)
  .Intent('Dry run shows what would be upgraded', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc', '0.3.0'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('Upgrading', '@fathym/common', '0.3.0', 'app-b')
      .ExpectExit(0))
  .Intent('JSON output for dry run', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc', '0.3.0'])
      .Flags({ 'dry-run': true, json: true })
      .ExpectLogs('"file":', '"oldVersion":', '"newVersion":', '"success":')
      .ExpectExit(0))
  .Intent('No references found message', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/app-b/deno.jsonc', '1.0.0'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('No references')
      .ExpectExit(0))
  .Intent('Filter by source type - config only', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc', '0.3.0'])
      .Flags({ 'dry-run': true, filter: 'config' })
      // Config source has no label, but we verify it finds deno.jsonc files
      .ExpectLogs('Upgrading', 'deno.jsonc')
      .ExpectExit(0))
  .Intent('Filter by source type - deps only', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc', '0.3.0'])
      .Flags({ 'dry-run': true, filter: 'deps' })
      // Deps source shows [.deps.ts] label
      .ExpectLogs('Upgrading', '[.deps.ts]')
      .ExpectExit(0))
  .Intent('Fails for non-existent project', (int) =>
    int
      .Args(['@nonexistent/package', '1.0.0'])
      .ExpectExit(1))
  .Run();
