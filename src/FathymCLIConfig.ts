/**
 * Extended CLI configuration for Fathym CLI projects.
 *
 * This module defines the FathymCLIConfig type which extends the base CLIConfig
 * from @fathym/cli with additional release and cross-compilation configuration.
 *
 * @example Using FathymCLIConfig
 * ```typescript
 * import { loadCLIConfig } from '@fathym/cli';
 * import type { FathymCLIConfig } from './FathymCLIConfig.ts';
 *
 * const config = await loadCLIConfig<FathymCLIConfig>('./.cli.json');
 * console.log(config.Release?.Targets); // ['x86_64-pc-windows-msvc', ...]
 * ```
 *
 * @module
 */

import type { CLIConfig } from '@fathym/cli';

/**
 * Release configuration for cross-platform binary distribution.
 *
 * Defines compilation targets and installation defaults for
 * releasing CLI binaries to multiple platforms.
 */
export interface ReleaseConfig {
  /**
   * Target platforms to compile for.
   *
   * Uses Deno's cross-compilation target triples.
   * Defaults to all 5 standard Deno compile targets if not specified.
   *
   * @example
   * ```json
   * {
   *   "Targets": ["x86_64-pc-windows-msvc", "x86_64-apple-darwin"]
   * }
   * ```
   */
  Targets?: string[];

  /**
   * Default installation directory per platform.
   *
   * Both unix and windows default to `~/.bin` if not specified.
   *
   * @example
   * ```json
   * {
   *   "DefaultInstallDir": {
   *     "unix": "~/.local/bin",
   *     "windows": "~/.bin"
   *   }
   * }
   * ```
   */
  DefaultInstallDir?: {
    unix?: string;
    windows?: string;
  };
}

/**
 * Extended CLI configuration for Fathym CLI projects.
 *
 * Extends the base CLIConfig with release configuration for
 * cross-platform binary distribution.
 */
export interface FathymCLIConfig extends CLIConfig {
  /**
   * Release configuration for cross-platform binary distribution.
   *
   * When present, enables the `release` command to compile binaries
   * for multiple platforms and generate install scripts.
   */
  Release?: ReleaseConfig;
}

/**
 * Default compilation targets for cross-platform releases.
 *
 * These are the 5 standard Deno compile targets:
 * - Windows x64
 * - macOS x64 (Intel)
 * - macOS ARM64 (Apple Silicon)
 * - Linux x64
 * - Linux ARM64
 */
export const DEFAULT_TARGETS = [
  'x86_64-pc-windows-msvc',
  'x86_64-apple-darwin',
  'aarch64-apple-darwin',
  'x86_64-unknown-linux-gnu',
  'aarch64-unknown-linux-gnu',
] as const;

/**
 * Type for the default targets tuple.
 */
export type DefaultTarget = (typeof DEFAULT_TARGETS)[number];

/**
 * Default install directories per platform.
 *
 * Both platforms default to `~/.bin` for consistency.
 */
export const DEFAULT_INSTALL_DIR = {
  unix: '~/.bin',
  windows: '~/.bin',
} as const;

/**
 * Detects the current platform's Deno compile target.
 *
 * Maps `Deno.build.os` and `Deno.build.arch` to the appropriate
 * Deno compile target triple.
 *
 * @returns The target triple for the current platform
 * @throws Error if running on an unsupported platform
 *
 * @example
 * ```typescript
 * const target = detectTarget();
 * // On Windows x64: 'x86_64-pc-windows-msvc'
 * // On macOS ARM: 'aarch64-apple-darwin'
 * // On Linux x64: 'x86_64-unknown-linux-gnu'
 * ```
 */
export function detectTarget(): DefaultTarget {
  const os = Deno.build.os;
  const arch = Deno.build.arch;

  if (os === 'windows') {
    return 'x86_64-pc-windows-msvc';
  }

  if (os === 'darwin') {
    return arch === 'aarch64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  }

  if (os === 'linux') {
    return arch === 'aarch64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
  }

  throw new Error(`Unsupported platform: ${os}/${arch}`);
}

/**
 * Gets the binary extension for a given target.
 *
 * @param target - The Deno compile target triple
 * @returns '.exe' for Windows targets, '' for others
 *
 * @example
 * ```typescript
 * getBinaryExtension('x86_64-pc-windows-msvc'); // '.exe'
 * getBinaryExtension('x86_64-apple-darwin');    // ''
 * ```
 */
export function getBinaryExtension(target: string): string {
  return target.includes('windows') ? '.exe' : '';
}
