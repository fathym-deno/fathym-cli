import { CommandIntents } from '@fathym/cli';
import TaskCommand from '../../../commands/task.ts';

const cmd = TaskCommand.Build();
const origin = import.meta.resolve('../../../.cli.ts');

CommandIntents('task Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Args(['@nonexistent/package', 'build'])
      .Flags({})
      .ExpectExit(1))
  .Intent('Fails when task not found in project', (int) =>
    int
      .Args(['./deno.jsonc', 'nonexistent-task'])
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Args(['./deno.jsonc', 'build'])
      .Flags({ 'dry-run': true })
      .ExpectExit(0))
  .Run();
