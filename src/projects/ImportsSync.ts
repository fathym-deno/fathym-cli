/**
 * Import synchronization utilities for multi-package workspaces.
 *
 * This module provides the core logic for switching deno.jsonc import maps
 * between local workspace paths (for development) and JSR registry imports
 * (for production/publishing).
 *
 * ## How It Works
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  LOCAL MODE                                                        │
 * │  ─────────                                                         │
 * │  1. Discovers all local packages in workspace                      │
 * │  2. Classifies as 'runtime' (has subpath exports) or 'library'     │
 * │  3. For each target config:                                        │
 * │     a. Preserves original JSR imports in comments                  │
 * │     b. Rewrites imports to relative workspace paths                │
 * │     c. Handles both base imports and subpath exports               │
 * │                                                                    │
 * │  REMOTE MODE                                                       │
 * │  ───────────                                                       │
 * │  1. Reads preserved original imports from comments                 │
 * │  2. Restores JSR registry imports                                  │
 * │  3. Removes local workspace overrides                              │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Package Classification
 *
 * - **Runtime packages**: Have exports with `/` subpaths (e.g., `"./api"`)
 * - **Library packages**: Only have root export or no special subpaths
 *
 * ## Preserved Comments
 *
 * Original imports are preserved using special comment markers:
 *
 * ```jsonc
 * {
 *   "imports": {
 *     // @sync-imports BEGIN ORIGINAL IMPORTS
 *     // "@myorg/utils": "jsr:@myorg/utils@1.0.0"
 *     // @sync-imports END ORIGINAL IMPORTS
 *     "@myorg/utils": "../utils/src/.exports.ts"
 *   }
 * }
 * ```
 *
 * @module
 */

import type { DFSFileHandler } from "@fathym/dfs";
import { dirname, isAbsolute, join, relative } from "@std/path";
import { parse as parseJsonc } from "@std/jsonc";
import type { ProjectResolver } from "./ProjectResolver.ts";

/**
 * Sync mode for import operations.
 *
 * - `'local'`: Rewrite imports to use local workspace paths
 * - `'remote'`: Restore original JSR registry imports
 */
export type ImportsSyncMode = "local" | "remote";

/**
 * Options for the syncImports function.
 */
export interface SyncImportsOptions {
  /** Sync direction: 'local' or 'remote' */
  mode: ImportsSyncMode;

  /** Target package name, config path, or directory */
  target: string;

  /** Project resolver for file system operations */
  resolver: ProjectResolver;

  /** Optional logger function for progress messages */
  log?: (message: string) => void;
}

/**
 * Result of a sync operation.
 */
export interface SyncImportsResult {
  /** All local packages discovered in the workspace */
  localPackages: LocalPackageConfig[];

  /** Config files that were modified */
  targetConfigs: string[];
}

/**
 * Configuration for a discovered local package.
 */
export interface LocalPackageConfig {
  /** Package name from deno.json(c) */
  name: string;

  /** Absolute path to the deno.json(c) file */
  configPath: string;

  /** Absolute path to the package directory */
  packageDir: string;

  /** Export map from deno.json(c) */
  exports: Record<string, string>;

  /** Package classification: 'runtime' has subpath exports, 'library' does not */
  kind: "runtime" | "library";
}

interface ImportsBlockRange {
  braceStart: number;
  braceEnd: number;
}

interface LibraryOverride {
  specifier: string;
  importPath: string;
}

interface RuntimeOverride {
  specifier: string;
  importPath: string;
}

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

/** Comment marker indicating the start of preserved original imports */
const ORIGINAL_BEGIN = "// @sync-imports BEGIN ORIGINAL IMPORTS";

/** Comment marker indicating the end of preserved original imports */
const ORIGINAL_END = "// @sync-imports END ORIGINAL IMPORTS";

/**
 * Synchronize import mappings for target project(s).
 *
 * This is the main entry point for import synchronization. It discovers
 * local packages, resolves target configs, and applies the appropriate
 * mode transformation to each target.
 *
 * @param options - Sync options including mode, target, and resolver
 * @returns Result containing discovered packages and modified configs
 * @throws Error if no valid targets are found
 *
 * @example Sync to local mode
 * ```typescript
 * const result = await syncImports({
 *   mode: 'local',
 *   target: '@myorg/my-app',
 *   resolver: new DFSProjectResolver(dfs),
 *   log: console.log,
 * });
 * ```
 *
 * @example Restore remote imports
 * ```typescript
 * const result = await syncImports({
 *   mode: 'remote',
 *   target: './packages/apps',
 *   resolver: new DFSProjectResolver(dfs),
 * });
 * ```
 */
