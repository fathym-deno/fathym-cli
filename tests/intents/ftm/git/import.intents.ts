import { assertEquals } from "@std/assert";
import { CommandIntentSuite } from "@fathym/cli";
import GitImportCommand from "../../../../commands/git/import.ts";
import GitIntentTestCLI from "./.test.cli.ts";
import {
  createMockDFS,
  MockGitConfigStore,
  MockGitService,
  MockPromptService,
} from "./_mocks.ts";

const cmd = GitImportCommand.Build();

CommandIntentSuite("git import Command Suite", cmd, GitIntentTestCLI)
  .Intent("fails when repository is not configured", (int) =>
    int
      .Args(["fathym", "cli", "https://github.com/example/source.git"])
      .WithServices({
        DFS: createMockDFS("/workspace"),
        Git: new MockGitService(),
        Config: new MockGitConfigStore(),
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        "Repository fathym/cli has not been configured. Run `ftm git configure -s` first or pass --force to bypass.",
      )
      .ExpectExit(1))
  .Intent("mirrors remote into configured repository", (int) => {
    const git = new MockGitService();
    const config = new MockGitConfigStore(undefined, [
      { organization: "fathym", repository: "cli" },
    ]);

    return int
      .Args(["fathym", "cli", "https://github.com/example/source.git"])
      .WithServices({
        DFS: createMockDFS("/workspace"),
        Git: git,
        Config: config,
        Prompt: new MockPromptService(),
      })
      .ExpectLogs(
        "Imported https://github.com/example/source.git → fathym/cli",
      )
      .After(() => {
        assertEquals(git.Commands[0]?.args, [
          "clone",
          "--bare",
          "https://github.com/example/source.git",
          "/workspace/cli",
        ]);
        assertEquals(git.Commands[1]?.args, [
          "push",
          "--mirror",
          "https://github.com/fathym/cli.git",
        ]);
        assertEquals(git.Commands[1]?.options.cwd, "/workspace/cli");
      })
      .ExpectExit(0);
  })
  .Intent("prompts for inputs and supports dry-run depth/branch", (int) => {
    const git = new MockGitService();

    return int
      .Flags({
        depth: 1,
        branch: "integration",
        dir: "import-tmp",
        "dry-run": true,
      })
      .WithServices({
        DFS: createMockDFS("/tmp"),
        Git: git,
        Config: new MockGitConfigStore(undefined, [
          { organization: "openindustrial", repository: "platform" },
        ]),
        Prompt: new MockPromptService({
          inputs: [
            "openindustrial",
            "platform",
            "https://github.com/example/platform.git",
          ],
        }),
      })
      .ExpectLogs(
        "[dry-run] git clone --bare --depth 1 --branch integration https://github.com/example/platform.git /tmp/import-tmp",
        "[dry-run] git push --mirror https://github.com/openindustrial/platform.git",
      )
      .After(() => {
        assertEquals(git.Commands.at(-1)?.args, [
          "push",
          "--mirror",
          "https://github.com/openindustrial/platform.git",
        ]);
      })
      .ExpectExit(0);
  })
  .Intent(
    "allows --force to bypass configure gate and dry-run mirror",
    (int) => {
      const git = new MockGitService();

      return int
        .Args([
          "openindustrial",
          "platform",
          "https://github.com/example/platform.git",
        ])
        .Flags({ "dry-run": true, force: true })
        .WithServices({
          DFS: createMockDFS("/tmp"),
          Git: git,
          Config: new MockGitConfigStore(),
          Prompt: new MockPromptService(),
        })
        .ExpectLogs(
          "Proceeding without configure (--force)",
          "[dry-run] git clone --bare https://github.com/example/platform.git /tmp/platform",
          "[dry-run] git push --mirror https://github.com/openindustrial/platform.git",
        )
        .ExpectExit(0);
    },
  )
  .Run();
