/**
 * Projects cascade subgroup metadata.
 *
 * This subgroup contains commands for cascade release automation,
 * including schedule generation for dependency-aware release ordering.
 *
 * ## Overview
 *
 * The cascade commands enable automated multi-package release workflows:
 *
 * 1. **schedule** - Discover dependency graph and generate release schedule
 *    - Uses BFS to discover all packages that depend on the root
 *    - Topologically sorts into parallel layers
 *    - Outputs schedule for execution
 *
 * ## Usage Examples
 *
 * ```bash
 * # Generate cascade schedule for a package
 * ftm projects @fathym/dfs cascade schedule
 *
 * # Output as JSON for programmatic consumption
 * ftm projects @fathym/dfs cascade schedule --json
 *
 * # Limit discovery depth
 * ftm projects @fathym/dfs cascade schedule --max-depth=3
 * ```
 *
 * @module
 */

import { Group } from '@fathym/cli';

export default Group('cascade')
  .Description('Commands for cascade release automation');
