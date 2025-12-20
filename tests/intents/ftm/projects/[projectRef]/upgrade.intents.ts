import { CommandIntentSuite } from '@fathym/cli';
import UpgradeCommand from '../../../../../commands/projects/[projectRef]/upgrade.ts';

const cmd = UpgradeCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.ts');

// Note: The upgrade command modifies files in the workspace.
// Tests use --dry-run to avoid actual file modifications.
// The test fixture workspace is used for predictable test results.
//
// With dynamic routing, the project reference comes from [projectRef] segment,
// and the version comes from positional args.

CommandIntentSuite('projects:[projectRef]:upgrade Command Suite', cmd, origin)
  .Intent('Dry run shows what would be upgraded', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc' })
      .Args(['0.3.0'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('Upgrading', '@fathym/test-lib-a', '0.3.0', 'app-b')
      .ExpectExit(0))
  .Intent('JSON output for dry run', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc' })
      .Args(['0.3.0'])
      .Flags({ 'dry-run': true, json: true })
      .ExpectLogs('"file":', '"oldVersion":', '"newVersion":', '"success":')
      .ExpectExit(0))
  .Intent('No references found message', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/app-b/deno.jsonc' })
      .Args(['1.0.0'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('No references')
      .ExpectExit(0))
  .Intent('Filter by source type - config only', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc' })
      .Args(['0.3.0'])
      .Flags({ 'dry-run': true, filter: 'config' })
      // Config source has no label, but we verify it finds deno.jsonc files
      .ExpectLogs('Upgrading', 'deno.jsonc')
      .ExpectExit(0))
  .Intent('Filter by source type - deps only', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc' })
      .Args(['0.3.0'])
      .Flags({ 'dry-run': true, filter: 'deps' })
      // Deps source shows [.deps.ts] label
      .ExpectLogs('Upgrading', '[.deps.ts]')
      .ExpectExit(0))
  .Intent('Fails for non-existent project', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Args(['1.0.0'])
      .ExpectExit(1))
  .Intent('Filter by project ref - limits to specific project', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc' })
      .Args(['0.3.0'])
      .Flags({ 'dry-run': true, filter: '@fathym/test-app-b' })
      // Should only show references from the filtered project
      .ExpectLogs('Upgrading', '@fathym/test-lib-a', '0.3.0')
      .ExpectExit(0))
  .Intent('Filter by combined source type and project ref', (int) =>
    int
      .Segments({ projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc' })
      .Args(['0.3.0'])
      .Flags({ 'dry-run': true, filter: 'config,@fathym/test-app-b' })
      // Should only show config files from the filtered project
      .ExpectLogs('Upgrading', 'deno.jsonc')
      .ExpectExit(0))
  .Run();
