/**
 * Projects deps subgroup metadata.
 *
 * This subgroup contains commands for managing project dependencies,
 * including upgrading versions across deno.jsonc and .deps.ts files.
 *
 * @module
 */

import { Group } from '@fathym/cli';

export default Group('deps')
  .Description('Commands for managing project dependencies');
