/**
 * Types for the cascade schedule automation system.
 *
 * This module defines the type contracts for cascade schedule discovery,
 * topological sorting, and layer-based parallel execution. The cascade
 * schedule represents a release plan that respects package dependencies.
 *
 * ## Key Concepts
 *
 * - **CascadeLayerPackage**: A package in the schedule with its metadata and dependencies
 * - **CascadeLayer**: A group of packages that can be released in parallel
 * - **CascadeSchedule**: The complete release plan with ordered layers
 *
 * ## How Layers Work
 *
 * Packages are grouped into layers based on their dependency depth from the root:
 * - Layer 0: The root package (what started the cascade)
 * - Layer 1: Packages that directly depend on the root
 * - Layer 2: Packages that depend on layer 1 packages
 * - And so on...
 *
 * Within each layer, packages have no interdependencies and can be released
 * in parallel. Layers must be processed in order (0, 1, 2, ...).
 *
 * @example Basic schedule structure
 * ```typescript
 * const schedule: CascadeSchedule = {
 *   root: '@fathym/dfs',
 *   channel: 'dfs-release',
 *   layers: [
 *     { index: 0, packages: [{ name: '@fathym/dfs', ... }] },
 *     { index: 1, packages: [{ name: '@fathym/eac', ... }, { name: '@fathym/ioc', ... }] },
 *   ],
 *   totalPackages: 3,
 *   skipped: [],
 * };
 * ```
 *
 * @module
 */

/**
 * A package in the cascade schedule with its metadata.
 *
 * Represents a single package that will be released as part of the cascade.
 * Includes all information needed to execute the release for this package.
 */
export interface CascadeLayerPackage {
  /**
   * Package name from deno.json(c).
   *
   * This is the fully qualified package name (e.g., "@fathym/eac").
   * Used for identification and for the upgrade command.
   */
  name: string;

  /**
   * Project directory path relative to workspace root.
   *
   * Used for running git commands and build tasks.
   */
  dir: string;

  /**
   * Full path to the project's deno.json(c) config file.
   *
   * Used for project resolution and version updates.
   */
  configPath: string;

  /**
   * Current git branch for this project.
   *
   * Used to validate we're on a feature branch before commits.
   */
  branch: string;

  /**
   * Current JSR version for the release channel.
   *
   * This is the version BEFORE the cascade release.
   * After CI, this will be replaced with the new version.
   */
  currentVersion?: string;

  /**
   * Package names this package depends on (within the cascade scope).
   *
   * Only includes dependencies that are part of this cascade, not
   * all package dependencies. Used to determine layer placement.
   *
   * @example For a package that depends on root
   * ```typescript
   * dependsOn: ['@fathym/dfs']
   * ```
   */
  dependsOn: string[];

  /**
   * Whether this project has a build task defined.
   *
   * If false, the cascade may skip the build step for this package.
   */
  hasBuild: boolean;
}

/**
 * A layer of packages that can be released in parallel.
 *
 * All packages in a layer have their dependencies satisfied by
 * packages in previous layers. This means they can be built,
 * committed, pushed, and polled for CI concurrently.
 */
export interface CascadeLayer {
  /**
   * Layer index (0 = root package, higher = more dependent).
   *
   * Layers are processed in order: 0 first, then 1, then 2, etc.
   * A package in layer N depends only on packages in layers 0 to N-1.
   */
  index: number;

  /**
   * Packages in this layer.
   *
   * These packages have no interdependencies and can be processed
   * in parallel. The order within a layer is not significant.
   */
  packages: CascadeLayerPackage[];
}

/**
 * The complete cascade schedule from a starting package.
 *
 * This is the output of the schedule command and the input to the
 * run command. It contains everything needed to execute the full
 * cascade release in the correct order.
 */
export interface CascadeSchedule {
  /**
   * The root package that started the cascade.
   *
   * This is the package the user specified when running the cascade.
   * It will always be in layer 0.
   */
  root: string;

  /**
   * Release channel derived from the root package's branch.
   *
   * For a branch like "feature/dfs-release", the channel is "dfs-release".
   * This channel is used to identify which JSR versions to track.
   */
  channel: string;

  /**
   * Ordered layers (execute layer 0 first, then 1, etc.).
   *
   * Each layer contains packages that can be released in parallel.
   * All packages in layer N must complete before starting layer N+1.
   */
  layers: CascadeLayer[];

  /**
   * Total package count across all layers.
   *
   * Convenience field for progress reporting.
   */
  totalPackages: number;

  /**
   * Packages that were discovered but skipped.
   *
   * A package might be skipped if:
   * - It's already on the target version
   * - It doesn't have a build task
   * - It was filtered out by user options
   *
   * Skipped packages are still tracked for transparency.
   */
  skipped: string[];

  /**
   * Timestamp when the schedule was generated.
   *
   * ISO 8601 format. Used for logging and debugging.
   */
  generatedAt: string;

  /**
   * Maximum depth that was used during discovery.
   *
   * If undefined, no depth limit was applied.
   */
  maxDepth?: number;
}

/**
 * Options for building a cascade schedule.
 */
export interface CascadeScheduleOptions {
  /**
   * Maximum depth for dependency discovery.
   *
   * If set, stops discovering dependencies beyond this many layers.
   * Useful for limiting scope of large cascades.
   *
   * @example Limit to direct dependents only
   * ```typescript
   * { maxDepth: 1 }  // Only root (layer 0) and direct dependents (layer 1)
   * ```
   */
  maxDepth?: number;

  /**
   * Filter to specific source types for dependency detection.
   *
   * By default, only 'config' and 'deps' sources are considered.
   * References in templates and docs don't usually indicate
   * a build dependency.
   */
  sourceFilter?: ('config' | 'deps' | 'template' | 'docs' | 'other')[];

  /**
   * Whether to include packages without a build task.
   *
   * If false, packages without a build task are added to `skipped`
   * instead of being included in layers.
   *
   * @default true
   */
  includeWithoutBuild?: boolean;
}

/**
 * Internal node representation for graph discovery.
 *
 * Used during BFS traversal to build the dependency graph
 * before topological sorting.
 */
export interface CascadeGraphNode {
  /**
   * Package name.
   */
  name: string;

  /**
   * Full package metadata.
   */
  package: CascadeLayerPackage;

  /**
   * Packages this depends on (edges in the dependency graph).
   *
   * These are the packages that must be released before this one.
   */
  dependsOn: Set<string>;

  /**
   * Packages that depend on this (reverse edges).
   *
   * These are the packages that will need to be released after this one.
   */
  dependents: Set<string>;

  /**
   * Discovery depth from root.
   *
   * Root = 0, direct dependents = 1, etc.
   */
  depth: number;
}

/**
 * Result of cycle detection in the dependency graph.
 */
export interface CycleDetectionResult {
  /**
   * Whether a cycle was detected.
   */
  hasCycle: boolean;

  /**
   * The cycle path if detected.
   *
   * For example: ['@fathym/a', '@fathym/b', '@fathym/a']
   */
  cyclePath?: string[];
}
