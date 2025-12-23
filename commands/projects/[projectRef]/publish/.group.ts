/**
 * Projects publish subgroup metadata.
 *
 * This subgroup contains commands for publishing-related operations
 * like validation and dry-run publishing.
 *
 * @module
 */

import { Group } from "@fathym/cli";

export default Group("publish")
  .Description("Commands for publishing project packages");
