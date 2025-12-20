import { CommandIntentSuite } from '@fathym/cli';
import SyncCommand from '../../../../../../commands/projects/[projectRef]/imports/sync.ts';

const cmd = SyncCommand.Build();
const origin = import.meta.resolve('../../../../../../.cli.ts');

CommandIntentSuite('projects:[projectRef]:imports:sync Command Suite', cmd, origin)
  .Intent('Fails gracefully for non-existent project', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Args([])
      .Flags({ mode: 'local' })
      .ExpectExit(1))
  .Intent('Fails gracefully for non-existent directory', (int) =>
    int
      .Segments({ projectRef: './nonexistent-directory' })
      .Args([])
      .Flags({ mode: 'remote' })
      .ExpectExit(1))
  .Run();
