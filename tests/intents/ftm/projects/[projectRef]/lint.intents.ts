import { CommandIntentSuite } from '@fathym/cli';
import LintCommand from '../../../../../commands/projects/[projectRef]/lint.ts';

const origin = import.meta.resolve('../../../../../.cli.ts');

CommandIntentSuite('projects:[projectRef]:lint Command Suite', LintCommand, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno lint')
      .ExpectExit(0))
  .Run();