export async function syncImports(
  options: SyncImportsOptions,
): Promise<SyncImportsResult> {
  const logger = makeLogger(options.log);
  const dfs = options.resolver.DFS;

  const localPackages = await discoverLocalPackages(dfs, logger);

  const runtimes = localPackages.filter((p) => p.kind === "runtime");
  const libraries = localPackages.filter((p) => p.kind === "library");

  logger.info(
    `[sync-imports] discovered ${localPackages.length} local package(s) ` +
      `(runtimes: ${runtimes.length}, libraries: ${libraries.length})`,
  );
  if (runtimes.length) {
    logger.info(`  runtimes: ${runtimes.map((pkg) => pkg.name).join(", ")}`);
  }
  if (libraries.length) {
    logger.info(`  libraries: ${libraries.map((pkg) => pkg.name).join(", ")}`);
  }

  const targetConfigs = await resolveTargetConfigs(
    options.target,
    localPackages,
    options.resolver,
    logger,
  );

  if (targetConfigs.length === 0) {
    throw new Error(
      `[sync-imports] No usable deno.jsonc targets resolved for: ${options.target}`,
    );
  }

  logger.info(
    `[sync-imports] mode=${options.mode} resolved ${targetConfigs.length} deno.jsonc target(s):`,
  );
  for (const cfg of targetConfigs) {
    logger.info(`  - ${cfg}`);
  }

  if (options.mode === "local") {
    for (const cfg of targetConfigs) {
      await applyLocalModeToConfig(cfg, localPackages, dfs, logger);
    }
    logger.info(
      "[sync-imports] Local mode completed for all resolved targets.",
    );
  } else {
    for (const cfg of targetConfigs) {
      await applyRemoteModeToConfig(cfg, dfs, logger);
    }
    logger.info(
      "[sync-imports] Remote mode completed for all resolved targets.",
    );
  }

  return { localPackages, targetConfigs };
}

function makeLogger(log?: (message: string) => void): Logger {
  return {
    info: log ?? console.log,
    warn: console.warn,
    error: console.error,
  };
}

function commentLine(line: string): string {
  return line.trim().length === 0 ? line : `// ${line}`;
}

function uncommentLine(line: string): string {
  return line.replace(/^\/\/\s?/, "");
}

async function discoverLocalPackages(
  dfs: DFSFileHandler,
  _logger: Logger,
): Promise<LocalPackageConfig[]> {
  const packages: LocalPackageConfig[] = [];

  for await (
    const entry of dfs.Walk({
      match: [/deno\.jsonc$/],
      skip: [/node_modules/, /\.git/, /cov/],
    })
  ) {
    if (!entry.isFile) continue;

    const configPath = dfs.ResolvePath(entry.path);

    let text: string;
    try {
      const fileInfo = await dfs.GetFileInfo(entry.path);
      if (!fileInfo) continue;
      text = await new Response(fileInfo.Contents).text();
    } catch {
      continue;
    }

    let config: unknown;
    try {
      config = parseJsonc(text);
    } catch {
      continue;
    }

    if (
      !config ||
      typeof config !== "object" ||
      !("name" in config) ||
      !("exports" in config)
    ) {
      continue;
    }

    const name = (config as { name: unknown }).name;
    const exports = (config as { exports: unknown }).exports;

    if (
      typeof name !== "string" || typeof exports !== "object" ||
      exports === null
    ) {
      continue;
    }

    const packageDir = dirname(configPath);
    const isRuntime = await isRuntimePackage(packageDir, dfs);

    packages.push({
      name,
      configPath,
      packageDir,
      exports: exports as Record<string, string>,
      kind: isRuntime ? "runtime" : "library",
    });
  }

  return packages;
}

