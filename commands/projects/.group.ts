/**
 * Projects command group metadata.
 *
 * This group contains commands for managing and working with
 * workspace projects (deno.json/deno.jsonc packages).
 *
 * @module
 */

import type { CommandModuleMetadata } from '@fathym/cli';

export default {
  Name: 'projects',
  Description: 'Commands for managing workspace projects',
} as CommandModuleMetadata;
