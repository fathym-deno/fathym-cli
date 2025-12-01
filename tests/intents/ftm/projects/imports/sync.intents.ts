import { CommandIntents } from '@fathym/cli';
import SyncCommand from '../../../../../commands/projects/imports/sync.ts';

const cmd = SyncCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.json');

CommandIntents('projects:imports:sync Command Suite', cmd, origin)
  .Intent('Fails gracefully for non-existent target', (int) =>
    int
      .Args([])
      .Flags({ mode: 'local', target: '@nonexistent/package' })
      .ExpectExit(1))
  .Intent('Fails gracefully for non-existent directory target', (int) =>
    int
      .Args([])
      .Flags({ mode: 'remote', target: './nonexistent-directory' })
      .ExpectExit(1))
  .Run();
