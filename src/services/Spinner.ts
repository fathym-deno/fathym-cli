export interface SpinnerLogger {
  Info: (...args: unknown[]) => void;
  Warn?: (...args: unknown[]) => void;
  Error: (...args: unknown[]) => void;
}

const SYMBOLS = {
  start: "⏳",
  success: "✅",
  fail: "❌",
  skip: "⚪",
} as const;

/**
 * Lightweight spinner handle that prints start/success/failure markers.
 *
 * Instead of animating a terminal spinner (which is brittle across shells),
 * we log emoji-prefixed lines so transcript logs still capture progress.
 */
export class SpinnerHandle {
  protected currentTitle: string;

  public constructor(protected logger: SpinnerLogger, title: string) {
    this.currentTitle = title;
    this.logger.Info(`${SYMBOLS.start} ${title}`);
  }

  /**
   * Update the spinner title mid-task.
   */
  public Update(title: string): void {
    this.currentTitle = title;
    this.logger.Info(`${SYMBOLS.start} ${title}`);
  }

  /**
   * Mark the spinner as completed successfully.
   */
  public Succeed(message?: string): void {
    this.logger.Info(`${SYMBOLS.success} ${message ?? this.currentTitle}`);
  }

  /**
   * Mark the spinner as failed with an error message.
   */
  public Fail(message?: string): void {
    this.logger.Error(`${SYMBOLS.fail} ${message ?? this.currentTitle}`);
  }

  /**
   * Mark the spinner as skipped (used when a task decides not to run).
   */
  public Skip(message?: string): void {
    this.logger.Info(`${SYMBOLS.skip} ${message ?? this.currentTitle}`);
  }

  /**
   * Current title accessor (useful for emitting follow-up logs).
   */
  public get Title(): string {
    return this.currentTitle;
  }
}

export class Spinner {
  /**
   * Start a new spinner with the provided title.
   */
  public static Start(title: string, logger: SpinnerLogger): SpinnerHandle {
    return new SpinnerHandle(logger, title);
  }
}
