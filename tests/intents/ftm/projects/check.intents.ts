import { CommandIntents } from '@fathym/cli';
import CheckCommand from '../../../../commands/projects/check.ts';

const cmd = CheckCommand.Build();
const origin = import.meta.resolve('../../../../.cli.json');

CommandIntents('projects:check Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Args(['@nonexistent/package'])
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno check')
      .ExpectExit(0))
  .Run();
