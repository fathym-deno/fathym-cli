import { CommandIntentSuite } from '@fathym/cli';
import DevCommand from '../../../../commands/projects/[projectRef]/dev.ts';
import CLI from '../../../../.cli.ts';

CommandIntentSuite('projects:[projectRef]:dev Command Suite', DevCommand, CLI)
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
