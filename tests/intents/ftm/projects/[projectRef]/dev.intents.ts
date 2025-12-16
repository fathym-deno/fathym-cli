import { CommandIntents } from '@fathym/cli';
import DevCommand from '../../../../../commands/projects/[projectRef]/dev.ts';

const cmd = DevCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.ts');

CommandIntents('projects:[projectRef]:dev Command Suite', cmd, origin)
  .Intent(
    'Fails when no project reference provided',
    (int) =>
      int
        .Segments({ projectRef: '' })
        .Flags({})
        .ExpectExit(1),
  )
  .Intent('Fails gracefully for non-existent project', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .Flags({})
      .ExpectExit(1))
  .Run();
