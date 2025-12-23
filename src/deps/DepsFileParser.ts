/**
 * Parser for .deps.ts files with direct JSR/npm specifiers.
 *
 * This module provides utilities for parsing TypeScript files that contain
 * direct package specifiers (e.g., `jsr:@fathym/common@0.2.307-common-release/merge`) and
 * updating them with new versions.
 *
 * ## Supported Specifier Formats
 *
 * ### JSR Specifiers
 * - `jsr:@scope/package@version`
 * - `jsr:@scope/package@version/subpath`
 * - `jsr:package@version` (unscoped)
 *
 * ### npm Specifiers
 * - `npm:package@version`
 * - `npm:@scope/package@version`
 *
 * @module
 */

/**
 * Represents a parsed dependency reference from a .deps.ts file.
 */
export interface DepsReference {
  /** Registry type: 'jsr' or 'npm' */
  registry: 'jsr' | 'npm';

  /** Package scope (e.g., '@fathym'), undefined for unscoped packages */
  scope?: string;

  /** Package name without scope (e.g., 'common') */
  name: string;

  /** Full package name including scope (e.g., '@fathym/common') */
  fullName: string;

  /** Version string (e.g., '0.2.299' or '0.2.299-integration') */
  version: string;

  /** Subpath after version (e.g., '/merge'), undefined if none */
  subpath?: string;

  /** The complete original specifier string */
  fullSpecifier: string;

  /** Line number (1-indexed) where this reference was found */
  line: number;

  /** Column position where the specifier starts */
  column: number;
}

/**
 * Parser for extracting and updating dependency references in .deps.ts files.
 *
 * @example Parse a file and list dependencies
 * ```typescript
 * const parser = new DepsFileParser();
 * const content = await Deno.readTextFile('./src/.deps.ts');
 * const refs = parser.parse(content);
 *
 * for (const ref of refs) {
 *   console.log(`${ref.fullName}@${ref.version}`);
 * }
 * ```
 *
 * @example Update versions in a file
 * ```typescript
 * const updates = new Map([
 *   ['@fathym/common', '0.2.300'],
 *   ['@fathym/eac', '0.2.167-integration'],
 * ]);
 * const newContent = parser.update(content, updates);
 * await Deno.writeTextFile('./src/.deps.ts', newContent);
 * ```
 */
