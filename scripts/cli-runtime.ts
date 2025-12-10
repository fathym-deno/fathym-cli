import { CLIRuntime } from '@fathym/cli';

await CLIRuntime()
  .FromArgs(Deno.args)
  .Execute();
