import { GroupIntentSuite } from '@fathym/cli';
import gitGroup from '../../../../commands/git/.group.ts';
import testCLI from './.test.cli.ts';

GroupIntentSuite('git group lifecycle suite', gitGroup, testCLI)
  .Intent('initializes git services', (int) =>
    int
      .ExpectOnInitCalled()
      .ExpectExit(0))
  .Run();
