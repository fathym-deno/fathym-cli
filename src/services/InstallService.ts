/**
 * Install service for CLI binary installation.
 *
 * This module provides shared installation logic used by both the
 * InstallCommand and the generated install.ts script. It handles:
 * - Binary copying with Windows locked-file workaround
 * - Alias script creation (Unix shell scripts, Windows batch files)
 * - Executable permissions on Unix
 * - PATH verification and guidance
 *
 * @module
 */

import { join, normalize } from '@std/path';
import { exists } from '@fathym/common/path';
import { detectTarget, getBinaryExtension } from '../config/FathymCLIConfig.ts';

/**
 * Logger interface for installation output.
 */
export interface InstallLogger {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Console-based logger implementation.
 */
export const consoleLogger: InstallLogger = {
  info: (msg) => console.log(msg),
  success: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

/**
 * Options for finding a compiled binary.
 */
export interface FindBinaryOptions {
  /** The .dist directory path */
  distDir: string;
  /** Target platform (e.g., 'x86_64-apple-darwin') */
  target: string;
  /** Binary name with extension (e.g., 'ftm.exe') */
  binaryName: string;
}

/**
 * Finds a compiled binary in the dist directory.
 *
 * Searches in order of preference:
 * 1. `.dist/exe/<target>/<binary>` (new structure)
 * 2. `.dist/exe/<binary>` (local compile)
 * 3. `.dist/<target>/<binary>` (backwards compat)
 * 4. `.dist/<binary>` (backwards compat)
 *
 * @param options - Search options
 * @returns Path to the binary if found, undefined otherwise
 */
export async function findBinary(options: FindBinaryOptions): Promise<string | undefined> {
  const { distDir, target, binaryName } = options;

  const locations = [
    // New location: .dist/exe/x86_64-apple-darwin/ftm
    join(distDir, 'exe', target, binaryName),
    // Local compile: .dist/exe/ftm
    join(distDir, 'exe', binaryName),
    // Backwards compat: .dist/x86_64-apple-darwin/ftm
    join(distDir, target, binaryName),
    // Backwards compat: .dist/ftm
    join(distDir, binaryName),
  ];

  for (const loc of locations) {
    if (await exists(loc)) {
      return loc;
    }
  }

  return undefined;
}

/**
 * Options for installing a CLI binary.
 */
export interface InstallBinaryOptions {
  /** Full path to source binary */
  sourcePath: string;
  /** Target installation directory (absolute path) */
  installDir: string;
  /** Binary name with extension (e.g., 'ftm.exe') */
  binaryName: string;
  /** Additional command aliases (e.g., ['fathym']) */
  aliases: string[];
  /** Logger for installation output */
  log?: InstallLogger;
}

/**
 * Installs a CLI binary and creates alias scripts.
 *
 * Handles:
 * - Creating the install directory
 * - Copying the binary (with Windows locked-file workaround)
 * - Setting executable permissions on Unix
 * - Creating alias scripts for additional command names
 * - Checking if the install directory is in PATH
 *
 * @param options - Installation options
 */
export async function installBinary(options: InstallBinaryOptions): Promise<void> {
  const { sourcePath, installDir, binaryName, aliases, log = consoleLogger } = options;
  const isWindows = Deno.build.os === 'windows';

  // Create install directory
  await Deno.mkdir(installDir, { recursive: true });

  const destBinaryPath = join(installDir, binaryName);

  // On Windows, a running executable can be renamed but not overwritten.
  // If the destination exists and is locked, rename it first.
  const timestamp = Date.now();
  const oldBinaryPath = `${destBinaryPath}.${timestamp}.old`;

  // Clean up any old .old files from previous installs (best effort)
  try {
    for await (const entry of Deno.readDir(installDir)) {
      if (entry.name.startsWith(`${binaryName}.`) && entry.name.endsWith('.old')) {
        try {
          await Deno.remove(join(installDir, entry.name));
        } catch {
          // Ignore - file may still be in use
        }
      }
    }
  } catch {
    // Ignore directory read errors
  }

  // Try direct copy first; if locked, try rename-then-copy
  try {
    await Deno.copyFile(sourcePath, destBinaryPath);
  } catch (err) {
    // Check for EBUSY/EACCES error (file in use or access denied)
    const isBusy = err instanceof Deno.errors.Busy ||
      err instanceof Deno.errors.PermissionDenied ||
      (err && typeof err === 'object' && 'code' in err &&
        (err.code === 'EBUSY' || err.code === 'EACCES'));

    if (isWindows && isBusy) {
      log.info('🔄 Binary in use, using rename workaround...');
      try {
        log.info(`   Renaming ${destBinaryPath} → ${oldBinaryPath}`);
        await Deno.rename(destBinaryPath, oldBinaryPath);
        log.info(`   Copying ${sourcePath} → ${destBinaryPath}`);
        await Deno.copyFile(sourcePath, destBinaryPath);
        log.success(`✅ Installed using rename workaround`);
        // Try to clean up old file (may fail if still in use, that's ok)
        try {
          await Deno.remove(oldBinaryPath);
        } catch {
          log.info(`ℹ️  Old binary will be cleaned up on next install`);
        }
      } catch (renameErr) {
        // Extract a useful error message
        let errMsg: string;
        if (renameErr instanceof Error) {
          errMsg = renameErr.message;
        } else if (renameErr && typeof renameErr === 'object') {
          const code = 'code' in renameErr ? renameErr.code : undefined;
          const message = 'message' in renameErr ? renameErr.message : undefined;
          errMsg = message
            ? String(message)
            : code
            ? `Error code: ${code}`
            : JSON.stringify(renameErr);
        } else {
          errMsg = String(renameErr);
        }

        log.error(`❌ Rename workaround failed: ${errMsg}`);
        log.error('');
        log.error('The binary is locked and cannot be replaced.');
        log.error('This usually happens when the CLI is still running.');
        log.error('');
        log.error('Try one of these solutions:');
        log.error('  1. Close all terminal windows running the CLI');
        log.error('  2. Run the install command in a new terminal');
        log.error('  3. Manually copy the binary:');
        log.error(`     copy "${sourcePath}" "${destBinaryPath}"`);
        throw new Error('Binary locked and cannot be replaced');
      }
    } else {
      throw err;
    }
  }

  // Set executable permission on Unix
  if (!isWindows) {
    await Deno.chmod(destBinaryPath, 0o755);
  }

  log.success(`✅ Installed: ${destBinaryPath}`);

  // Create alias scripts
  for (const alias of aliases) {
    const aliasName = `${alias}${isWindows ? '.cmd' : ''}`;
    const aliasPath = join(installDir, aliasName);

    const aliasContent = isWindows
      ? `@echo off\r\n${binaryName} %*`
      : `#!/bin/sh\nexec ${binaryName} "$@"`;

    await Deno.writeTextFile(aliasPath, aliasContent);
    if (!isWindows) {
      await Deno.chmod(aliasPath, 0o755);
    }

    log.info(`🔗 Alias installed: ${aliasPath}`);
  }

  // Check if install directory is in PATH
  const envPath = Deno.env.get('PATH') ?? '';
  const pathSep = isWindows ? ';' : ':';
  // Normalize paths for comparison - Windows paths may have inconsistent separators/casing
  // Use case-insensitive comparison on Windows only (Unix filesystems are case-sensitive)
  const normalizePath = (p: string) => {
    const normalized = normalize(p);
    return isWindows ? normalized.toLowerCase() : normalized;
  };
  const normalizedInstallDir = normalizePath(installDir);
  const inPath = envPath.split(pathSep).some((p) => normalizePath(p) === normalizedInstallDir);

  if (!inPath) {
    log.warn(`⚠️  Install path (${installDir}) is not in your PATH`);
    if (isWindows) {
      log.info(`👉 Add to PATH: setx PATH "%PATH%;${installDir}"`);
    } else {
      log.info(`👉 Add to your shell profile: export PATH="${installDir}:$PATH"`);
    }
  }

  log.success('🎉 CLI installed successfully');
}

/**
 * Expands a tilde (~) path to the user's home directory.
 *
 * @param path - Path that may start with ~
 * @returns Expanded absolute path with normalized separators
 * @throws Error if home directory cannot be determined
 */
export function expandHome(path: string): string {
  if (path.startsWith('~')) {
    const home = Deno.env.get(Deno.build.os === 'windows' ? 'USERPROFILE' : 'HOME');
    if (!home) throw new Error('Could not determine home directory');
    // Use normalize to ensure consistent path separators on Windows
    // Without this, "~/.bin" becomes "C:\Users\Name/.bin" (mixed slashes)
    return normalize(path.replace('~', home));
  }
  return path;
}

// Re-export detectTarget and getBinaryExtension for convenience
export { detectTarget, getBinaryExtension };
