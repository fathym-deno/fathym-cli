import { CommandIntents } from '@fathym/cli';
import PublishCheckCommand from '../../../../../commands/projects/publish/check.ts';

const cmd = PublishCheckCommand.Build();
const origin = import.meta.resolve('../../../../../.cli.json');

CommandIntents('projects:publish:check Command Suite', cmd, origin)
  .Intent('Fails when project not found', (int) =>
    int
      .Args(['@nonexistent/package'])
      .Flags({})
      .ExpectExit(1))
  .Intent('Dry run shows what would execute', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true })
      .ExpectLogs('DRY RUN', 'deno publish', '--dry-run', '--allow-dirty')
      .ExpectExit(0))
  .Intent('Verbose shows detailed output', (int) =>
    int
      .Args(['./deno.jsonc'])
      .Flags({ 'dry-run': true, verbose: true })
      .ExpectLogs('DRY RUN')
      .ExpectExit(0))
  .Run();
