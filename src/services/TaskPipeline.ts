import { Spinner, SpinnerHandle, SpinnerLogger } from "./Spinner.ts";

export type PipelineLogger = SpinnerLogger;

export type SkipResult =
  | boolean
  | string
  | { skip: boolean; reason?: string }
  | Promise<boolean | string | { skip: boolean; reason?: string }>;

export interface TaskDefinition<TContext> {
  /** Initial title shown when the task starts. */
  title: string;
  /** Whether the task should run at all. */
  enabled?: (ctx: TContext) => boolean | Promise<boolean>;
  /** Whether the task should be skipped (and optional reason). */
  skip?: (ctx: TContext) => SkipResult;
  /** Task body. */
  run: (ctx: TContext, runtime: TaskRuntime<TContext>) => Promise<void> | void;
}

export interface TaskRuntime<TContext> {
  /** Update the spinner title mid-task. */
  UpdateTitle: (title: string) => void;
  /** Run child tasks using the same logger and context. */
  RunSubtasks: (tasks: TaskDefinition<TContext>[]) => Promise<void>;
  /** Spinner handle for the current task. */
  Spinner: SpinnerHandle;
  /** Logger for convenience inside tasks. */
  Log: PipelineLogger;
  /** Access to the shared context. */
  Context: TContext;
}

export class TaskPipeline {
  /**
   * Execute an ordered list of task definitions with shared logging and context.
   */
  public static async Run<TContext>(
    ctx: TContext,
    tasks: TaskDefinition<TContext>[],
    logger: PipelineLogger,
  ): Promise<void> {
    for (const task of tasks) {
      const enabled = (await task.enabled?.(ctx)) ?? true;
      if (!enabled) {
        continue;
      }

      const skip = await task.skip?.(ctx);
      const skipState = TaskPipeline.parseSkipResult(skip);
      if (skipState.skip) {
        logger.Info(
          `⚪ ${task.title}${skipState.reason ? ` (${skipState.reason})` : ""}`,
        );
        continue;
      }

      const spinner = Spinner.Start(task.title, logger);
      const runtime: TaskRuntime<TContext> = {
        UpdateTitle: (title: string) => spinner.Update(title),
        RunSubtasks: (subtasks) => TaskPipeline.Run(ctx, subtasks, logger),
        Spinner: spinner,
        Log: logger,
        Context: ctx,
      };

      try {
        await task.run(ctx, runtime);
        spinner.Succeed();
      } catch (error) {
        spinner.Fail(error instanceof Error ? error.message : String(error));
        throw error;
      }
    }
  }

  protected static parseSkipResult(
    value: Awaited<SkipResult> | undefined,
  ): { skip: boolean; reason?: string } {
    if (value === undefined) {
      return { skip: false };
    }

    if (typeof value === "boolean") {
      return { skip: value };
    }

    if (typeof value === "string") {
      return { skip: true, reason: value };
    }

    return value;
  }
}
