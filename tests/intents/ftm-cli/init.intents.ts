import { CommandIntents } from '../../test.deps.ts';
import InitCommand from '../../../commands/init.ts';

CommandIntents(
  'Init Command Suite',
  InitCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  .Intent("Init with default 'hello' template", (int) =>
    int
      .Args(['./test/my-cli'])
      .Flags({})
      .ExpectLogs(
        `Project created from "hello" template.`,
        '📂 Initialized at:',
      )
      .ExpectExit(0))
  .Run();
