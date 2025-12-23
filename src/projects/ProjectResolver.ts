/**
 * Project resolution utilities for workspace management.
 *
 * This module provides a unified way to discover and resolve project references
 * across different file system contexts using the DFS (Distributed File System)
 * abstraction layer.
 *
 * ## Resolution Logic
 *
 * The resolver accepts flexible input and determines project scope automatically:
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  Input                    │  Resolution                            │
 * │──────────────────────────────────────────────────────────────────── │
 * │  undefined                │  Discover all projects in workspace    │
 * │  deno.json(c) path        │  Load single project from config       │
 * │  Directory path           │  Walk directory for all projects       │
 * │  Package name             │  Search discovered projects by name    │
 * │  Comma-separated refs     │  Resolve each ref, deduplicate         │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * import { DFSProjectResolver } from '@fathym/ftm/projects';
 *
 * const resolver = new DFSProjectResolver(dfsHandler);
 *
 * // Discover all projects
 * const allProjects = await resolver.Resolve();
 *
 * // Resolve by package name
 * const [project] = await resolver.Resolve('@myorg/my-package');
 *
 * // Resolve by directory
 * const projects = await resolver.Resolve('./packages/apps');
 *
 * // Resolve multiple comma-separated refs
 * const multiProjects = await resolver.Resolve('@pkg/a,@pkg/b');
 *
 * // Ensure single result (throws if multiple)
 * const [single] = await resolver.Resolve('@pkg', { singleOnly: true });
 *
 * // Get first match only
 * const [first] = await resolver.Resolve('./packages/', { useFirst: true });
 * ```
 *
 * @module
 */

import type { DFSFileHandler } from '@fathym/dfs';
import { parse as parseJsonc } from '@std/jsonc';
import { dirname } from '@std/path';
import type { ProjectRef } from './ProjectRef.ts';

/**
 * Options for project resolution.
 *
 * Controls filtering behavior during project discovery.
 */
export interface ProjectResolveOptions {
  /**
   * Include projects without a name in deno.json(c).
   *
   * When false, only named packages (with `"name"` field) are returned.
   * Useful for filtering out test fixtures or internal projects.
   *
   * @default true
   */
  includeNameless?: boolean;

  /**
   * Require exactly one project to be resolved.
   *
   * When true, throws an error if the resolution returns more than one project.
   * Useful for commands that operate on a single project only.
   *
   * Note: `useFirst` takes precedence - if both are true, useFirst wins (no error).
   *
   * @default false
   */
  singleOnly?: boolean;

  /**
   * Return only the first matched project.
   *
   * When true, stops resolution early and returns only the first project found.
   * Takes precedence over singleOnly (no error thrown for multiple matches).
   *
   * @default false
   */
  useFirst?: boolean;
}

/**
 * Error thrown when singleOnly option is violated.
 */
export class MultipleProjectsError extends Error {
  constructor(
    public readonly ref: string | undefined,
    public readonly count: number,
  ) {
    super(
      `Expected single project but found ${count} for ref: ${ref ?? '(all)'}`,
    );
    this.name = 'MultipleProjectsError';
  }
}

/**
 * Project resolver interface that works with DFS handlers.
 *
 * Provides a unified way to resolve project references across different
 * file system contexts (local, remote, virtual, etc.). This abstraction
 * enables commands to work with any DFS-compatible storage backend.
 *
 * @example Basic resolution
 * ```typescript
 * const projects = await resolver.Resolve('@myorg/utils');
 * if (projects.length === 0) {
 *   console.log('Project not found');
 * }
 * ```
 *
 * @example Discover all projects
 * ```typescript
 * const allProjects = await resolver.Resolve();
 * for (const project of allProjects) {
 *   console.log(`${project.name}: ${project.dir}`);
 * }
 * ```
 */
export interface ProjectResolver {
  /** The DFS handler used for file operations */
  readonly DFS: DFSFileHandler;

  /**
   * Resolve a project reference to ProjectRef array.
   *
   * Resolution logic:
   * - undefined → discover all projects
   * - deno.json(c) path → [single project]
   * - directory path → walk directory, return [all projects found]
   * - package name → search discovered projects for match
   * - comma-separated → resolve each, deduplicate by configPath
   *
   * @param ref - Project name, path to deno.json(c), directory path, or comma-separated list
   * @param options - Resolution options
   * @returns Array of 0 to many ProjectRef entries
   * @throws {MultipleProjectsError} When singleOnly is true and multiple projects found
   */
  Resolve(ref?: string, options?: ProjectResolveOptions): Promise<ProjectRef[]>;
}

