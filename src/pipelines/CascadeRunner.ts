/**
 * CascadeRunner - Resolution and execution engine for cascading override pipelines.
 *
 * This class handles the core cascade logic:
 * 1. Resolving which steps use project overrides vs CLI defaults
 * 2. Executing the pipeline with proper logging
 * 3. Supporting --verbose, --dry-run, --explain, and --ignore-faults flags
 *
 * @example Basic usage in a pipeline command
 * ```typescript
 * const runner = new CascadeRunner(project, Log, Commands.Task, {
 *   verbose: Params.Verbose,
 *   ignoreFaults: Params.IgnoreFaults,
 *   dryRun: Params.DryRun,
 *   explain: Params.Explain,
 * });
 *
 * const resolution = runner.resolve('build', 'build', BUILD_STEPS);
 * return await runner.run(resolution, StepCommands, Params.ProjectRef);
 * ```
 *
 * @module
 */

import type { ProjectRef } from '../projects/ProjectRef.ts';
import type {
  CascadeOptions,
  CascadeResolution,
  CascadeStepDef,
  CommandInvoker,
  ResolvedStep,
} from './CascadeTypes.ts';

/**
 * Logger interface matching the CommandLog from @fathym/cli.
 */
export interface CascadeLog {
  Info: (...args: unknown[]) => void;
  Warn: (...args: unknown[]) => void;
  Error: (...args: unknown[]) => void;
}

/**
 * CascadeRunner handles resolution and execution of cascading override pipelines.
 *
 * It checks for project-level task overrides at both the full pipeline level
 * (e.g., a `build` task that takes over entirely) and at individual step levels
 * (e.g., `build:fmt`, `build:lint`), falling back to CLI defaults when no
 * override is defined.
 */
export class CascadeRunner {
  /**
   * Create a new CascadeRunner.
   *
   * @param project - The resolved project reference
   * @param log - Logger for output
   * @param taskInvoker - The Task command invoker for delegating to project tasks
   * @param options - Cascade execution options
   */
  constructor(
    private project: ProjectRef,
    private log: CascadeLog,
    private taskInvoker: CommandInvoker,
    private options: CascadeOptions,
  ) {}

  /**
   * Resolve which steps use overrides vs defaults.
   *
   * Checks for a full override first (e.g., project has a `build` task),
   * then resolves each step to determine if it has an override.
   *
   * @param pipelineName - Name of the pipeline (e.g., 'build')
   * @param fullOverrideTask - Task name for full override (e.g., 'build')
   * @param steps - Step definitions for the pipeline
   * @returns Resolution result with override status for each step
   */
  resolve(
    pipelineName: string,
    fullOverrideTask: string,
    steps: CascadeStepDef[],
  ): CascadeResolution {
    const tasks = this.project.tasks ?? {};

    // Check for full override first
    if (fullOverrideTask in tasks) {
      return {
        pipelineName,
        fullOverrideTask,
        hasFullOverride: true,
        steps: [],
        project: this.project,
      };
    }

    // Resolve each step
    const resolvedSteps: ResolvedStep[] = steps.map((step) => ({
      ...step,
      hasOverride: step.overrideTask in tasks,
      source: (step.overrideTask in tasks ? 'override' : 'default') as 'override' | 'default',
    }));

    return {
      pipelineName,
      fullOverrideTask,
      hasFullOverride: false,
      steps: resolvedSteps,
      project: this.project,
    };
  }

