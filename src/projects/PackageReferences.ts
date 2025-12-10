/**
 * Package references module - shared utilities for finding and updating package references.
 *
 * This module provides functions for discovering all references to a package
 * across a workspace, including config files, dependency files, templates,
 * documentation, and source code.
 *
 * @module
 */

import { compile as compileGitignore } from '@cfa/gitignore-parser';
import type { DFSProjectResolver } from './ProjectResolver.ts';

/**
 * A reference to a package found in the workspace.
 * Source indicates where the reference was found:
 * - 'config': deno.json(c) files
 * - 'deps': .deps.ts files
 * - 'template': .hbs template files
 * - 'docs': .md/.mdx documentation files
 * - 'other': other file types
 */
export interface PackageReference {
  file: string;
  line: number;
  currentVersion: string;
  source: 'config' | 'deps' | 'template' | 'docs' | 'other';
  /** The name of the project containing this reference (from deno.json(c)) */
  projectName: string;
}

/**
 * File patterns to search for package references.
 * These are in addition to project config files which are always searched.
 */
export const REFERENCE_FILE_PATTERNS = [
  /\.deps\.ts$/, // Dependency files
  /\.hbs$/, // Handlebars templates
  /\.mdx?$/, // Markdown and MDX documentation
  /\.tsx?$/, // TypeScript source files (may contain inline jsr: imports)
];

/**
 * Directories to always skip, regardless of .gitignore.
 */
export const ALWAYS_SKIP_DIRS = [
  '.git',
  'node_modules',
  '.deno',
  'cov',
  '.coverage',
];

/**
 * Determine the source type based on file path.
 */
export function getSourceType(filePath: string): PackageReference['source'] {
  if (/deno\.jsonc?$/.test(filePath)) return 'config';
  if (/\.deps\.ts$/.test(filePath)) return 'deps';
  if (/\.hbs$/.test(filePath)) return 'template';
  if (/\.mdx?$/.test(filePath)) return 'docs';
  return 'other';
}

/**
 * Load and compile .gitignore from the workspace root.
 * Returns a function that checks if a path should be ignored.
 */
export async function loadGitignore(
  rootDir: string,
): Promise<(path: string) => boolean> {
  try {
    const gitignorePath = `${rootDir}/.gitignore`;
    const content = await Deno.readTextFile(gitignorePath);
    const matcher = compileGitignore(content);
    return (path: string) => matcher.denies(path);
  } catch {
    // No .gitignore or can't read it - don't ignore anything
    return () => false;
  }
}

/**
 * Options for finding package references.
 */
export interface FindReferencesOptions {
  /** Filter by source type(s) - single type, array of types, or 'all' (default) */
  sourceFilter?: PackageReference['source'] | PackageReference['source'][] | 'all';
  /** Filter by project refs - only include references from projects matching these refs */
  projectFilter?: string[];
}

/**
 * Find all references to a package in the workspace.
 * Searches config files, .deps.ts files, templates, and documentation.
 * Respects .gitignore and always skips .git directories.
 * Only includes references from files within resolved projects.
 *
 * @param packageName - The package name to search for (e.g., '@fathym/dfs')
 * @param resolver - Project resolver for discovering projects
 * @param options - Optional filtering options
 */
