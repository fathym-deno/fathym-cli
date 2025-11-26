import { assertMatch } from 'jsr:@std/assert@1.0.3';
import { captureLogs, CLI } from '@fathym/cli';

Deno.test('Fathym CLI – help renders', async () => {
  const configPath = './.cli.json';
  const config = JSON.parse(await Deno.readTextFile(configPath));
  const cli = new CLI();

  const logs = await captureLogs(() =>
    cli.RunWithConfig(config, ['--help'], configPath)
  );

  assertMatch(logs, /Fathym CLI/i);
  assertMatch(logs, /Usage:/i);
});