/**
 * Parse a comma-separated ref string into individual refs.
 *
 * Handles edge cases:
 * - Trims whitespace around each ref
 * - Filters out empty segments (from double commas, leading/trailing commas)
 * - Returns empty array for whitespace-only input
 *
 * @param ref - The ref string to parse
 * @returns Array of individual refs
 */
export function parseRefs(ref: string): string[] {
  return ref
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/**
 * DFS-based project resolver implementation.
 *
 * Uses DFSFileHandler for all file system operations, making it work
 * across different storage backends (local, blob storage, etc.).
 *
 * The resolver walks the file system looking for `deno.json` or `deno.jsonc`
 * files, automatically skipping common non-project directories like
 * `node_modules/`, `.git/`, and `cov/`.
 *
 * @example Create resolver with local DFS
 * ```typescript
 * const dfs = await dfsCtx.GetExecutionDFS();
 * const resolver = new DFSProjectResolver(dfs);
 * ```
 */
export class DFSProjectResolver implements ProjectResolver {
  /**
   * Create a new project resolver.
   *
   * @param DFS - DFSFileHandler instance for file operations
   */
  constructor(public readonly DFS: DFSFileHandler) {}

  async Resolve(
    ref?: string,
    options?: ProjectResolveOptions,
  ): Promise<ProjectRef[]> {
    const includeNameless = options?.includeNameless ?? true;
    const singleOnly = options?.singleOnly ?? false;
    const useFirst = options?.useFirst ?? false;

    let results: ProjectRef[];

    // No ref provided - discover all projects
    if (!ref) {
      results = await this.discoverProjects(includeNameless, useFirst);
    } else {
      // Parse comma-separated refs
      const refs = parseRefs(ref);

      if (refs.length === 0) {
        // Input was whitespace/commas only
        results = [];
      } else if (refs.length === 1) {
        // Single ref - use existing logic
        results = await this.resolveSingleRef(
          refs[0],
          includeNameless,
          useFirst,
        );
      } else {
        // Multiple refs - resolve each and deduplicate
        results = await this.resolveMultipleRefs(
          refs,
          includeNameless,
          useFirst,
        );
      }
    }

    // Apply result options
    return this.applyResultOptions(results, ref, singleOnly, useFirst);
  }

  /**
   * Apply singleOnly and useFirst options to results.
   */
  private applyResultOptions(
    results: ProjectRef[],
    ref: string | undefined,
    singleOnly: boolean,
    useFirst: boolean,
  ): ProjectRef[] {
    // useFirst takes precedence - return first only (no error)
    if (useFirst) {
      return results.length > 0 ? [results[0]] : [];
    }

    // singleOnly - throw if multiple
    if (singleOnly && results.length > 1) {
      throw new MultipleProjectsError(ref, results.length);
    }

    return results;
  }

  /**
   * Resolve a single ref (not comma-separated).
   */
  private async resolveSingleRef(
    ref: string,
    includeNameless: boolean,
    useFirst: boolean,
  ): Promise<ProjectRef[]> {
    // Check if ref is a direct path to a deno.json(c) file
    if (this.isDenoConfig(ref)) {
      const project = await this.loadProjectFromPath(ref);
      if (project) {
        if (!project.name && !includeNameless) return [];
        return [project];
      }
    }

    // Check if ref is a directory path - look for deno.jsonc or deno.json
    const jsoncPath = ref.endsWith('/') ? `${ref}deno.jsonc` : `${ref}/deno.jsonc`;
    const jsonPath = ref.endsWith('/') ? `${ref}deno.json` : `${ref}/deno.json`;

    // Try as directory with single config
    const jsoncProject = await this.loadProjectFromPath(jsoncPath);
    if (jsoncProject) {
      if (!jsoncProject.name && !includeNameless) return [];
      return [jsoncProject];
    }

    const jsonProject = await this.loadProjectFromPath(jsonPath);
    if (jsonProject) {
      if (!jsonProject.name && !includeNameless) return [];
      return [jsonProject];
    }

    // Check if ref is a directory to walk for multiple projects
    const isDirectory = await this.isDirectory(ref);
    if (isDirectory) {
      return await this.walkDirectory(ref, includeNameless, useFirst);
    }

    // Try to resolve by project name - search all discovered projects
    return await this.resolveByName(ref, includeNameless, useFirst);
  }

  /**
   * Resolve multiple refs and deduplicate by configPath.
   */
  private async resolveMultipleRefs(
    refs: string[],
    includeNameless: boolean,
    useFirst: boolean,
  ): Promise<ProjectRef[]> {
    const results: ProjectRef[] = [];
    const seen = new Set<string>();

    for (const ref of refs) {
      // Early exit if useFirst and we have a result
      if (useFirst && results.length > 0) {
        break;
      }

      const projects = await this.resolveSingleRef(ref, includeNameless, false);

      for (const project of projects) {
        // Deduplicate by configPath
        if (!seen.has(project.configPath)) {
          seen.add(project.configPath);
          results.push(project);

          // Early exit if useFirst
          if (useFirst) {
            break;
          }
        }
      }
    }

    return results;
  }

  private async discoverProjects(
    includeNameless: boolean,
    useFirst: boolean,
  ): Promise<ProjectRef[]> {
    const projects: ProjectRef[] = [];

    for await (
      const entry of this.DFS.Walk({
        match: [/deno\.jsonc?$/],
        skip: [/node_modules/, /\.git/, /cov/],
      })
    ) {
      if (!entry.isFile) continue;

      const project = await this.loadProjectFromPath(entry.path);
      if (!project) continue;
      if (!project.name && !includeNameless) continue;

      projects.push(project);

      // Early exit if useFirst
      if (useFirst) {
        break;
      }
    }

    return projects;
  }

  private async walkDirectory(
    dirPath: string,
    includeNameless: boolean,
    useFirst: boolean,
  ): Promise<ProjectRef[]> {
    const projects: ProjectRef[] = [];
    // Normalize: remove leading ./ or ensure consistent format, add trailing /
    const normalizedDir = this.normalizePath(dirPath) + '/';

    for await (
      const entry of this.DFS.Walk({
        match: [/deno\.jsonc?$/],
        skip: [/node_modules/, /\.git/, /cov/],
      })
    ) {
      if (!entry.isFile) continue;

      // Normalize entry path for comparison
      const normalizedPath = this.normalizePath(entry.path);

      // Only include files under the specified directory
      if (!normalizedPath.startsWith(normalizedDir)) {
        continue;
      }

      const project = await this.loadProjectFromPath(entry.path);
      if (!project) continue;
      if (!project.name && !includeNameless) continue;

      projects.push(project);

      // Early exit if useFirst
      if (useFirst) {
        break;
      }
    }

    return projects;
  }

  private async resolveByName(
    ref: string,
    includeNameless: boolean,
    useFirst: boolean,
  ): Promise<ProjectRef[]> {
    const projects = await this.discoverProjects(true, false);
    const matches: ProjectRef[] = [];

    for (const project of projects) {
      if (project.name === ref) {
        if (!project.name && !includeNameless) continue;
        matches.push(project);

        // Early exit if useFirst
        if (useFirst) {
          break;
        }
      }
    }

    return matches;
  }

  private async loadProjectFromPath(
    configPath: string,
  ): Promise<ProjectRef | undefined> {
    try {
      const fileInfo = await this.DFS.GetFileInfo(configPath);
      if (!fileInfo) return undefined;

      const content = await new Response(fileInfo.Contents).text();
      const config = parseJsonc(content) as {
        name?: unknown;
        tasks?: Record<string, unknown>;
      };

      // Use normalized relative path instead of absolute path
      // This ensures consistent path handling across platforms
      const normalizedConfigPath = this.normalizePath(configPath);
      const dir = dirname(normalizedConfigPath);
      const name = typeof config.name === 'string' ? config.name : undefined;
      const rawTasks = config.tasks ?? {};
      const hasDev = Boolean(rawTasks && Object.hasOwn(rawTasks, 'dev'));

      // Convert tasks to Record<string, string>, filtering non-string values
      const tasks: Record<string, string> = {};
      for (const [key, value] of Object.entries(rawTasks)) {
        if (typeof value === 'string') {
          tasks[key] = value;
        }
      }

      return { name, dir, configPath: normalizedConfigPath, hasDev, tasks };
    } catch {
      return undefined;
    }
  }

  private async isDirectory(path: string): Promise<boolean> {
    // In DFS, we check if any files exist under this path prefix
    const normalizedDir = this.normalizePath(path) + '/';

    for await (const entry of this.DFS.Walk()) {
      const entryPath = this.normalizePath(entry.path);
      if (entryPath.startsWith(normalizedDir)) {
        return true;
      }
    }

    return false;
  }

  private isDenoConfig(path: string): boolean {
    const normalized = path.replace(/\\/g, '/');
    return normalized.endsWith('deno.json') ||
      normalized.endsWith('deno.jsonc');
  }

  /**
   * Normalize a path for consistent comparison.
   * Removes leading ./ and \, converts backslashes to forward slashes.
   */
  private normalizePath(path: string): string {
    let normalized = path.replace(/\\/g, '/');
    // Remove leading ./
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }
    // Remove leading /
    if (normalized.startsWith('/')) {
      normalized = normalized.slice(1);
    }
    return normalized;
  }
}
