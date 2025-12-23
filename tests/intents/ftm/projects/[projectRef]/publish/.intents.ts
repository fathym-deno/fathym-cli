import { GroupIntents } from "@fathym/cli";
import PublishGroupMetadata from "../../../../../../commands/projects/[projectRef]/publish/.group.ts";

const group = PublishGroupMetadata.Build();
const origin = import.meta.resolve("../../../../../../.cli.ts");

GroupIntents("projects:[projectRef]:publish Group Suite", group, origin)
  .Intent("Group metadata loaded correctly", (int) =>
    int
      .ExpectDescription("Publishing commands for a project"))
  .Run();
