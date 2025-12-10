import { CommandIntents } from '@fathym/cli';
import RefCommand from '../../../../../commands/projects/[projectRef]/ref.ts';

const cmd = RefCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.json');

CommandIntents('projects:[projectRef]:ref Command Suite', cmd, origin)
  .Intent('Displays project info for valid project', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .ExpectLogs('Package:', 'Directory:', 'Config:')
      .ExpectExit(0))
  .Intent('Fails gracefully for non-existent project', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package' })
      .ExpectExit(1))
  .Intent('JSON output for valid project', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ json: true })
      .ExpectLogs('"name":', '"dir":', '"configPath":')
      .ExpectExit(0))
  .Run();
