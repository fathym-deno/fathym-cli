/**
 * Install command group metadata.
 *
 * This group contains the main install command and additional
 * installation-related utilities like script generation.
 *
 * @module
 */

import { Group } from "@fathym/cli";

export default Group("install")
  .Description("Installation commands and utilities");
