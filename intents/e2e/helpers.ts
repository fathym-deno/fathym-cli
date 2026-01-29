/**
 * E2E Test Helpers for @fathym/ftm Compiled Binary
 *
 * Utilities for executing and testing the compiled ftm binary.
 * These helpers detect the correct binary path for the current platform
 * and provide functions to execute commands and capture output.
 *
 * @module
 */

import { join } from 'jsr:@std/path@1.0.9';
import { existsSync } from 'jsr:@std/fs@1.0.17/exists';

/**
 * Get the compiled ftm binary path for the current platform.
 *
 * The `ftm:compile --all` task creates platform-specific subdirectories:
 * - Windows: `x86_64-pc-windows-msvc/ftm.exe`
 * - macOS Intel: `x86_64-apple-darwin/ftm`
 * - macOS ARM: `aarch64-apple-darwin/ftm`
 * - Linux Intel: `x86_64-unknown-linux-gnu/ftm`
 * - Linux ARM: `aarch64-unknown-linux-gnu/ftm`
 *
 * @returns Absolute path to the compiled binary
 */
export function getFtmBinaryPath(): string {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  // Map Deno os/arch to Rust target triples (used by deno compile)
  const targetTriple = os === 'windows'
    ? `${arch}-pc-windows-msvc`
    : os === 'darwin'
    ? `${arch}-apple-darwin`
    : `${arch}-unknown-linux-gnu`;

  const ext = os === 'windows' ? '.exe' : '';

  // Note: Binary is named 'ftm' not 'ftm-cli'
  return join(Deno.cwd(), `.dist/exe/${targetTriple}/ftm${ext}`);
}

/**
 * Check if the compiled ftm binary exists.
 *
 * This is used to conditionally skip tests when the binary hasn't been compiled yet.
 * Tests use `ignore: !(await binaryExists())` to gracefully skip in development.
 *
 * @returns Promise<boolean> True if binary exists, false otherwise
 */
export function binaryExists(): Promise<boolean> {
  try {
    return Promise.resolve(existsSync(getFtmBinaryPath()));
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Execute the compiled ftm binary and capture output.
 *
 * This spawns the binary as a subprocess with piped stdout/stderr,
 * captures all output, and returns the results.
 *
 * @param args - Command line arguments to pass to ftm
 * @returns Promise with output, exit code, stdout, and stderr
 *
 * @example
 * ```ts
 * const { output, code } = await runFtm(['--help']);
 * assert(code === 0);
 * assertMatch(output, /Fathym CLI/);
 * ```
 */
export async function runFtm(
  args: string[],
): Promise<{
  output: string;
  code: number;
  stdout: string;
  stderr: string;
}> {
  const command = new Deno.Command(getFtmBinaryPath(), {
    args,
    stdout: 'piped',
    stderr: 'piped',
  });

  const result = await command.output();
  const stdout = new TextDecoder().decode(result.stdout);
  const stderr = new TextDecoder().decode(result.stderr);

  return {
    output: stdout + stderr,
    code: result.code,
    stdout,
    stderr,
  };
}

/**
 * Execute the compiled ftm binary and parse JSON output.
 *
 * This is useful for commands that output JSON (e.g., `ftm projects <ref> ref --json`).
 * The function executes the command, captures stdout, and parses it as JSON.
 *
 * @param args - Command line arguments to pass to ftm
 * @returns Promise with parsed JSON data and exit code
 * @throws {SyntaxError} If stdout is not valid JSON
 *
 * @example
 * ```ts
 * const { data, code } = await runFtmJson(['projects', '@fathym/ftm', 'ref', '--json']);
 * assert(code === 0);
 * assert('package' in data || 'Package' in data);
 * ```
 */
export async function runFtmJson<T = unknown>(
  args: string[],
): Promise<{ data: T; code: number }> {
  const { stdout, code } = await runFtm(args);
  return { data: JSON.parse(stdout), code };
}
