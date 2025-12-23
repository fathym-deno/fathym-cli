import { CommandIntentSuite } from "@fathym/cli";
import BuildCommand from "../../../../commands/cli/build.ts";

CommandIntentSuite(
  "Build Command Suite",
  BuildCommand.Build(),
  import.meta.resolve("../../../../.cli.ts"),
)
  .Intent("Build CLI from scaffolded config", (int) =>
    int
      .Args([])
      .Flags({
        config: "./tests/.temp/my-cli/.cli.ts",
      })
      .ExpectLogs(
        "📦 Embedded templates →",
        "📘 Embedded command entries →",
        "🧩 Scaffolder rendered build-static template to ./.build",
        "Build complete! Run `ftm compile` on .build/main.ts to finalize.",
      )
      .ExpectExit(0))
  .Run();
