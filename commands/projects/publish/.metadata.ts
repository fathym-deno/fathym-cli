/**
 * Projects publish subgroup metadata.
 *
 * This subgroup contains commands for publishing-related operations
 * like validation and dry-run publishing.
 *
 * @module
 */

import type { CommandModuleMetadata } from '@fathym/cli';

export default {
  Name: 'publish',
  Description: 'Commands for publishing project packages',
} as CommandModuleMetadata;
