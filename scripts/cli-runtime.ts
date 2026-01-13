import CLI from '../.cli.ts';
import { Runner } from '@fathym/cli';

await Runner()
  .FromModuleBuilder(CLI, Deno.args)
  .Execute();