export async function findPackageReferences(
  packageName: string,
  resolver: DFSProjectResolver,
  options?: FindReferencesOptions,
): Promise<PackageReference[]> {
  const references: PackageReference[] = [];
  const seenFiles = new Set<string>(); // Avoid duplicate entries

  // Parse filter options
  const sourceFilter = options?.sourceFilter ?? 'all';
  const projectFilter = options?.projectFilter ?? [];

  // Normalize source filter to array for easier checking
  const sourceTypes: PackageReference['source'][] | 'all' = sourceFilter === 'all'
    ? 'all'
    : Array.isArray(sourceFilter)
    ? sourceFilter
    : [sourceFilter];

  /**
   * Check if a source type passes the filter.
   */
  function matchesSourceFilter(source: PackageReference['source']): boolean {
    if (sourceTypes === 'all') return true;
    return sourceTypes.includes(source);
  }

  // Pattern to match: "jsr:@scope/name@version" with optional subpath (e.g., /build)
  // Group 1 = version (stops at / or quote/whitespace/comma)
  // The subpath after version is NOT captured - we only need the version for reporting
  const packagePattern = new RegExp(
    `jsr:${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@([^/"'\\s,]+)`,
  );

  const dfs = resolver.DFS;
  const rootDir = dfs.Root;

  // Load .gitignore for filtering
  const isGitignored = await loadGitignore(rootDir);

  // Resolve all projects and build a map from directory to project info
  const allProjects = await resolver.Resolve();
  const projectMap = new Map<string, { name: string; dir: string }>();

  for (const project of allProjects) {
    if (project.name) {
      // Normalize the directory path for consistent matching
      const normalizedDir = project.dir.replace(/\\/g, '/').replace(/^\//, '');
      projectMap.set(normalizedDir, { name: project.name, dir: normalizedDir });
    }
  }

  // Resolve project filter refs to a set of allowed project names
  let allowedProjects: Set<string> | null = null;
  if (projectFilter.length > 0) {
    allowedProjects = new Set<string>();
    for (const ref of projectFilter) {
      const resolved = await resolver.Resolve(ref);
      for (const project of resolved) {
        if (project.name) {
          allowedProjects.add(project.name);
        }
      }
    }
  }

  /**
   * Check if a project name passes the project filter.
   */
  function matchesProjectFilter(projectName: string): boolean {
    if (!allowedProjects) return true; // No filter = allow all
    return allowedProjects.has(projectName);
  }

  /**
   * Normalize a path to use forward slashes and remove leading ./ or /
   */
  function normalizePath(path: string): string {
    let normalized = path.replace(/\\/g, '/');
    if (normalized.startsWith('./')) {
      normalized = normalized.slice(2);
    }
    if (normalized.startsWith('/')) {
      normalized = normalized.slice(1);
    }
    return normalized;
  }

  /**
   * Find the project that contains a given file path.
   * Returns the project name if found, undefined otherwise.
   */
  function findProjectForFile(filePath: string): string | undefined {
    const normalized = normalizePath(filePath);

    // Find the project whose directory is a prefix of this file path
    // Sort by directory length descending to find the most specific match
    const sortedProjects = [...projectMap.entries()]
      .sort((a, b) => b[1].dir.length - a[1].dir.length);

    for (const [, project] of sortedProjects) {
      if (normalized.startsWith(project.dir + '/') || normalized === project.dir) {
        return project.name;
      }
    }

    return undefined;
  }

  /**
   * Check if a path should be skipped.
   * Expects relative paths (e.g., "projects/app/deno.jsonc").
   */
  function shouldSkip(path: string): boolean {
    const normalized = normalizePath(path);

    // Always skip certain directories
    for (const skipDir of ALWAYS_SKIP_DIRS) {
      if (normalized.includes(`/${skipDir}/`) || normalized.startsWith(`${skipDir}/`)) {
        return true;
      }
      if (normalized.endsWith(`/${skipDir}`) || normalized === skipDir) {
        return true;
      }
    }

    // Check .gitignore
    return isGitignored(normalized);
  }

  /**
   * Read file content from DFS using relative path.
   */
  async function readFileContent(filePath: string): Promise<string | null> {
    try {
      const fileInfo = await dfs.GetFileInfo(filePath);
      if (fileInfo) {
        return await new Response(fileInfo.Contents).text();
      }
    } catch {
      // File not found or read error
    }
    return null;
  }

  /**
   * Search a file for package references.
   * Only adds references if the file belongs to a project (has projectName)
   * and passes both source and project filters.
   */
  async function searchFile(filePath: string, projectName: string): Promise<void> {
    if (seenFiles.has(filePath)) return;
    seenFiles.add(filePath);

    if (shouldSkip(filePath)) return;

    // Check project filter
    if (!matchesProjectFilter(projectName)) return;

    // Check source filter
    const source = getSourceType(filePath);
    if (!matchesSourceFilter(source)) return;

    try {
      const content = await readFileContent(filePath);
      if (!content) return;

      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(packagePattern);

        if (match) {
          references.push({
            file: filePath,
            line: i + 1, // 1-indexed line numbers
            currentVersion: match[1], // The version part after @
            source,
            projectName,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  try {
    // 1. Search project config files (these are always relevant)
    for (const project of allProjects) {
      if (project.name) {
        await searchFile(project.configPath, project.name);
      }
    }

    // 2. Walk the workspace for additional file patterns
    // Build skip patterns for the DFS walk
    // Use patterns that match directory components, not substrings in filenames
    // E.g., /(^|\/)\.git(\/|$)/ matches ".git" as a directory but not "deno.git.ts"
    const skipPatterns = ALWAYS_SKIP_DIRS.map((dir) => {
      // Escape special regex characters in the directory name
      const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[/\\\\])${escaped}([/\\\\]|$)`);
    });

    for await (
      const entry of dfs.Walk({
        match: REFERENCE_FILE_PATTERNS,
        skip: skipPatterns,
      })
    ) {
      if (!entry.isFile) continue;

      // entry.path is already relative to DFS root - use directly
      // This ensures consistent relative paths in PackageReference.file
      // Only include files that belong to a project
      const projectName = findProjectForFile(entry.path);
      if (projectName) {
        await searchFile(entry.path, projectName);
      }
    }
  } catch {
    // Return empty if resolution fails
  }

  return references;
}

/**
 * Result of upgrading a package reference.
 */
export interface UpgradeResult {
  file: string;
  line: number;
  oldVersion: string;
  newVersion: string;
  source: PackageReference['source'];
  /** The name of the project containing this reference (from deno.json(c)) */
  projectName: string;
  success: boolean;
  error?: string;
}

/**
 * Options for upgrading package references.
 */
export interface UpgradeOptions {
  /** Target version to upgrade to */
  version: string;
  /** If true, don't write changes */
  dryRun?: boolean;
  /** Filter by source type(s) - single type, array of types, or 'all' (default) */
  sourceFilter?: PackageReference['source'] | PackageReference['source'][] | 'all';
  /** Filter by project refs - only upgrade references in projects matching these refs */
  projectFilter?: string[];
}

/**
 * Upgrade all references to a package in the workspace.
 * Returns results for each file that was (or would be) updated.
 */
export async function upgradePackageReferences(
  packageName: string,
  resolver: DFSProjectResolver,
  options: UpgradeOptions,
): Promise<UpgradeResult[]> {
  const { version, dryRun = false, sourceFilter = 'all', projectFilter = [] } = options;
  const results: UpgradeResult[] = [];

  const dfs = resolver.DFS;

  /**
   * Read file content from DFS using the relative file path.
   * Since findPackageReferences now returns relative paths, we use them directly.
   */
  async function readFileContent(filePath: string): Promise<string | null> {
    try {
      const fileInfo = await dfs.GetFileInfo(filePath);
      if (fileInfo) {
        return await new Response(fileInfo.Contents).text();
      }
    } catch {
      // File not found or read error
    }
    return null;
  }

  /**
   * Write file content to DFS using the relative file path.
   * Since PackageReference.file contains relative paths, we use them directly.
   */
  async function writeFileContent(filePath: string, content: string): Promise<void> {
    await dfs.WriteFile(filePath, content);
  }

  // Find all references with filters applied
  const filteredRefs = await findPackageReferences(packageName, resolver, {
    sourceFilter,
    projectFilter,
  });

  // Group references by file for efficient batch updates
  const refsByFile = new Map<string, PackageReference[]>();
  for (const ref of filteredRefs) {
    const existing = refsByFile.get(ref.file) || [];
    existing.push(ref);
    refsByFile.set(ref.file, existing);
  }

  // Pattern to match and replace versions, preserving optional subpaths (e.g., /build, /handlers)
  // Group 1 = prefix (jsr:@scope/name@)
  // Group 2 = version (stops at / or quote/whitespace/comma)
  // Group 3 = optional subpath (e.g., /build, /handlers/memory)
  const packagePattern = new RegExp(
    `(jsr:${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@)([^/"'\\s,]+)(/[^"'\\s,]*)?`,
    'g',
  );

  // Process each file
  for (const [filePath, fileRefs] of refsByFile) {
    try {
      const content = await readFileContent(filePath);
      if (!content) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Replace all occurrences in one pass, preserving subpaths
      const updatedContent = content.replace(
        packagePattern,
        (_match, prefix, _oldVersion, subpath) => {
          // Preserve the subpath if it exists, otherwise use empty string
          return `${prefix}${version}${subpath || ''}`;
        },
      );

      // Record results for each reference
      for (const ref of fileRefs) {
        results.push({
          file: ref.file,
          line: ref.line,
          oldVersion: ref.currentVersion,
          newVersion: version,
          source: ref.source,
          projectName: ref.projectName,
          success: true,
        });
      }

      // Write the file if not dry run
      if (!dryRun && content !== updatedContent) {
        await writeFileContent(filePath, updatedContent);
      }
    } catch (error) {
      // Record failure for all refs in this file
      for (const ref of fileRefs) {
        results.push({
          file: ref.file,
          line: ref.line,
          oldVersion: ref.currentVersion,
          newVersion: version,
          source: ref.source,
          projectName: ref.projectName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}
