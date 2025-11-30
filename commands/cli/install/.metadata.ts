/**
 * Install command group metadata.
 *
 * This group contains the main install command and additional
 * installation-related utilities like script generation.
 *
 * @module
 */

import type { CommandModuleMetadata } from '@fathym/cli';

export default {
  Name: 'install',
  Description: 'Installation commands and utilities',
} as CommandModuleMetadata;
