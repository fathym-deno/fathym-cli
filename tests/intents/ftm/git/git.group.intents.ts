import { GroupIntentSuite } from "@fathym/cli";
import gitGroup from "../../../../commands/git/.group.ts";

const testCLI = import.meta.resolve("./.test.cli.ts");

GroupIntentSuite("git group lifecycle suite", gitGroup, testCLI)
  .Intent("initializes git services", (int) =>
    int
      .ExpectOnInitCalled()
      .ExpectExit(0))
  .Run();
