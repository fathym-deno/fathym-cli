/**
 * Git command group metadata and scoped services.
 *
 * Registers git-specific services (GitService, GitConfigStore) so every
 * command under `git/` can resolve them from the group's IoC scope.
 *
 * @module
 */

import { CLIDFSContextManager, Group } from '@fathym/cli';
import { RegisterGitOpsTargetDFS } from '../../src/git/.exports.ts';
import { GitConfigStore, GitService } from '../../src/services/.exports.ts';

type GitGroupServices = {
  DFSContext: CLIDFSContextManager;
};

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
  })
  .InitCommand((cmd) =>
    cmd
      .Services(async (_ctx, ioc): Promise<GitGroupServices> => {
        const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
        return { DFSContext: dfsCtx };
      })
      .Run(async ({ Services, Params, Commands, Log }) => {
        const target = extractTargetFlag(Params.Flags.flags);

        if (target) {
          const targetDFS = await RegisterGitOpsTargetDFS(Services.DFSContext, target);
          Log.Debug(`git: using target DFS root ${targetDFS.Root}`);
        }

        return await Commands!.$Command(Params.Flags.args, Params.Flags.flags);
      })
  );

function extractTargetFlag(
  flags: Record<string, unknown>,
): string | undefined {
  const value = flags?.target;
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
