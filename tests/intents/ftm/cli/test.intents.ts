import { CommandIntents } from '@fathym/cli';
import TestCommand from '../../../../commands/cli/test.ts';

CommandIntents(
  'Test Command Suite',
  TestCommand.Build(),
  import.meta.resolve('../../../../.cli.json'),
)
  .Intent('Run default CLI test file', (int) =>
    int
      .Args([undefined]) // defaults to test/my-cli/intents/.intents.ts
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
      })
      .ExpectLogs(
        '🧪 Running tests from:',
        '➡️  deno test -A',
        '✅ Tests passed successfully',
      )
      .ExpectExit(0))
  .Intent('Run a specific test file with filter', (int) =>
    int
      .Args(['./intents/.intents.ts'])
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
        filter: 'hello',
      })
      .ExpectLogs(
        '🧪 Running tests from:',
        '➡️  deno test -A --filter=hello',
        '✅ Tests passed successfully',
      )
      .ExpectExit(0))
  .Intent('Run tests with coverage and no type check', (int) =>
    int
      .Args([undefined])
      .Flags({
        config: './tests/.temp/my-cli/.cli.json',
        coverage: './cov',
        'no-check': true,
      })
      .ExpectLogs(
        '🧪 Running tests from:',
        '➡️  deno test -A --coverage=./cov --no-check',
        '✅ Tests passed successfully',
      )
      .ExpectExit(0))
  .Run();
