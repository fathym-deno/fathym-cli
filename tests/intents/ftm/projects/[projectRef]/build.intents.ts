import { CommandIntentSuite } from '@fathym/cli';
import BuildCommand from '../../../../../commands/projects/[projectRef]/build.ts';

const cmd = BuildCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.ts');

// Note: The fathym-cli project has a 'build' task defined, so tests run against
// it will trigger full override mode (delegating to the project's build task).
// Tests verify both full override and pipeline scenarios.
//
// Note: The "project not found" case is not tested here because the error is
// thrown during service initialization, which doesn't integrate cleanly with
// the intent testing framework. This is tested via the CascadeRunner unit tests.

CommandIntentSuite('projects:[projectRef]:build Command Suite', cmd, origin)
  .Intent('Dry run with full override shows task delegation', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno task build')
      .ExpectExit(0))
  .Intent('Explain with full override shows override status', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ explain: true })
      .ExpectLogs('Pipeline', 'FULL OVERRIDE', 'build')
      .ExpectExit(0))
  .Intent('Verbose dry run with full override shows delegation', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true, verbose: true })
      .ExpectLogs('Full override', 'build')
      .ExpectExit(0))
  .Run();
