import { GroupIntents } from '@fathym/cli';
import ImportsGroupMetadata from '../../../../../../commands/projects/[projectRef]/imports/.group.ts';

const group = ImportsGroupMetadata.Build();
const origin = import.meta.resolve('../../../../../../.cli.json');

GroupIntents('projects:[projectRef]:imports Group Suite', group, origin)
  .Intent('Group metadata loaded correctly', (int) =>
    int
      .ExpectDescription('Import map management commands'))
  .Run();
