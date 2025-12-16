import { Runner } from '@fathym/cli';

await Runner()
  .FromArgs(Deno.args)
  .Execute();
