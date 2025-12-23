/**
 * Project reference command group metadata.
 *
 * This group contains commands that operate on a specific project or set of projects.
 * The `projectRef` segment accepts:
 * - Package names: `@fathym/cli`
 * - Paths to deno.json(c): `./projects/app/deno.jsonc`
 * - Directory paths: `./projects/app`
 * - Comma-separated refs: `@pkg/a,@pkg/b` (for multi-project operations)
 *
 * ## Usage Examples
 *
 * ```bash
 * # Single project operations
 * ftm projects @fathym/cli ref
 * ftm projects @fathym/cli fmt
 *
 * # Multi-project operations (requires --all or --first flag)
 * ftm projects @pkg/a,@pkg/b build --all
 * ftm projects ./packages/ fmt --first
 * ```
 *
 * @module
 */

import { Group } from '@fathym/cli';

export default Group('Project Commands')
  .Description(
    'Commands that operate on a specific project or set of projects.',
  );
