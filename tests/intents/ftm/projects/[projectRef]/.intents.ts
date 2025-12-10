import { GroupIntents } from '@fathym/cli';
import ProjectRefGroupMetadata from '../../../../commands/projects/[projectRef]/.group.ts';

const group = ProjectRefGroupMetadata.Build();
const origin = import.meta.resolve('../../../../.cli.json');

GroupIntents('projects:[projectRef] Group Suite', group, origin)
  .Intent('Group metadata loaded correctly', (int) =>
    int
      .ExpectDescription('Commands that operate on a resolved project reference'))
  .Run();
