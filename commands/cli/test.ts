/**
 * Test command - runs CLI intent tests using Deno's test runner.
 *
 * The test command executes intent-based tests for CLI commands. It wraps
 * `deno test` with support for common testing flags like coverage, filtering,
 * and watch mode. Tests use the CommandIntent/CommandIntents API to validate
 * command behavior.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Register project DFS using config path or test file            │
 * │  2. Resolve test file path relative to DFS root                    │
 * │  3. Map Zod flags to Deno test CLI format                          │
 * │  4. Execute `deno test -A [flags] [test-path]`                     │
 * │  5. Report success or forward test failures                        │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Flag Mapping
 *
 * Flags are automatically mapped to `deno test` format:
 * - Boolean `true` → `--flagname` (e.g., `--watch`)
 * - Boolean `false` → omitted
 * - String value → `--flagname=value` (e.g., `--filter=hello`)
 *
 * ## Intent Testing Pattern
 *
 * Tests use the CommandIntent API to simulate CLI invocations:
 *
 * ```typescript
 * CommandIntents('my-cli hello', ({ Intent }) => {
 *   Intent('greets with default name')
 *     .Args([])
 *     .ExpectLogs(['Hello, World!'])
 *     .ExpectExit(0);
 * });
 * ```
 *
 * @example Run all tests with defaults
 * ```bash
 * ftm test
 * ```
 *
 * @example Run specific test file
 * ```bash
 * ftm test ./intents/hello.intents.ts
 * ```
 *
 * @example Filter tests by name
 * ```bash
 * ftm test --filter=hello
 * ```
 *
 * @example Run with coverage output
 * ```bash
 * ftm test --coverage=./coverage
 * ```
 *
 * @example Watch mode for development
 * ```bash
 * ftm test --watch
 * ```
 *
 * @example Skip type checking for faster runs
 * ```bash
 * ftm test --no-check
 * ```
 *
 * @module
 */

import { z } from "zod";
import { DFSFileHandler } from "@fathym/dfs";
import {
  CLIDFSContextManager,
  Command,
  CommandContext,
  CommandParams,
  type CommandStatus,
  runCommandWithLogs,
} from "@fathym/cli";

/**
 * Result data for the test command.
 */
export interface TestResult {
  /** The test file that was run */
  testFile: string;
  /** Flags passed to deno test */
  denoFlags: string[];
}

/**
 * Zod schema for test command positional arguments.
 *
 * @property [0] - Optional test file path. Defaults to './intents/.intents.ts'
 */
export const TestArgsSchema = z.tuple([
  z
    .string()
    .meta({ argName: "testFile" })
    .optional()
    .describe("Test file to run (default: test/my-cli/intents/.intents.ts)"),
]);

/**
 * Zod schema for test command flags.
 *
 * Maps common `deno test` flags for convenient access. All flags
 * except `config` are forwarded to the test runner.
 *
 * @property coverage - Directory for coverage output
 * @property filter - Run only tests matching this name
 * @property no-check - Skip TypeScript type checking
 * @property watch - Re-run tests on file changes
 * @property doc - Run JSDoc example tests
 * @property shuffle - Randomize test order
 * @property config - Path to .cli.ts (not forwarded)
 */
export const TestFlagsSchema = z
  .object({
    coverage: z.string().optional().describe("Directory for coverage output"),
    filter: z.string().optional().describe("Run only tests with this name"),
    "no-check": z.boolean().optional().describe("Skip type checking"),
    watch: z
      .boolean()
      .optional()
      .describe("Watch for file changes and rerun tests"),
    doc: z.boolean().optional().describe("Type-check and run jsdoc tests"),
    shuffle: z.boolean().optional().describe("Run tests in random order"),
    config: z
      .string()
      .optional()
      .describe("Path to .cli.ts (default: ./.cli.ts)"),
  })
  .passthrough();

/**
 * Typed parameter accessor for the test command.
 *
 * Provides getters for test file path and a method to convert
 * Zod flags into Deno test CLI format.
 */
export class TestParams extends CommandParams<
  z.infer<typeof TestArgsSchema>,
  z.infer<typeof TestFlagsSchema>
> {
  /**
   * Test file to execute.
   * Defaults to './intents/.intents.ts' if not specified.
   */
  get TestFile(): string {
    return this.Arg(0) ?? "./intents/.intents.ts";
  }

  /**
   * Converts flags to Deno test CLI format.
   *
   * Mapping rules:
   * - Boolean `true` → `--flagname`
   * - Boolean `false` → omitted
   * - String/number → `--flagname=value`
   * - `config` flag → excluded (used by ftm, not deno test)
   */
  get DenoFlags(): string[] {
    const mapFlag = (key: string, val: unknown): string | undefined => {
      if (key === "baseTemplatesDir") return undefined;
      if (val === true) return `--${key}`;
      if (val === false) return undefined;
      return `--${key}=${val}`;
    };

    return Object.entries(this.Flags)
      .filter(([k]) => k !== "config")
      .map(([k, v]) => mapFlag(k, v))
      .filter(Boolean) as string[];
  }

  /**
   * Override path to .cli.ts configuration.
   * Used to locate the project root for test execution.
   */
  get ConfigPath(): string | undefined {
    return this.Flag("config");
  }
}

/**
 * Test command - runs CLI intent tests via Deno.
 *
 * Wraps `deno test` with flag mapping and project DFS resolution.
 * Tests run with full permissions (-A flag).
 */
export default Command("test", "Run CLI tests using Deno")
  .Args(TestArgsSchema)
  .Flags(TestFlagsSchema)
  .Params(TestParams)
  .Services(async (ctx, ioc): Promise<{ CLIDFS: DFSFileHandler }> => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    await dfsCtx.RegisterProjectDFS(
      ctx.Params.ConfigPath || ctx.Params.TestFile,
      "CLI",
    );

    const cliDFS = await dfsCtx.GetDFS("CLI");

    return {
      CLIDFS: cliDFS,
    };
  })
  .Run(
    async ({
      Params,
      Log,
      Services,
    }: CommandContext<TestParams, { CLIDFS: DFSFileHandler }>): Promise<
      CommandStatus<TestResult>
    > => {
      const rootPath = Services.CLIDFS.Root.replace(
        /[-/\\^$*+?.()|[\]{}]/g,
        "\\$&",
      );

      const testFileRel = Params.TestFile.replace(
        new RegExp(`^${rootPath}[\\/]*`),
        "",
      );

      const testPath = await Services.CLIDFS.ResolvePath(testFileRel);
      const denoFlags = Params.DenoFlags;

      Log.Info(`🧪 Running tests from: ${testFileRel}`);
      Log.Info(`➡️  deno test -A ${denoFlags.join(" ")} ${testPath}`);

      await runCommandWithLogs(["test", "-A", ...denoFlags, testPath], Log, {
        exitOnFail: true,
        cwd: Services.CLIDFS.Root,
      });

      Log.Success("✅ Tests passed successfully");

      return {
        Code: 0,
        Message: "Tests passed successfully",
        Data: { testFile: testFileRel, denoFlags },
      };
    },
  );
