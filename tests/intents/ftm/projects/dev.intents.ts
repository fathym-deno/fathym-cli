import { CommandIntents } from '@fathym/cli';
import DevCommand from '../../../../commands/projects/dev.ts';

const cmd = DevCommand.Build();
const origin = import.meta.resolve('../../../../.cli.json');

CommandIntents('projects:dev Command Suite', cmd, origin)
  .Intent(
    'Fails when no project reference provided and no projects found',
    (int) =>
      int
        .Args([])
        .Flags({})
        .ExpectExit(1),
  )
  .Intent('Fails gracefully for non-existent project', (int) =>
    int
      .Args(['@nonexistent/package'])
      .Flags({})
      .ExpectExit(1))
  .Run();