async function isRuntimePackage(
  pkgDir: string,
  dfs: DFSFileHandler,
): Promise<boolean> {
  const requirementSets = [
    ["main.ts", "dev.ts", "DOCKERFILE"],
    [".cli.json"],
  ];

  for (const requirement of requirementSets) {
    let allPresent = true;
    for (const file of requirement) {
      const candidate = join(pkgDir, file);
      const relativePath = relative(dfs.Root, candidate);
      const hasFile = await dfs.HasFile(relativePath);
      if (!hasFile) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) {
      return true;
    }
  }

  return false;
}

function parseJsrSpecifier(
  spec: string,
): { pkgName: string; bucket: string | null } | null {
  const match = /^jsr:(@[^/@]+\/[^/@]+|[^/@]+)(?:@[^/]+)?(?:\/(.*))?$/.exec(
    spec,
  );

  if (!match) return null;

  const pkgName = match[1];
  const bucket = match[2] ?? null;

  return { pkgName, bucket };
}

function resolveLocalPathForSpec(
  specifier: string,
  fromDir: string,
  localByName: Map<string, LocalPackageConfig>,
): string | null {
  const parsed = parseJsrSpecifier(specifier);
  if (!parsed) return null;

  const targetPkg = localByName.get(parsed.pkgName);
  if (!targetPkg) return null;

  const targetImportKey = parsed.bucket
    ? `${parsed.pkgName}/${parsed.bucket}`
    : parsed.pkgName;

  let exportPath: string | null = null;

  for (const [exportKey, exportValue] of Object.entries(targetPkg.exports)) {
    const importKey = exportKeyToImportKey(targetPkg.name, exportKey);
    if (importKey === targetImportKey && typeof exportValue === "string") {
      exportPath = exportValue;
      break;
    }
  }

  if (!exportPath) return null;

  const absExport = isAbsolute(exportPath)
    ? exportPath
    : join(targetPkg.packageDir, exportPath);

  return toRelativeImportPath(fromDir, absExport);
}

async function collectLibraryOverrides(
  lib: LocalPackageConfig,
  localByName: Map<string, LocalPackageConfig>,
  dfs: DFSFileHandler,
  logger: Logger,
): Promise<LibraryOverride[]> {
  const overrides = new Map<string, string>();
  logger.info(
    `[sync-imports] Scanning library ${lib.name} for .deps jsr overrides...`,
  );

  // Normalize paths for comparison: forward slashes, lowercase for Windows, strip leading ./
  const normalizeForComparison = (p: string): string => {
    let normalized = p.replace(/\\/g, "/").toLowerCase();
    // Strip leading ./ if present for consistent comparison
    if (normalized.startsWith("./")) {
      normalized = normalized.substring(2);
    }
    return normalized;
  };

  const libRelPath = relative(dfs.Root, lib.packageDir);
  const normalizedLibPath = normalizeForComparison(libRelPath);

  for await (
    const entry of dfs.Walk({
      match: [/\.deps\.ts$/],
      skip: [/node_modules/, /\.git/],
    })
  ) {
    if (!entry.isFile) continue;

    const normalizedEntryPath = normalizeForComparison(entry.path);

    // Check if this .deps.ts file is within the library's directory
    // Handle empty libPath (library at DFS root) by matching all files
    const isInLib = normalizedLibPath === ""
      ? true
      : normalizedEntryPath === normalizedLibPath ||
        normalizedEntryPath.startsWith(normalizedLibPath + "/");

    if (!isInLib) {
      continue;
    }

    let text: string;
    try {
      const fileInfo = await dfs.GetFileInfo(entry.path);
      if (!fileInfo) continue;
      text = await new Response(fileInfo.Contents).text();
    } catch {
      continue;
    }

    const fullPath = dfs.ResolvePath(entry.path);
    logger.info(`[sync-imports]   inspecting ${fullPath}`);

    const regex = /["'](jsr:[^"']+)["']/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const specifier = match[1];

      if (overrides.has(specifier)) continue;

      const importPath = resolveLocalPathForSpec(
        specifier,
        dirname(lib.configPath),
        localByName,
      );

      if (!importPath) {
        logger.info(
          `[sync-imports]     jsr spec ${specifier} has no local match/resolution; skipping.`,
        );
      }

      if (importPath) {
        overrides.set(specifier, importPath);
        logger.info(
          `[sync-imports]     jsr spec ${specifier} => ${importPath}`,
        );
      }
    }
  }

  return Array.from(overrides.entries()).map(([specifier, importPath]) => ({
    specifier,
    importPath,
  }));
}

