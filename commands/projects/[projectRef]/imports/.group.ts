/**
 * Projects imports subgroup metadata.
 *
 * This subgroup contains commands for managing import mappings
 * in deno.jsonc configuration files.
 *
 * @module
 */

import { Group } from "@fathym/cli";

export default Group("imports")
  .Description("Commands for managing project imports");
