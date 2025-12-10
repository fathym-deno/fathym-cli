import { CommandIntents } from '@fathym/cli';
import LintCommand from '../../../../../commands/projects/[projectRef]/lint.ts';

const cmd = LintCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.json');

CommandIntents('projects:[projectRef]:lint Command Suite', cmd, origin)
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
