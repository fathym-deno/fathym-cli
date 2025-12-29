import { CommandIntentSuite } from '@fathym/cli';
import InitCommand from '../../../../commands/cli/init.ts';

const TEMP_CLI_PATH = './tests/.temp/my-cli';

CommandIntentSuite(
  'Init Command Suite',
  InitCommand,
  import.meta.resolve('../../../../.cli.ts'),
)
  .BeforeAll(async () => {
    await Deno.remove(TEMP_CLI_PATH, { recursive: true }).catch(() => {});
  })
  .Intent("Init with default 'init' template", (int) =>
    int
      .Args([TEMP_CLI_PATH])
      .Flags({})
      .ExpectLogs(
        `Project created from "init" template.`,
        '📂 Initialized at:',
      )
      .ExpectExit(0))
  .Run();
