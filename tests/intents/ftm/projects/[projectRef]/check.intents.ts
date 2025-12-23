import { CommandIntentSuite } from '@fathym/cli';
import CheckCommand from '../../../../../commands/projects/[projectRef]/check.ts';

const cmd = CheckCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.ts');

CommandIntentSuite('projects:[projectRef]:check Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno check')
      .ExpectExit(0))
  .Run();
