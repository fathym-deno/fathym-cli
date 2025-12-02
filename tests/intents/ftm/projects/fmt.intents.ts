import { CommandIntents } from '@fathym/cli';
import FmtCommand from '../../../../commands/projects/fmt.ts';

const cmd = FmtCommand.Build();
const origin = import.meta.resolve('../../../../.cli.json');

CommandIntents('projects:fmt Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Args(['@nonexistent/package'])
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno fmt')
      .ExpectExit(0))
  .Intent('Check flag is included in dry run output', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true, check: true })
      .ExpectLogs('--check')
      .ExpectExit(0))
  .Run();
