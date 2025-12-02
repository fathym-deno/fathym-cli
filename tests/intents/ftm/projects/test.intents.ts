import { CommandIntents } from '@fathym/cli';
import TestCommand from '../../../../commands/projects/test.ts';

const cmd = TestCommand.Build();
const origin = import.meta.resolve('../../../../.cli.json');

CommandIntents('projects:test Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Args(['@nonexistent/package'])
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno', 'test')
      .ExpectExit(0))
  .Intent('Coverage flag is included in dry run output', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true, coverage: true })
      .ExpectLogs('--coverage')
      .ExpectExit(0))
  .Run();
