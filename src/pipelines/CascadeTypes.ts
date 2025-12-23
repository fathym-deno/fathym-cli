/**
 * Types for the cascading override pipeline system.
 *
 * This module defines the type contracts for cascade resolution and execution,
 * enabling pipelines like `build` to check for project-level task overrides
 * before falling back to CLI defaults.
 *
 * @module
 */

import type { ProjectRef } from "../projects/ProjectRef.ts";

/**
 * Definition of a step in a pipeline.
 *
 * Each step has a name, an override task to check for, a description for
 * logging, and a key that maps to the command in the Commands map.
 */
export interface CascadeStepDef {
  /** Step identifier (e.g., 'fmt', 'lint', 'check') */
  name: string;

  /** Task name to check for override (e.g., 'build:fmt') */
  overrideTask: string;

  /** Human-readable description for verbose logging */
  description: string;

  /** Key in the Commands map that provides the default implementation */
  commandKey: string;
}

/**
 * A resolved step with its override status determined.
 *
 * Extends CascadeStepDef with resolution information indicating
 * whether the project has an override for this step.
 */
export interface ResolvedStep extends CascadeStepDef {
  /** Whether the project defines an override task for this step */
  hasOverride: boolean;

  /** Source of the step's implementation */
  source: "override" | "default";
}

/**
 * Full cascade resolution result for a pipeline.
 *
 * Contains the resolution of all steps in a pipeline, including
 * whether a full override exists that bypasses the step pipeline entirely.
 */
export interface CascadeResolution {
  /** Name of the pipeline (e.g., 'build', 'test') */
  pipelineName: string;

  /** Task name that represents a full override (e.g., 'build') */
  fullOverrideTask: string;

  /** Whether the project has a full override that bypasses all steps */
  hasFullOverride: boolean;

  /** Resolved steps (empty if hasFullOverride is true) */
  steps: ResolvedStep[];

  /** The project being built */
  project: ProjectRef;
}

/**
 * Options for cascade execution.
 *
 * These flags control how the cascade runner behaves during
 * resolution and execution.
 */
export interface CascadeOptions {
  /** Show detailed resolution and execution logs */
  verbose: boolean;

  /** Continue on step failure, attempting fallback to defaults */
  ignoreFaults: boolean;

  /** Preview what would run without executing */
  dryRun: boolean;

  /** Show pipeline structure and override status without executing */
  explain: boolean;
}

/**
 * Invoker function type for executing commands.
 *
 * This matches the CommandInvoker type from @fathym/cli but is
 * defined here to avoid import issues.
 */
export type CommandInvoker = (
  args?: unknown[],
  flags?: Record<string, unknown>,
) => Promise<void | number>;
