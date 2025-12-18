/**
 * Git command group metadata and scoped services.
 *
 * Registers git-specific services (GitService, GitConfigStore) so every
 * command under `git/` can resolve them from the group's IoC scope.
 *
 * @module
 */

import { CLIDFSContextManager, Group } from '@fathym/cli';
import { GitConfigStore, GitService } from '../../src/services/.exports.ts';

export default Group('git')
  .Description('Automation helpers for git workflows')
  .OnInit((ioc) => {
    ioc.Register(GitService, () => new GitService());

    ioc.Register(
      GitConfigStore,
      async () => {
        const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
        const configDFS = await dfsCtx.GetConfigDFS();
        return new GitConfigStore(configDFS);
      },
    );
  });