async function collectRuntimeOverridesFromLibraries(
  localPackages: LocalPackageConfig[],
  dfs: DFSFileHandler,
): Promise<RuntimeOverride[]> {
  const overrides = new Map<string, string>();

  for (const lib of localPackages) {
    if (lib.kind !== "library") continue;

    let text: string;
    try {
      const relativePath = relative(dfs.Root, lib.configPath);
      const fileInfo = await dfs.GetFileInfo(relativePath);
      if (!fileInfo) continue;
      text = await new Response(fileInfo.Contents).text();
    } catch {
      continue;
    }

    let config: unknown;
    try {
      config = parseJsonc(text);
    } catch {
      continue;
    }

    if (!config || typeof config !== "object" || !("imports" in config)) {
      continue;
    }

    const imports = (config as { imports: unknown }).imports;
    if (!imports || typeof imports !== "object") continue;

    for (
      const [key, value] of Object.entries(imports as Record<string, unknown>)
    ) {
      if (typeof key !== "string" || !key.startsWith("jsr:")) continue;
      if (typeof value !== "string") continue;

      const absPath = isAbsolute(value) ? value : join(lib.packageDir, value);

      if (!overrides.has(key)) {
        overrides.set(key, absPath);
      }
    }
  }

  return Array.from(overrides.entries()).map(([specifier, importPath]) => ({
    specifier,
    importPath,
  }));
}

function findImportsBlockRange(lines: string[]): ImportsBlockRange | null {
  let importsLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"imports"')) {
      importsLine = i;
      break;
    }
  }

  if (importsLine === -1) return null;

  let braceStart = -1;
  for (let i = importsLine; i < lines.length; i++) {
    if (lines[i].includes("{")) {
      braceStart = i;
      break;
    }
  }

  if (braceStart === -1) return null;

  let depth = 0;
  let braceEnd = -1;

  for (let i = braceStart; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") depth++;
      if (ch === "}") depth--;
    }
    if (depth === 0 && (i > braceStart || i === braceStart)) {
      braceEnd = i;
      break;
    }
  }

  if (braceEnd === -1) return null;

  return { braceStart, braceEnd };
}

function exportKeyToImportKey(pkgName: string, exportKey: string): string {
  if (exportKey === ".") return pkgName;
  if (exportKey.startsWith("./")) {
    return `${pkgName}/${exportKey.substring(2)}`;
  }
  return `${pkgName}/${exportKey}`;
}

function toRelativeImportPath(fromDir: string, toFile: string): string {
  const rel = relative(fromDir, toFile).replace(/\\/g, "/");
  if (rel.startsWith(".")) return rel;
  return `./${rel}`;
}

function findMarkerRange(lines: string[]): [number, number] | null {
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(ORIGINAL_BEGIN)) start = i;
    if (lines[i].includes(ORIGINAL_END)) {
      end = i;
      break;
    }
  }
  return start !== -1 && end !== -1 && end > start ? [start, end] : null;
}

function extractOriginalBlock(
  lines: string[],
  range: [number, number],
): string[] {
  const [start, end] = range;
  return lines.slice(start + 1, end).map((l) => uncommentLine(l));
}

function insertOriginalBlockCommented(
  lines: string[],
  originalBlock: string[],
  insertIndex: number,
): void {
  const commented = originalBlock.map(commentLine);
  const block = ["/**", ORIGINAL_BEGIN, ...commented, ORIGINAL_END, "*/"];
  lines.splice(insertIndex, 0, ...block);
}

function generateImportsBlock(
  indent: string,
  importMap: Record<string, string>,
  trailingComma: boolean,
): string[] {
  const jsonLines = JSON.stringify(importMap, null, 2).split("\n");
  const rendered: string[] = [];
  rendered.push(`${indent}"imports": {`);
  for (let i = 1; i < jsonLines.length - 1; i++) {
    rendered.push(`${indent}${jsonLines[i]}`);
  }
  rendered.push(`${indent}}${trailingComma ? "," : ""}`);
  return rendered;
}

