import { CommandIntentSuite } from '@fathym/cli';
import FmtCommand from '../../../../../commands/projects/[projectRef]/fmt.ts';

const origin = import.meta.resolve('../../../../../.cli.ts');

CommandIntentSuite('projects:[projectRef]:fmt Command Suite', FmtCommand, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno fmt')
      .ExpectExit(0))
  .Run();
