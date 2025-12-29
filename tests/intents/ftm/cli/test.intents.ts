import { CommandIntentSuite } from '@fathym/cli';
import TestCommand from '../../../../commands/cli/test.ts';

CommandIntentSuite(
  'Test Command Suite',
  TestCommand,
  import.meta.resolve('../../../../.cli.ts'),
)
  .Intent('Run default CLI test file', (int) =>
    int
      .Args([]) // defaults to test/my-cli/intents/.intents.ts
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
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
        config: './tests/.temp/my-cli/.cli.ts',
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
      .Args([])
      .Flags({
        config: './tests/.temp/my-cli/.cli.ts',
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
