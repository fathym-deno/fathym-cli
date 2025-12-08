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
 * Find all references to a package in the workspace.
 * Searches config files, .deps.ts files, templates, and documentation.
 * Respects .gitignore and always skips .git directories.
 */
export async function findPackageReferences(
  packageName: string,
  resolver: DFSProjectResolver,
): Promise<PackageReference[]> {
  const references: PackageReference[] = [];
  const seenFiles = new Set<string>(); // Avoid duplicate entries

  // Pattern to match: "jsr:@scope/name@version" (with or without quotes)
  const packagePattern = new RegExp(
    `jsr:${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@([^"'\\s,]+)`,
  );

  const dfs = resolver.DFS;
  const rootDir = dfs.Root;
  // Get the resolved root path for absolute path comparison
  // ResolvePath converts DFS root to system absolute path (e.g., "/" -> "G:\")
  const resolvedRoot = dfs.ResolvePath('/');

  // Load .gitignore for filtering
  const isGitignored = await loadGitignore(rootDir);

  /**
   * Convert an absolute system path back to a DFS relative path.
   * E.g., "G:\projects\app\deno.jsonc" -> "projects/app/deno.jsonc"
   */
  function toRelativePath(absolutePath: string): string {
    let relative: string;
    // Try stripping the resolved root first (handles absolute system paths)
    if (absolutePath.startsWith(resolvedRoot)) {
      relative = absolutePath.slice(resolvedRoot.length).replace(/^[/\\]/, '');
    } else if (absolutePath.startsWith(rootDir)) {
      // Fall back to DFS root (handles already-relative paths)
      relative = absolutePath.slice(rootDir.length).replace(/^[/\\]/, '');
    } else {
      // Already relative or unknown format
      relative = absolutePath.replace(/^[./\\]+/, '');
    }
    // Normalize to forward slashes for consistent DFS path handling
    return relative.replace(/\\/g, '/');
  }

  /**
   * Check if a path should be skipped.
   */
  function shouldSkip(path: string): boolean {
    // Always skip certain directories
    for (const skipDir of ALWAYS_SKIP_DIRS) {
      if (path.includes(`/${skipDir}/`) || path.includes(`\\${skipDir}\\`)) {
        return true;
      }
      if (path.endsWith(`/${skipDir}`) || path.endsWith(`\\${skipDir}`)) {
        return true;
      }
    }

    // Check .gitignore
    const relativePath = toRelativePath(path);
    return isGitignored(relativePath);
  }

  /**
   * Read file content, trying DFS first then falling back to Deno.readTextFile.
   * This allows the code to work with both MemoryDFSFileHandler (tests) and
   * LocalDFSFileHandler (production).
   */
  async function readFileContent(filePath: string): Promise<string | null> {
    // Try DFS first (works with MemoryDFSFileHandler in tests)
    try {
      const relativePath = toRelativePath(filePath);
      const fileInfo = await dfs.GetFileInfo(relativePath);
      if (fileInfo) {
        return await new Response(fileInfo.Contents).text();
      }
    } catch {
      // Fall through to try Deno.readTextFile
    }

    // Try direct file read (works with absolute paths in production)
    try {
      return await Deno.readTextFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Search a file for package references.
   */
  async function searchFile(filePath: string): Promise<void> {
    if (seenFiles.has(filePath)) return;
    seenFiles.add(filePath);

    if (shouldSkip(filePath)) return;

    try {
      const content = await readFileContent(filePath);
      if (!content) return;

      const lines = content.split('\n');
      const source = getSourceType(filePath);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(packagePattern);

        if (match) {
          references.push({
            file: filePath,
            line: i + 1, // 1-indexed line numbers
            currentVersion: match[1], // The version part after @
            source,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  try {
    // 1. Search project config files (these are always relevant)
    const allProjects = await resolver.Resolve();
    for (const project of allProjects) {
      await searchFile(project.configPath);
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

      const fullPath = dfs.ResolvePath(entry.path);
      await searchFile(fullPath);
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
  /** Filter by source type */
  filter?: PackageReference['source'] | 'all';
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
  const { version, dryRun = false, filter = 'all' } = options;
  const results: UpgradeResult[] = [];

  const dfs = resolver.DFS;
  const rootDir = dfs.Root;
  // Get the resolved root path for absolute path comparison
  const resolvedRoot = dfs.ResolvePath('/');

  /**
   * Convert an absolute system path back to a DFS relative path.
   */
  function toRelativePath(absolutePath: string): string {
    let relative: string;
    if (absolutePath.startsWith(resolvedRoot)) {
      relative = absolutePath.slice(resolvedRoot.length).replace(/^[/\\]/, '');
    } else if (absolutePath.startsWith(rootDir)) {
      relative = absolutePath.slice(rootDir.length).replace(/^[/\\]/, '');
    } else {
      relative = absolutePath.replace(/^[./\\]+/, '');
    }
    // Normalize to forward slashes for consistent DFS path handling
    return relative.replace(/\\/g, '/');
  }

  /**
   * Read file content, trying DFS first then falling back to Deno.readTextFile.
   */
  async function readFileContent(filePath: string): Promise<string | null> {
    try {
      const relativePath = toRelativePath(filePath);
      const fileInfo = await dfs.GetFileInfo(relativePath);
      if (fileInfo) {
        return await new Response(fileInfo.Contents).text();
      }
    } catch {
      // Fall through
    }
    try {
      return await Deno.readTextFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Write file content, trying DFS first then falling back to Deno.writeTextFile.
   */
  async function writeFileContent(filePath: string, content: string): Promise<void> {
    const relativePath = toRelativePath(filePath);
    try {
      await dfs.WriteFile(relativePath, content);
      return;
    } catch {
      // Fall through
    }
    await Deno.writeTextFile(filePath, content);
  }

  // Find all references
  const references = await findPackageReferences(packageName, resolver);

  // Filter by source type if specified
  const filteredRefs = filter === 'all'
    ? references
    : references.filter((ref) => ref.source === filter);

  // Group references by file for efficient batch updates
  const refsByFile = new Map<string, PackageReference[]>();
  for (const ref of filteredRefs) {
    const existing = refsByFile.get(ref.file) || [];
    existing.push(ref);
    refsByFile.set(ref.file, existing);
  }

  // Pattern to match and replace versions
  const packagePattern = new RegExp(
    `(jsr:${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@)([^"'\\s,]+)`,
    'g',
  );

  // Process each file
  for (const [filePath, fileRefs] of refsByFile) {
    try {
      const content = await readFileContent(filePath);
      if (!content) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Replace all occurrences in one pass
      const updatedContent = content.replace(packagePattern, `$1${version}`);

      // Record results for each reference
      for (const ref of fileRefs) {
        results.push({
          file: ref.file,
          line: ref.line,
          oldVersion: ref.currentVersion,
          newVersion: version,
          source: ref.source,
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
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}
