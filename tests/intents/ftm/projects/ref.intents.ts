import { CommandIntents } from '@fathym/cli';
import RefCommand from '../../../../commands/projects/ref.ts';

const cmd = RefCommand.Build();
const origin = import.meta.resolve('../../../../.cli.json');

// Note: The ref command requires a valid project reference to work with.
// Tests use the fathym-cli project itself (./deno.jsonc) as the test subject.
// Git operations and JSR version lookups may produce different results depending
// on the test environment.
//
// Note: The "project not found" error message check is skipped because the CLI
// framework's log capture doesn't capture Log.Error output in a way the intent
// testing framework can match against. The exit code check is sufficient.

CommandIntents('projects:ref Command Suite', cmd, origin)
  .Intent('Displays project info for valid project', (int) =>
    int
      .Args(['./deno.jsonc'])
      .ExpectLogs('Package:', 'Directory:', 'Config:')
      .ExpectExit(0))
  .Intent('JSON output for valid project', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ json: true })
      .ExpectLogs('"name":', '"dir":', '"configPath":')
      .ExpectExit(0))
  .Intent('Shows tasks information', (int) =>
    int
      .Args(['./deno.jsonc'])
      .ExpectLogs('Tasks:', 'Has Build Task:')
      .ExpectExit(0))
  .Intent('Shows git information when available', (int) =>
    int
      .Args(['./deno.jsonc'])
      .ExpectLogs('Git Branch:')
      .ExpectExit(0))
  .Intent('Fails for non-existent project', (int) =>
    int
      .Args(['@nonexistent/package'])
      .ExpectExit(1))
  // referencedBy tests using the test fixture workspace with real package names
  // lib-a represents @fathym/common, app-b represents @fathym/cli which imports @fathym/common
  .Intent('Shows referencedBy for package with dependents', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc'])
      .ExpectLogs('Referenced By', 'app-b')
      .ExpectExit(0))
  .Intent('JSON output includes referencedBy array with version', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc'])
      .Flags({ json: true })
      .ExpectLogs('"referencedBy":', '"currentVersion":', '0.2.299')
      .ExpectExit(0))
  .Intent('Shows no references for package without dependents', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/app-b/deno.jsonc'])
      .ExpectLogs('Referenced By: (no references found)')
      .ExpectExit(0))
  .Intent('JSON output includes .deps.ts file references', (int) =>
    int
      .Args(['./tests/fixtures/ref-workspace/lib-a/deno.jsonc'])
      .Flags({ json: true })
      .ExpectLogs('"source":', '"deps"')
      .ExpectExit(0))
  .Run();
