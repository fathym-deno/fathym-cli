---
FrontmatterVersion: 1
DocumentType: Guide
Title: Git Commands Migration Plan
Summary: Phased plan for porting the legacy OCLIF git commands into the new Fathym CLI runtime.
Created: 2025-12-17
Updated: 2025-12-17
Owners:
  - fathym
References:
  - Label: Project README
    Path: ../README.md
  - Label: Project Guide
    Path: ../GUIDE.md
  - Label: Project Agents Guide
    Path: ../AGENTS.md
  - Label: Workspace Guide
    Path: ../../WORKSPACE_GUIDE.md
---

# Git Commands Migration Plan

Structured plan for rebuilding every `fathym git …` command from the legacy OCLIF CLI (`libraries/old-fathym/ftm-eac-cli`) inside the new Deno-based `@fathym/ftm` CLI.

## Goals

- Preserve the existing user flows (`configure → clone → feature/hotfix → commit/sync`) so deploy scripts that call `fathym git …` keep working.
- Replace the Node dependencies (Listr2, inquirer, axios, keytar) with lightweight Deno-native services.
- Keep the “configure first” guardrail: cloning or mirroring should only work against repos that were provisioned via `fathym git configure`.

## Constraints & Assumptions

- We can keep shipping commands under the `ftm` binary; doc/task migrations from `fathym` → `ftm` happen later.
- We may call the existing backend endpoints (`/github/organizations/...`) exactly as the legacy CLI did; they already implement repo creation, branch protection, workflow seeding, etc.
- New helpers (task runner, prompts, spinners) should live in `projects/open-source/fathym-cli/src/services/` and stay generic enough for other commands later.

## Implementation Phases & Checklists

### Phase 0 - Scaffolding

- [ ] Decide if/when to add the `fathym` token alias (can wait until release tasks flip to `ftm`).
- [x] Build `TaskPipeline` (titles, skip/enable hooks, nested tasks, spinners).
- [x] Build `Spinner` helper (start/succeed/fail) compatible with Deno.
- [x] Build `GitService` (`run`, `runChecked`, dry-run logging, cwd control).
- [x] Build `GitConfigStore` backed by ConfigDFS (default path `git/config.json`).
- [x] Add prompt utilities (select/input with optional default-from-local logic).

### Phase 1 - Local Git Workflows

Deliverable: commands that only touch local git state.

- [x] `commands/git/.group.ts`
  - [x] Describe the group (`Group('git')`) and attach `.OnInit` hook.
  - [x] Register git-scoped services (e.g., `GitService`, `GitConfigStore`) with IoC so child commands can `ioc.Resolve`.
- [x] `commands/git/index.ts` (`ftm git` default sync):
  - [x] Confirm git repo.
  - [x] Stage/commit (prompt for message if needed).
  - [x] Fetch + merge/rebase origin/integration (flag selectable).
  - [x] Pull current branch (create upstream if missing).
  - [x] Push + `git fetch --prune`.
  - [x] Flags: `--message`, `--rebase`, `--dry-run`, `--no-push`, `--no-sync`.
  - [x] Intent tests (dry-run/mocked services).
- [x] `commands/git/feature.ts`:
  - [x] Ensure clean repo.
  - [x] Prompt for branch name (default from arg).
  - [x] Checkout `feature/<name>` from `origin/integration`.
  - [x] Push + set upstream.
  - [x] Fetch prune.
  - [x] Intent tests (dry-run).
- [x] Centralize git branch helpers:
  - [x] Add `src/git/branches/NormalizeBranchInput` for branch sanitization.
  - [x] Add `src/git/branches/EnsureBranchPrefix` for prefix enforcement.
  - [x] Export via `src/git/.exports.ts` so all git commands pull from one place.
- [x] `commands/git/hotfix.ts`:
  - [x] Guard repo + clean tree, mirroring `feature` behavior.
  - [x] Normalize names + prefix with `hotfix/`, default base `origin/main` with `--base` overrides.
  - [x] TaskPipeline stages for checkout, push/upstream (respecting `--no-push`), prune.
  - [x] Intent suite for repo validation, dirty tree handling, push flow, dry-run/custom base.
- [x] `commands/git/home.ts`:
  - [x] Resolve org/repo via args, config defaults, or `--use-local` remote parsing.
  - [x] Add `UrlOpener` service + GitHub remote helper for shared browser launches.
  - [x] Prompt for missing context and open arbitrary sections (`--section`).
  - [x] Intent suite covers config defaults, prompting, local inference, and failure states.
- [ ] CLI DFS integration:
  - [ ] Commands resolve execution DFS first.
  - [ ] Config lookups (org/repo, integration branch) go through `GitConfigStore`.

**Implementation pattern (example for `git` command):**

