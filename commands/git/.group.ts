/**
 * Git command group metadata and scoped services.
 *
 * Registers git-specific services (GitService, GitConfigStore) so every
 * command under `git/` can resolve them from the group's IoC scope.
 *
 * @module
 */

import { CLIDFSContextManager, Group } from "@fathym/cli";
import type { DFSFileHandler } from "@fathym/dfs";
import { RegisterGitOpsTargetDFS } from "../../src/git/.exports.ts";
import {
  FathymApiClient,
  FathymConfigStore,
  FathymGitHubLookupService,
  GitConfigStore,
  GitService,
} from "../../src/services/.exports.ts";

type GitGroupServices = {
  DFSContext: CLIDFSContextManager;
};

export default Group("git")
  .Description("Automation helpers for git workflows")
  .OnInit((ioc) => {
    ioc.Register(GitService, () => new GitService());

    ioc.Register(
      GitConfigStore,
      async () => {
        const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
        const configDFS = await resolveConfigDFS(dfsCtx);
        return new GitConfigStore(configDFS);
      },
    );

    ioc.Register(
      FathymConfigStore,
      async () => {
        const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
        const configDFS = await resolveConfigDFS(dfsCtx);
        return new FathymConfigStore(configDFS);
      },
    );

    ioc.Register(
      FathymApiClient,
      async () => {
        const store = await ioc.Resolve(FathymConfigStore);
        return new FathymApiClient(store);
      },
    );

    ioc.Register(
      FathymGitHubLookupService,
      async () =>
        new FathymGitHubLookupService(await ioc.Resolve(FathymApiClient)),
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
          const targetDFS = await RegisterGitOpsTargetDFS(
            Services.DFSContext,
            target,
          );
          Log.Info(`git: using target DFS root ${targetDFS.Root}`);
        }

        return await Commands!.$Command(Params.Flags.args, Params.Flags.flags);
      })
  );

function extractTargetFlag(
  flags: Record<string, unknown>,
): string | undefined {
  const value = flags?.target;
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function resolveConfigDFS(
  dfsCtx: CLIDFSContextManager,
): Promise<DFSFileHandler> {
  try {
    return await dfsCtx.GetConfigDFS();
  } catch {
    return await dfsCtx.GetExecutionDFS();
  }
}
