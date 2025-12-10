import { assertMatch } from 'jsr:@std/assert@1.0.3';
import { captureLogs, CLIRuntime } from '@fathym/cli';

Deno.test('Fathym CLI – help renders', async () => {
  const configPath = './.cli.json';
  const config = JSON.parse(await Deno.readTextFile(configPath));
  const cli = CLIRuntime();

  const logs = await captureLogs(async () => {
    await cli.RunWithConfig(config, ['--help'], configPath);
  });

  assertMatch(logs, /Fathym CLI/i);
  assertMatch(logs, /Usage:/i);
});