```typescript
import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import { GitService, TaskPipeline } from '../../src/services/.exports.ts';

const Args = z.tuple([]);
const Flags = z.object({
  message: z.string().optional(),
  rebase: z.boolean().optional(),
  'dry-run': z.boolean().optional(),
});

class GitParams extends CommandParams<z.infer<typeof Args>, z.infer<typeof Flags>> {
  get Message() {
    return this.Flag('message');
  }
  get Rebase() {
    return this.Flag('rebase') ?? false;
  }
  override get DryRun() {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command('git', 'Commit and sync with integration')
  .Args(Args)
  .Flags(Flags)
  .Params(GitParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();
    return {
      DFS: dfs,
      Git: await ioc.Resolve(GitService),
      Pipeline: TaskPipeline,
    };
  })
  .Run(async ({ Log, Services, Params }) => {
    await Services.Pipeline.Run(
      { dfs: Services.DFS, params: Params },
      [
        { title: 'Verify git repository', run: async (_, task) => {/* ... */} },
        { title: 'Stage & commit changes', run: async () => {/* ... */} },
        {
          title: Params.Rebase ? 'Rebase integration' : 'Merge integration',
          run: async () => {/* ... */},
        },
        { title: 'Pull latest changes', run: async () => {/* ... */} },
        { title: 'Push to origin', run: async () => {/* ... */} },
        { title: 'Fetch prune', run: async () => {/* ... */} },
      ],
      Log,
    );
    return 0;
  });
```

Intent tests (per command) should use `CommandIntent`/`CommandIntents` to exercise dry-run paths, e.g., `tests/intents/git/git.command.intents.ts` with `.ExpectLogs('[dry-run] git add -A')`.

### Phase 2 - GitHub / Fathym Backend Integration

Deliverable: commands that require the backend APIs & OAuth.

- [ ] HTTP client wrapper mirroring `common/axios.ts` (ConfigDFS-based token + base URL).
- [ ] Port `git auth`:
  - [ ] Launch B2C OAuth (`https://www.fathym.com/.oauth/GitHubOAuth?...`).
  - [ ] Exchange code via existing flows, store token in ConfigDFS.
  - [ ] Flags: `--edit`, `--self` parity.
- [ ] Port lookup commands (`git repos`):
  - [ ] `GET github/organizations`.
  - [ ] `GET …/repositories`.
  - [ ] `GET …/branches`.
  - [ ] Render lookups/instructions at the end.
- [ ] Port `git configure -s`:
  - [ ] Ensure org/repo via prompts + backend list endpoints.
  - [ ] Prompt for license (MIT/Apache/GPL/custom).
  - [ ] POST `github/organizations/{org}/repositories/{repo}/configure`.
  - [ ] Record configured repo in `GitConfigStore`.
- [ ] Port `git clone`:
  - [ ] Gate on configured repo (or `--force`).
  - [ ] Clone from GitHub with optional branch/depth.
  - [ ] Optionally checkout `integration`.
- [ ] Port `git import` (mirror remote).
- [ ] Prompt helper parity (`ensurePromptValue` equivalent, with DFS/local defaults).

### Phase 3 – Polish & Parity

- [ ] Add post-command instruction renderer (success log + follow-up steps).
- [ ] Expand intent tests to cover backend-backed commands (mock responses/dry-run).
- [ ] Run workspace deploy scripts that call `fathym git` using the new CLI (manual verification).
- [ ] Update docs (legacy walkthroughs, README, docs/guides) to reference the new commands.
- [ ] Track open questions (spinner lib choice, auth variants, clone gating) and document decisions.

## Open Questions & Decisions Needed

1. **Spinner/Prompt Library** – prefer zero-dependency or `npm:enquirer`/`npm:ora`? (Default: custom lightweight helpers to avoid heavy npm deps.)
2. **GitHub Auth Strategy** – keep B2C OAuth flow + backend-stored token (matches legacy) or add PAT/env var fallback? (Default: match legacy.)
3. **Configure Gate** – should `git clone` hard-fail if repo isn’t marked configured, or allow `--force` to bypass? (Default: enforce gate, add `--force`.)
4. **Testing Strategy** – rely on dry-run logging for intent tests, plus a small suite of sandboxed git repos for integration tests? (Default: yes; create temp repos under `tests/.temp/`.)

## Tracking & Next Steps

- [x] Build TaskPipeline, Spinner, GitService, GitConfigStore, and prompt helpers.
- [x] Implement `commands/git/.group.ts` with service registration.
- [x] Port `git` (commit/sync) using TaskPipeline + GitService; add intent suite.
- [x] Port `git feature` + `git hotfix` following the same pattern.
- [ ] Add HTTP client + auth store; port `git configure` and `git auth`.
- [ ] Wire `git clone`/`git import` using new services (git home complete).
- [ ] Run deploy scripts (or intent tests) to validate real workflows.

Progress updates and future phases should be logged here so contributors have a single source of truth for the git migration effort.
