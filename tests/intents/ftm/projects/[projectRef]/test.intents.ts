import { CommandIntentSuite } from '@fathym/cli';
import TestCommand from '../../../../../commands/projects/[projectRef]/test.ts';

const origin = import.meta.resolve('../../../../../.cli.ts');

CommandIntentSuite('projects:[projectRef]:test Command Suite', TestCommand, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno', 'test')
      .ExpectExit(0))
  .Run();
