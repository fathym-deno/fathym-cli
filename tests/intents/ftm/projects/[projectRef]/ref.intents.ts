import { CommandIntentSuite } from '@fathym/cli';
import RefCommand from '../../../../../commands/projects/[projectRef]/ref.ts';

const cmd = RefCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.ts');

CommandIntentSuite('projects:[projectRef]:ref Command Suite', cmd, origin)
  .Intent('Displays project info for valid project', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .ExpectLogs('Package:', 'Directory:', 'Config:')
      .ExpectExit(0))
  .Intent('Fails gracefully for non-existent project', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .ExpectExit(1))
  .Intent('JSON output for valid project', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ json: true })
      .ExpectLogs('"name":', '"dir":', '"configPath":')
      .ExpectExit(0))
  .Intent('Filter references by source type', (int) =>
    int
      .Segments({
        projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc',
      })
      .Flags({ filter: 'config' })
      .ExpectLogs('Referenced By')
      .ExpectExit(0))
  .Intent('Filter references by project ref', (int) =>
    int
      .Segments({
        projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc',
      })
      .Flags({ filter: '@fathym/test-app-no-dependents' })
      .ExpectLogs('Referenced By')
      .ExpectExit(0))
  .Intent(
    'Filter references by combined source type and project ref',
    (int) =>
      int
        .Segments({
          projectRef: './tests/fixtures/ref-workspace/lib-a/deno.jsonc',
        })
        .Flags({ filter: 'config,@fathym/test-app-no-dependents' })
        .ExpectLogs('Referenced By')
        .ExpectExit(0),
  )
  .Run();