  /**
   * Execute the cascade pipeline.
   *
   * Handles all execution modes:
   * - --explain: Show pipeline structure without executing
   * - --dry-run: Show what would run without executing
   * - Full override: Delegate entirely to project task
   * - Step execution: Run each step with override/default resolution
   *
   * @param resolution - The cascade resolution from resolve()
   * @param stepCommands - Map of step command keys to invokers
   * @param projectRef - Project reference string for task invocation
   * @returns Exit code (0 for success)
   */
  async run(
    resolution: CascadeResolution,
    stepCommands: Record<string, CommandInvoker>,
    projectRef: string,
  ): Promise<number> {
    // Handle --explain
    if (this.options.explain) {
      this.printExplain(resolution);
      return 0;
    }

    const projectName = resolution.project.name ?? resolution.project.dir;

    // Handle full override
    if (resolution.hasFullOverride) {
      if (this.options.verbose) {
        this.log.Info(`\n=== ${resolution.pipelineName} for ${projectName} ===`);
        this.log.Info(`Full override: delegating to '${resolution.fullOverrideTask}' task\n`);
      }

      if (this.options.dryRun) {
        this.log.Info(`[DRY RUN] Would run: deno task ${resolution.fullOverrideTask}`);
        return 0;
      }

      const code = await this.taskInvoker([projectRef, resolution.fullOverrideTask], {});
      return typeof code === 'number' ? code : 0;
    }

    // Run step pipeline
    if (this.options.verbose) {
      this.log.Info(`\n=== ${resolution.pipelineName} for ${projectName} ===`);
      this.log.Info(`Running ${resolution.steps.length}-step pipeline:\n`);

      for (const step of resolution.steps) {
        const indicator = step.hasOverride ? '(override)' : '(default)';
        this.log.Info(`  ${step.name}: ${step.overrideTask} ${indicator}`);
      }

      this.log.Info('');
    }

    for (let i = 0; i < resolution.steps.length; i++) {
      const step = resolution.steps[i];
      const code = await this.runStep(
        step,
        stepCommands,
        projectRef,
        i + 1,
        resolution.steps.length,
      );

      if (code !== 0 && !this.options.ignoreFaults) {
        return code;
      }
    }

    if (this.options.verbose) {
      this.log.Info(`\n${resolution.pipelineName} complete.`);
    }

    return 0;
  }

  /**
   * Run a single step in the pipeline.
   */
  private async runStep(
    step: ResolvedStep,
    stepCommands: Record<string, CommandInvoker>,
    projectRef: string,
    index: number,
    total: number,
  ): Promise<number> {
    if (this.options.verbose) {
      const source = step.hasOverride ? 'override' : 'default';
      this.log.Info(`[${index}/${total}] ${step.description} (${source})`);
    }

    if (this.options.dryRun) {
      const action = step.hasOverride
        ? `deno task ${step.overrideTask}`
        : `CLI default (${step.commandKey})`;
      this.log.Info(`  [DRY RUN] ${step.name}: ${action}`);
      return 0;
    }

    try {
      if (step.hasOverride) {
        // Delegate to project task via TaskCommand
        const code = await this.taskInvoker([projectRef, step.overrideTask], {});
        return typeof code === 'number' ? code : 0;
      } else {
        // Use the step's default command
        const stepCommand = stepCommands[step.commandKey];

        if (!stepCommand) {
          this.log.Warn(`  [${step.name}] No default command found for '${step.commandKey}'`);
          return this.options.ignoreFaults ? 0 : 1;
        }

        const code = await stepCommand([projectRef], { verbose: this.options.verbose });
        return typeof code === 'number' ? code : 0;
      }
    } catch (error) {
      if (this.options.ignoreFaults) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.Warn(`  [${step.name}] Failed: ${message}`);
        this.log.Warn(`  Continuing due to --ignore-faults`);
        return 0;
      }
      throw error;
    }
  }

  /**
   * Print pipeline explanation for --explain flag.
   */
  private printExplain(resolution: CascadeResolution): void {
    const projectName = resolution.project.name ?? resolution.project.dir;

    this.log.Info(`\n=== ${resolution.pipelineName} Pipeline ===\n`);
    this.log.Info(`Project: ${projectName}`);
    this.log.Info(`Config:  ${resolution.project.configPath}\n`);

    if (resolution.hasFullOverride) {
      this.log.Info(`Status: FULL OVERRIDE`);
      this.log.Info(`The project defines a '${resolution.fullOverrideTask}' task.`);
      this.log.Info(`This task will run exclusively, bypassing the step pipeline.\n`);
      return;
    }

    this.log.Info(`Full override task '${resolution.fullOverrideTask}': not defined\n`);
    this.log.Info(`Steps:`);
    this.log.Info(`  ${'Step'.padEnd(12)} ${'Override Task'.padEnd(20)} ${'Status'.padEnd(10)}`);
    this.log.Info(`  ${'─'.repeat(12)} ${'─'.repeat(20)} ${'─'.repeat(10)}`);

    for (const step of resolution.steps) {
      const status = step.hasOverride ? 'OVERRIDE' : 'default';
      this.log.Info(
        `  ${step.name.padEnd(12)} ${step.overrideTask.padEnd(20)} ${status.padEnd(10)}`,
      );
    }

    this.log.Info(`\nOverride priority:`);
    this.log.Info(`  1. Full override: '${resolution.fullOverrideTask}' task runs exclusively`);
    this.log.Info(`  2. Step overrides: Each step task replaces that step's default`);
    this.log.Info(`  3. CLI defaults: Used when no override is defined\n`);
  }
}
