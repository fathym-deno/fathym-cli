/**
 * Projects deps subgroup metadata.
 *
 * This subgroup contains commands for managing project dependencies,
 * including upgrading versions across deno.jsonc and .deps.ts files.
 *
 * @module
 */

import type { CommandModuleMetadata } from '@fathym/cli';

export default {
  Name: 'deps',
  Description: 'Commands for managing project dependencies',
} as CommandModuleMetadata;
