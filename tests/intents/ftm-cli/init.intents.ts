import { CommandIntents } from '@fathym/cli';
import InitCommand from '../../../commands/init.ts';

CommandIntents(
  'Init Command Suite',
  InitCommand.Build(),
  import.meta.resolve('../../../.cli.json'),
)
  .Intent("Init with default 'init' template", (int) =>
    int
      .Args(['./.temp/my-cli'])
      .Flags({})
      .ExpectLogs(
        `Project created from "init" template.`,
        '📂 Initialized at:',
      )
      .ExpectExit(0))
  .Run();
