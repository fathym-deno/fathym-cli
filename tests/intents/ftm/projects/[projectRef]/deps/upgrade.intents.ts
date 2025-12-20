import { CommandIntentSuite } from '@fathym/cli';
import UpgradeCommand from '../../../../../../commands/projects/[projectRef]/deps/upgrade.ts';

const cmd = UpgradeCommand.Build();
const origin = import.meta.resolve('../../../../../../.cli.ts');

// Note: The deps:upgrade command requires network access to query registries,
// so most tests use dry-run mode to verify command structure without making
// actual network requests.

CommandIntentSuite('projects:[projectRef]:deps:upgrade Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows available upgrades', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN')
      .ExpectExit(0))
  .Intent('Mode flag accepts valid values', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true, mode: 'jsr' })
      .ExpectExit(0))
  .Intent('Channel flag is accepted', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true, channel: 'integration' })
      .ExpectExit(0))
  .Intent('Package filter flag is accepted', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true, package: '@fathym/common' })
      .ExpectExit(0))
  .Intent('Verbose shows detailed information', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true, verbose: true })
      .ExpectLogs('project')
      .ExpectExit(0))
  .Run();
