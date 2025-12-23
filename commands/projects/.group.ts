/**
 * Projects command group metadata.
 *
 * This group contains commands for managing and working with
 * workspace projects (deno.json/deno.jsonc packages).
 *
 * @module
 */

import { Group } from "@fathym/cli";

export default Group("projects")
  .Description("Commands for managing workspace projects");
