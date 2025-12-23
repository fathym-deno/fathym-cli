import { CLIDFSContextManager } from "@fathym/cli";
import type { DFSFileHandler } from "@fathym/dfs";
import { isAbsolute, normalize } from "@std/path";

export const GitOpsTargetDFSName = "git-ops-target";

export async function RegisterGitOpsTargetDFS(
  dfsCtx: CLIDFSContextManager,
  targetPath: string,
): Promise<DFSFileHandler> {
  const normalizedPath = await NormalizeGitOpsTargetPath(dfsCtx, targetPath);

  dfsCtx.RegisterCustomDFS(GitOpsTargetDFSName, {
    FileRoot: normalizedPath,
  });

  return await dfsCtx.GetDFS(GitOpsTargetDFSName);
}

export async function ResolveGitOpsTargetDFS(
  dfsCtx: CLIDFSContextManager,
): Promise<DFSFileHandler | undefined> {
  try {
    return await dfsCtx.GetDFS(GitOpsTargetDFSName);
  } catch {
    return undefined;
  }
}

export async function ResolveGitOpsWorkingDFS(
  dfsCtx: CLIDFSContextManager,
): Promise<DFSFileHandler> {
  const targetDFS = await ResolveGitOpsTargetDFS(dfsCtx);
  if (targetDFS) {
    return targetDFS;
  }

  return await dfsCtx.GetExecutionDFS();
}

export async function NormalizeGitOpsTargetPath(
  dfsCtx: CLIDFSContextManager,
  targetPath: string,
): Promise<string> {
  const trimmed = targetPath.trim();
  if (!trimmed) {
    throw new Error("Git target path cannot be empty.");
  }

  if (isAbsolute(trimmed)) {
    return normalize(trimmed);
  }

  const executionDFS = await dfsCtx.GetExecutionDFS();
  const resolved = executionDFS.ResolvePath(trimmed);

  return normalize(resolved);
}