export class DepsFileParser {
  /**
   * Regular expression to match JSR and npm specifiers in import/export statements.
   *
   * Captures:
   * - Group 1: Registry prefix ('jsr' or 'npm')
   * - Group 2: Full package name (with or without scope)
   * - Group 3: Version string
   * - Group 4: Subpath (optional)
   */
  private static readonly SPECIFIER_REGEX =
    /["'](jsr|npm):(@[^/@]+\/[^/@]+|[^/@]+)@([^/"']+)(\/[^"']*)?["']/g;

  /**
   * Parse a file's content and extract all dependency references.
   *
   * @param content - The file content to parse
   * @returns Array of dependency references found in the file
   */
  parse(content: string): DepsReference[] {
    const refs: DepsReference[] = [];
    const lines = content.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineNumber = lineIndex + 1;

      // Reset regex state for each line
      DepsFileParser.SPECIFIER_REGEX.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = DepsFileParser.SPECIFIER_REGEX.exec(line)) !== null) {
        const registry = match[1] as 'jsr' | 'npm';
        const packagePart = match[2];
        const version = match[3];
        const subpath = match[4] || undefined;

        // Parse scope and name
        let scope: string | undefined;
        let name: string;
        let fullName: string;

        if (packagePart.startsWith('@')) {
          const slashIndex = packagePart.indexOf('/');
          scope = packagePart.substring(0, slashIndex);
          name = packagePart.substring(slashIndex + 1);
          fullName = packagePart;
        } else {
          scope = undefined;
          name = packagePart;
          fullName = packagePart;
        }

        // Reconstruct full specifier
        const fullSpecifier = subpath
          ? `${registry}:${packagePart}@${version}${subpath}`
          : `${registry}:${packagePart}@${version}`;

        refs.push({
          registry,
          scope,
          name,
          fullName,
          version,
          subpath,
          fullSpecifier,
          line: lineNumber,
          column: match.index + 1, // 1-indexed column
        });
      }
    }

    return refs;
  }

  /**
   * Parse a single specifier string into its components.
   *
   * @param specifier - A specifier string like 'jsr:@fathym/common@0.2.307-common-release/merge'
   * @returns Parsed reference or null if the specifier is invalid
   */
  parseSpecifier(
    specifier: string,
  ): Omit<DepsReference, 'line' | 'column'> | null {
    // Match without quotes for direct specifier parsing
    const regex = /^(jsr|npm):(@[^/@]+\/[^/@]+|[^/@]+)@([^/]+)(\/.*)?$/;
    const match = regex.exec(specifier);

    if (!match) return null;

    const registry = match[1] as 'jsr' | 'npm';
    const packagePart = match[2];
    const version = match[3];
    const subpath = match[4] || undefined;

    let scope: string | undefined;
    let name: string;
    let fullName: string;

    if (packagePart.startsWith('@')) {
      const slashIndex = packagePart.indexOf('/');
      scope = packagePart.substring(0, slashIndex);
      name = packagePart.substring(slashIndex + 1);
      fullName = packagePart;
    } else {
      scope = undefined;
      name = packagePart;
      fullName = packagePart;
    }

    return {
      registry,
      scope,
      name,
      fullName,
      version,
      subpath,
      fullSpecifier: specifier,
    };
  }

  /**
   * Update dependency versions in a file's content.
   *
   * @param content - The original file content
   * @param updates - Map of package fullName to new version string
   * @returns Updated file content with new versions
   *
   * @example
   * ```typescript
   * const updates = new Map([
   *   ['@fathym/common', '0.2.300-integration'],
   *   ['zod', '4.1.14'],
   * ]);
   * const newContent = parser.update(content, updates);
   * ```
   */
  update(content: string, updates: Map<string, string>): string {
    if (updates.size === 0) return content;

    let result = content;

    // Process each update
    for (const [packageName, newVersion] of updates) {
      // Create regex to match this specific package in specifiers
      // Escape special regex characters in package name
      const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Match both jsr and npm specifiers for this package
      const regex = new RegExp(
        `(["'])(jsr|npm):${escapedName}@([^/"']+)(/[^"']*)?\\1`,
        'g',
      );

      result = result.replace(
        regex,
        (_match, quote, registry, _oldVersion, subpath) => {
          const newSubpath = subpath || '';
          return `${quote}${registry}:${packageName}@${newVersion}${newSubpath}${quote}`;
        },
      );
    }

    return result;
  }

  /**
   * Get unique packages from parsed references.
   *
   * Multiple references to the same package (with different subpaths)
   * are deduplicated.
   *
   * @param refs - Array of dependency references
   * @returns Map of package fullName to the first reference found
   */
  getUniquePackages(refs: DepsReference[]): Map<string, DepsReference> {
    const packages = new Map<string, DepsReference>();

    for (const ref of refs) {
      if (!packages.has(ref.fullName)) {
        packages.set(ref.fullName, ref);
      }
    }

    return packages;
  }

  /**
   * Filter references by registry type.
   *
   * @param refs - Array of dependency references
   * @param registry - Registry type to filter by
   * @returns Filtered array of references
   */
  filterByRegistry(
    refs: DepsReference[],
    registry: 'jsr' | 'npm',
  ): DepsReference[] {
    return refs.filter((ref) => ref.registry === registry);
  }

  /**
   * Filter references by package name pattern.
   *
   * Supports wildcards:
   * - `@fathym/eac*` matches `@fathym/eac`, `@fathym/eac-identity`, etc.
   * - `@fathym/*` matches all packages in the @fathym scope
   *
   * @param refs - Array of dependency references
   * @param pattern - Package name pattern (supports * wildcard)
   * @returns Filtered array of references
   */
  filterByPattern(refs: DepsReference[], pattern: string): DepsReference[] {
    if (!pattern.includes('*')) {
      // Exact match
      return refs.filter((ref) => ref.fullName === pattern);
    }

    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\\\*/g, '.*'); // Convert escaped * back to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return refs.filter((ref) => regex.test(ref.fullName));
  }
}
