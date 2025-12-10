/**
 * CLI command group metadata.
 *
 * This group contains commands for building, compiling, and managing
 * CLI projects built with the Fathym CLI framework.
 *
 * @module
 */

import { Group } from '@fathym/cli';

export default Group('cli')
  .Description('Commands for building, compiling, and managing CLI projects');
