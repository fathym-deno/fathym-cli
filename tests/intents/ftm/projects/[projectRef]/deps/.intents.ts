import { GroupIntents } from "@fathym/cli";
import DepsGroupMetadata from "../../../../../../commands/projects/[projectRef]/deps/.group.ts";

const group = DepsGroupMetadata.Build();
const origin = import.meta.resolve("../../../../../../.cli.ts");

GroupIntents("projects:[projectRef]:deps Group Suite", group, origin)
  .Intent("Group metadata loaded correctly", (int) =>
    int
      .ExpectDescription("Dependency management commands for a project"))
  .Run();