async function applyRemoteModeToConfig(
  configPath: string,
  dfs: DFSFileHandler,
  logger: Logger,
): Promise<void> {
  let text: string;
  try {
    const relativePath = relative(dfs.Root, configPath);
    const fileInfo = await dfs.GetFileInfo(relativePath);
    if (!fileInfo) {
      logger.error(`[sync-imports] File not found: ${configPath}`);
      return;
    }
    text = await new Response(fileInfo.Contents).text();
  } catch (error) {
    logger.error(
      `[sync-imports] Failed to read ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  let config: unknown;
  try {
    config = parseJsonc(text);
  } catch (error) {
    logger.error(
      `[sync-imports] Skipping ${configPath}; unable to parse JSONC: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (!config || typeof config !== "object" || !("imports" in config)) {
    logger.warn(
      `[sync-imports] No imports block found in ${configPath}; skipping.`,
    );
    return;
  }

  const imports = (config as { imports: unknown }).imports;
  if (!imports || typeof imports !== "object") {
    logger.warn(
      `[sync-imports] Imports block in ${configPath} is not an object; skipping.`,
    );
    return;
  }

  const lines = text.split(/\r?\n/);
  const range = findImportsBlockRange(lines);

  if (!range) {
    logger.warn(
      `[sync-imports] Unable to locate imports block in ${configPath}; skipping.`,
    );
    return;
  }

  const markerRange = findMarkerRange(lines);
  if (!markerRange) {
    logger.warn(
      `[sync-imports] No original imports marker block found in ${configPath}; skipping restore.`,
    );
    return;
  }

  const originalBlock = extractOriginalBlock(lines, markerRange);

  let markerStart = markerRange[0];
  let markerEnd = markerRange[1];
  if (markerStart > 0 && lines[markerStart - 1].trim() === "/**") {
    markerStart -= 1;
  }
  if (
    markerEnd + 1 < lines.length && lines[markerEnd + 1].trim().startsWith("*/")
  ) {
    markerEnd += 1;
  }
  lines.splice(markerStart, markerEnd - markerStart + 1);

  const refreshedRange = findImportsBlockRange(lines) ?? range;
  lines.splice(
    refreshedRange.braceStart,
    refreshedRange.braceEnd - refreshedRange.braceStart + 1,
  );

  lines.splice(refreshedRange.braceStart, 0, ...originalBlock);

  try {
    const relativePath = relative(dfs.Root, configPath);
    const encoder = new TextEncoder();
    const content = lines.join("\n");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });
    await dfs.WriteFile(relativePath, stream);
  } catch (error) {
    logger.error(
      `[sync-imports] Failed to write ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function applyLocalModeToConfig(
  configPath: string,
  localPackages: LocalPackageConfig[],
  dfs: DFSFileHandler,
  logger: Logger,
): Promise<void> {
  let text: string;
  try {
    const relativePath = relative(dfs.Root, configPath);
    const fileInfo = await dfs.GetFileInfo(relativePath);
    if (!fileInfo) {
      logger.error(`[sync-imports] File not found: ${configPath}`);
      return;
    }
    text = await new Response(fileInfo.Contents).text();
  } catch (error) {
    logger.error(
      `[sync-imports] Failed to read ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  let config: unknown;
  try {
    config = parseJsonc(text);
  } catch (error) {
    logger.error(
      `[sync-imports] Skipping ${configPath}; unable to parse JSONC: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (!config || typeof config !== "object" || !("imports" in config)) {
    logger.warn(
      `[sync-imports] No imports block found in ${configPath}; skipping.`,
    );
    return;
  }

  const imports = (config as { imports: unknown }).imports;
  if (!imports || typeof imports !== "object") {
    logger.warn(
      `[sync-imports] Imports block in ${configPath} is not an object; skipping.`,
    );
    return;
  }

  const lines = text.split(/\r?\n/);
  let range = findImportsBlockRange(lines);

  if (!range) {
    logger.warn(
      `[sync-imports] Unable to locate imports block in ${configPath}; skipping.`,
    );
    return;
  }

  const indent = lines[range.braceStart].match(/^(\s*)/)?.[1] ?? "";
  const trailingComma = lines[range.braceEnd].trim().endsWith(",");

  const markerRange = findMarkerRange(lines);
  if (markerRange) {
    let mStart = markerRange[0];
    let mEnd = markerRange[1];
    if (mStart > 0 && lines[mStart - 1].trim() === "/**") {
      mStart -= 1;
    }
    if (mEnd + 1 < lines.length && lines[mEnd + 1].trim().startsWith("*/")) {
      mEnd += 1;
    }
    lines.splice(mStart, mEnd - mStart + 1);
    range = findImportsBlockRange(lines) ?? range;
  }

  const currentPkg = localPackages.find((p) => p.configPath === configPath);
  const localByName = new Map<string, LocalPackageConfig>();
  for (const pkg of localPackages) {
    localByName.set(pkg.name, pkg);
  }
  const localRootKeys = new Set(localPackages.map((p) => p.name));

  const configDir = dirname(configPath);

  const runtimeOverrides = currentPkg && currentPkg.kind === "runtime"
    ? await collectRuntimeOverridesFromLibraries(localPackages, dfs)
    : [];

  const originalEntries: Record<string, string> = {};
  for (const [k, v] of Object.entries(imports as Record<string, unknown>)) {
    if (typeof v === "string") {
      originalEntries[k] = v;
    }
  }

  const newImports: Record<string, string> = {};

  for (const [key, value] of Object.entries(originalEntries)) {
    if (localRootKeys.has(key)) {
      continue;
    }
    const pkg = localByName.get(key);
    if (
      pkg && value.startsWith("jsr:") && typeof pkg.exports["."] === "string"
    ) {
      const relPath = toRelativeImportPath(
        configDir,
        join(pkg.packageDir, pkg.exports["."]),
      );
      newImports[key] = relPath;
    } else {
      newImports[key] = value;
    }
  }

  for (const pkg of localPackages) {
    const originalVal = originalEntries[pkg.name];
    if (!originalVal || !originalVal.startsWith("jsr:")) continue;

    for (const [exportKey, exportPath] of Object.entries(pkg.exports)) {
      if (typeof exportPath !== "string") continue;
      const bucketKey = exportKeyToImportKey(pkg.name, exportKey);
      const rel = toRelativeImportPath(
        configDir,
        join(pkg.packageDir, exportPath),
      );
      newImports[bucketKey] = rel;
    }
  }

  if (currentPkg && currentPkg.kind === "library") {
    try {
      const overrides = await collectLibraryOverrides(
        currentPkg,
        localByName,
        dfs,
        logger,
      );
      for (const override of overrides) {
        newImports[override.specifier] = override.importPath;
      }
    } catch (error) {
      logger.warn(
        `[sync-imports] Failed to collect library overrides for ${configPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (currentPkg && currentPkg.kind === "runtime" && runtimeOverrides.length) {
    for (const override of runtimeOverrides) {
      const relImportPath = toRelativeImportPath(
        configDir,
        override.importPath,
      );
      newImports[override.specifier] = relImportPath;
    }
  }

  const originalBlock = lines.slice(range.braceStart, range.braceEnd + 1);

  const rendered = generateImportsBlock(indent, newImports, trailingComma);
  lines.splice(
    range.braceStart,
    range.braceEnd - range.braceStart + 1,
    ...rendered,
  );

  insertOriginalBlockCommented(
    lines,
    originalBlock,
    range.braceStart + rendered.length,
  );

  try {
    const relativePath = relative(dfs.Root, configPath);
    const encoder = new TextEncoder();
    const content = lines.join("\n");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });
    await dfs.WriteFile(relativePath, stream);
  } catch (error) {
    logger.error(
      `[sync-imports] Failed to write ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function resolveTargetConfigs(
  target: string,
  localPackages: LocalPackageConfig[],
  resolver: ProjectResolver,
  logger: Logger,
): Promise<string[]> {
  const targets: string[] = [];

  // Use the ProjectResolver to resolve targets
  const projects = await resolver.Resolve(target);

  if (projects.length > 0) {
    for (const project of projects) {
      if (project.configPath.endsWith(".jsonc")) {
        targets.push(project.configPath);
      }
    }
    return targets;
  }

  // Fallback: check if it's a known package name
  const pkg = localPackages.find((p) => p.name === target);
  if (pkg) {
    targets.push(pkg.configPath);
  } else {
    logger.error(
      `[sync-imports] Target '${target}' is neither a path nor a known local package name.`,
    );
  }

  return targets;
}
