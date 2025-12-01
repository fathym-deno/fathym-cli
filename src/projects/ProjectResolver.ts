import type { DFSFileHandler } from '@fathym/dfs';
import { parse as parseJsonc } from '@std/jsonc';
import { dirname } from '@std/path';
import type { ProjectRef } from './ProjectRef.ts';

/**
 * Options for project resolution.
 */
export interface ProjectResolveOptions {
  /** Include projects without a name in deno.json(c). Default: true */
  includeNameless?: boolean;
}

/**
 * Project resolver interface that works with DFS handlers.
 *
 * Provides a unified way to resolve project references across different
 * file system contexts (local, remote, virtual, etc.)
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
   *
   * @param ref - Project name, path to deno.json(c), or directory path
   * @param options - Resolution options
   * @returns Array of 0 to many ProjectRef entries
   */
  Resolve(ref?: string, options?: ProjectResolveOptions): Promise<ProjectRef[]>;
}

/**
 * DFS-based project resolver implementation.
 *
 * Uses DFSFileHandler for all file system operations, making it work
 * across different storage backends (local, blob storage, etc.)
 */
export class DFSProjectResolver implements ProjectResolver {
  constructor(public readonly DFS: DFSFileHandler) {}

  async Resolve(ref?: string, options?: ProjectResolveOptions): Promise<ProjectRef[]> {
    const includeNameless = options?.includeNameless ?? true;

    // No ref provided - discover all projects
    if (!ref) {
      return await this.discoverProjects(includeNameless);
    }

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
      return await this.walkDirectory(ref, includeNameless);
    }

    // Try to resolve by project name - search all discovered projects
    return await this.resolveByName(ref, includeNameless);
  }

  private async discoverProjects(includeNameless: boolean): Promise<ProjectRef[]> {
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
    }

    return projects;
  }

  private async walkDirectory(dirPath: string, includeNameless: boolean): Promise<ProjectRef[]> {
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
    }

    return projects;
  }

  private async resolveByName(ref: string, includeNameless: boolean): Promise<ProjectRef[]> {
    const projects = await this.discoverProjects(true);
    const matches: ProjectRef[] = [];

    for (const project of projects) {
      if (project.name === ref) {
        if (!project.name && !includeNameless) continue;
        matches.push(project);
      }
    }

    return matches;
  }

  private async loadProjectFromPath(configPath: string): Promise<ProjectRef | undefined> {
    try {
      const fileInfo = await this.DFS.GetFileInfo(configPath);
      if (!fileInfo) return undefined;

      const content = await new Response(fileInfo.Contents).text();
      const config = parseJsonc(content) as {
        name?: unknown;
        tasks?: Record<string, unknown>;
      };

      const absoluteConfigPath = this.DFS.ResolvePath(configPath);
      const dir = dirname(absoluteConfigPath);
      const name = typeof config.name === 'string' ? config.name : undefined;
      const tasks = config.tasks ?? {};
      const hasDev = Boolean(tasks && Object.hasOwn(tasks, 'dev'));

      return { name, dir, configPath: absoluteConfigPath, hasDev };
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
    return normalized.endsWith('deno.json') || normalized.endsWith('deno.jsonc');
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
