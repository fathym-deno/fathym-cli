/**
 * UpgradeDeps command - upgrade dependencies in deno.jsonc and .deps.ts files.
 *
 * The projects:[projectRef]:deps:upgrade command provides comprehensive dependency upgrading
 * for both import maps and direct specifier files. It supports multiple modes,
 * channel targeting, and package filtering.
 *
 * ## Features
 *
 * - Upgrades both `deno.jsonc` imports and `**\/*.deps.ts` direct specifiers
 * - Channel targeting (e.g., `--channel=integration`)
 * - Mode filtering (`all`, `jsr`, `npm`, `local-only`)
 * - Package filtering with wildcards (`--package=@fathym/eac*`)
 * - Interactive mode for selective upgrades
 * - Dry-run mode to preview changes
 *
 * ## Usage
 *
 * ```bash
 * # Upgrade all deps to latest production versions
 * ftm projects @fathym/cli deps upgrade
 *
 * # Upgrade to integration channel
 * ftm projects @fathym/cli deps upgrade --channel=integration
 *
 * # Upgrade only JSR packages
 * ftm projects @fathym/cli deps upgrade --mode=jsr
 *
 * # Upgrade specific packages
 * ftm projects @fathym/cli deps upgrade --package=@fathym/eac*
 *
 * # Preview changes without applying
 * ftm projects @fathym/cli deps upgrade --dry-run
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { dirname, relative } from '@std/path';
import { parse as parseJsonc } from '@std/jsonc';
import { DFSProjectResolver } from '../../../../src/projects/ProjectResolver.ts';
import { DepsFileParser, type DepsReference } from '../../../../src/deps/DepsFileParser.ts';
import { VersionComparator } from '../../../../src/deps/VersionComparator.ts';
import { VersionResolver } from '../../../../src/deps/VersionResolver.ts';

/** Upgrade mode options */
type UpgradeMode = 'all' | 'jsr' | 'npm' | 'local-only';

/**
 * Segments schema for the deps:upgrade command.
 */
const UpgradeSegmentsSchema = z.object({
  projectRef: z.string().describe('Project name, path to deno.json(c), or directory'),
});

type UpgradeSegments = z.infer<typeof UpgradeSegmentsSchema>;

/**
 * Zod schema for deps:upgrade command flags.
 */
const UpgradeFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would be upgraded without making changes',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed upgrade information',
  ),
  'mode': z
    .enum(['all', 'jsr', 'npm', 'local-only'])
    .optional()
    .describe('Upgrade mode: all, jsr, npm, or local-only'),
  'channel': z.string().optional().describe(
    'Target feature channel (e.g., integration, hmis)',
  ),
  'package': z.string().optional().describe(
    'Filter to specific package(s), supports wildcards (e.g., @fathym/eac*)',
  ),
  'interactive': z.boolean().optional().describe(
    'Prompt before each upgrade',
  ),
});

/**
 * Zod schema for deps:upgrade command positional arguments.
 */
const UpgradeArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the deps:upgrade command.
 */
class UpgradeParams extends CommandParams<
  z.infer<typeof UpgradeArgsSchema>,
  z.infer<typeof UpgradeFlagsSchema>,
  UpgradeSegments
> {
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get Mode(): UpgradeMode {
    return this.Flag('mode') ?? 'all';
  }

  get Channel(): string | undefined {
    return this.Flag('channel');
  }

  get PackageFilter(): string | undefined {
    return this.Flag('package');
  }

  get Interactive(): boolean {
    return this.Flag('interactive') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

/**
 * Represents a pending upgrade.
 */
interface PendingUpgrade {
  packageName: string;
  registry: 'jsr' | 'npm';
  currentVersion: string;
  newVersion: string;
  source: 'import-map' | 'deps-file';
  filePath: string;
}

export default Command(
  'projects:[projectRef]:deps:upgrade',
  'Upgrade dependencies in deno.jsonc and .deps.ts files.',
)
  .Args(UpgradeArgsSchema)
  .Flags(UpgradeFlagsSchema)
  .Segments(UpgradeSegmentsSchema)
  .Params(UpgradeParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
      DFS: dfs as unknown as DFSFileHandler,
      DepsParser: new DepsFileParser(),
      VersionComparator: new VersionComparator(),
      VersionResolver: new VersionResolver(),
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    const { ProjectResolver, DFS, DepsParser, VersionComparator, VersionResolver } = Services;

    if (!Params.ProjectRef) {
      Log.Error('No project reference provided.');
      return 1;
    }

    try {
      // Resolve target projects
      const projects = await ProjectResolver.Resolve(Params.ProjectRef);

      if (projects.length === 0) {
        Log.Error(`No projects found matching '${Params.ProjectRef}'.`);
        return 1;
      }

      if (Params.Verbose) {
        Log.Info(`Found ${projects.length} project(s) to upgrade.`);
      }

      // For local-only mode, get all local package names
      let localPackageNames: Set<string> | undefined;
      if (Params.Mode === 'local-only') {
        const allProjects = await ProjectResolver.Resolve('**');
        localPackageNames = new Set(
          allProjects.filter((p) => p.name).map((p) => p.name!),
        );
        if (Params.Verbose) {
          Log.Info(`Local-only mode: targeting ${localPackageNames.size} local packages`);
        }
      }

      let totalUpgrades = 0;
      let totalSkipped = 0;

      for (const project of projects) {
        const projectName = project.name ?? project.dir;

        if (Params.Verbose) {
          Log.Info(`\nProcessing ${projectName}...`);
        }

        const pendingUpgrades: PendingUpgrade[] = [];

        // 1. Process deno.jsonc imports
        const importMapUpgrades = await collectImportMapUpgrades(
          project.configPath,
          DFS,
          DepsParser,
          VersionComparator,
          VersionResolver,
          Params.Mode,
          Params.Channel,
          Params.PackageFilter,
          localPackageNames,
          Log,
          Params.Verbose,
        );
        pendingUpgrades.push(...importMapUpgrades);

        // 2. Find and process .deps.ts files
        const projectDir = dirname(project.configPath);
        const depsFileUpgrades = await collectDepsFileUpgrades(
          projectDir,
          DFS,
          DepsParser,
          VersionComparator,
          VersionResolver,
          Params.Mode,
          Params.Channel,
          Params.PackageFilter,
          localPackageNames,
          Log,
          Params.Verbose,
        );
        pendingUpgrades.push(...depsFileUpgrades);

        if (pendingUpgrades.length === 0) {
          Log.Info(`${projectName}: No upgrades available.`);
          continue;
        }

        // Display upgrades
        Log.Info(`\n${projectName}: ${pendingUpgrades.length} upgrade(s) available`);

        for (const upgrade of pendingUpgrades) {
          const sourceLabel = upgrade.source === 'import-map' ? 'import' : '.deps.ts';
          Log.Info(
            `  ${upgrade.packageName}: ${upgrade.currentVersion} → ${upgrade.newVersion} (${sourceLabel})`,
          );
        }

        if (Params.DryRun) {
          Log.Info(`[DRY RUN] Would apply ${pendingUpgrades.length} upgrade(s)`);
          totalUpgrades += pendingUpgrades.length;
          continue;
        }

        // Apply upgrades (group by file for efficiency)
        const upgradesByFile = groupByFile(pendingUpgrades);

        for (const [filePath, fileUpgrades] of upgradesByFile) {
          // Handle interactive mode
          if (Params.Interactive) {
            for (const upgrade of fileUpgrades) {
              const answer = prompt(
                `Upgrade ${upgrade.packageName} to ${upgrade.newVersion}? [y/N]`,
              );
              if (answer?.toLowerCase() !== 'y') {
                totalSkipped++;
                continue;
              }
            }
          }

          const isImportMap = filePath.endsWith('.jsonc') || filePath.endsWith('.json');

          if (isImportMap) {
            await applyImportMapUpgrades(filePath, fileUpgrades, DFS);
          } else {
            await applyDepsFileUpgrades(filePath, fileUpgrades, DFS, DepsParser);
          }

          totalUpgrades += fileUpgrades.length;
        }
      }

      // Summary
      if (Params.DryRun) {
        Log.Info(`\n[DRY RUN] Total: ${totalUpgrades} upgrade(s) would be applied`);
      } else {
        Log.Info(`\nTotal: ${totalUpgrades} upgrade(s) applied`);
        if (totalSkipped > 0) {
          Log.Info(`Skipped: ${totalSkipped} upgrade(s)`);
        }
      }

      return 0;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });

/**
 * Collect upgrades from import map (deno.jsonc).
 */
async function collectImportMapUpgrades(
  configPath: string,
  dfs: DFSFileHandler,
  depsParser: DepsFileParser,
  versionComparator: VersionComparator,
  versionResolver: VersionResolver,
  mode: UpgradeMode,
  channel: string | undefined,
  packageFilter: string | undefined,
  localPackageNames: Set<string> | undefined,
  log: { Info: (msg: string) => void; Error: (msg: string) => void },
  verbose: boolean,
): Promise<PendingUpgrade[]> {
  const upgrades: PendingUpgrade[] = [];

  // Read config
  let text: string;
  try {
    const relativePath = relative(dfs.Root, configPath);
    const fileInfo = await dfs.GetFileInfo(relativePath);
    if (!fileInfo) return upgrades;
    text = await new Response(fileInfo.Contents).text();
  } catch {
    return upgrades;
  }

  let config: unknown;
  try {
    config = parseJsonc(text);
  } catch {
    return upgrades;
  }

  if (!config || typeof config !== 'object' || !('imports' in config)) {
    return upgrades;
  }

  const imports = (config as { imports: unknown }).imports;
  if (!imports || typeof imports !== 'object') {
    return upgrades;
  }

  // Process each import
  for (const [_key, value] of Object.entries(imports as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;

    const parsed = depsParser.parseSpecifier(value);
    if (!parsed) continue;

    // Apply mode filter
    if (mode === 'jsr' && parsed.registry !== 'jsr') continue;
    if (mode === 'npm' && parsed.registry !== 'npm') continue;
    if (mode === 'local-only' && localPackageNames && !localPackageNames.has(parsed.fullName)) {
      continue;
    }

    // Apply package filter
    if (packageFilter) {
      const refs = [{ ...parsed, line: 0, column: 0 } as DepsReference];
      const filtered = depsParser.filterByPattern(refs, packageFilter);
      if (filtered.length === 0) continue;
    }

    // Get latest version
    try {
      const latestVersion = await versionResolver.getLatest(
        parsed.registry,
        parsed.fullName,
        channel,
      );

      if (!latestVersion) {
        if (verbose) {
          const channelLabel = channel ? ` (${channel})` : '';
          log.Info(`  ${parsed.fullName}: No version found${channelLabel}`);
        }
        continue;
      }

      // Check if upgrade is beneficial
      if (!versionComparator.isNewer(parsed.version, latestVersion)) {
        if (verbose) {
          log.Info(`  ${parsed.fullName}: Already at latest (${parsed.version})`);
        }
        continue;
      }

      upgrades.push({
        packageName: parsed.fullName,
        registry: parsed.registry,
        currentVersion: parsed.version,
        newVersion: latestVersion,
        source: 'import-map',
        filePath: configPath,
      });
    } catch (error) {
      if (verbose) {
        log.Info(
          `  ${parsed.fullName}: Failed to fetch versions - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return upgrades;
}

/**
 * Collect upgrades from .deps.ts files.
 */
async function collectDepsFileUpgrades(
  projectDir: string,
  dfs: DFSFileHandler,
  depsParser: DepsFileParser,
  versionComparator: VersionComparator,
  versionResolver: VersionResolver,
  mode: UpgradeMode,
  channel: string | undefined,
  packageFilter: string | undefined,
  localPackageNames: Set<string> | undefined,
  log: { Info: (msg: string) => void; Error: (msg: string) => void },
  verbose: boolean,
): Promise<PendingUpgrade[]> {
  const upgrades: PendingUpgrade[] = [];
  const processedPackages = new Map<string, string>(); // Track to avoid duplicate lookups

  const relProjectDir = relative(dfs.Root, projectDir);

  // Find all .deps.ts files
  for await (
    const entry of dfs.Walk({
      match: [/\.deps\.ts$/],
      skip: [/node_modules/, /\.git/, /cov/],
    })
  ) {
    if (!entry.isFile) continue;

    // Check if this file is within the project directory
    const entryPath = entry.path.replace(/\\/g, '/');
    const projPath = relProjectDir.replace(/\\/g, '/');
    if (!entryPath.startsWith(projPath) && !entryPath.startsWith(projPath + '/')) {
      continue;
    }

    const fullPath = dfs.ResolvePath(entry.path);

    // Read file
    let text: string;
    try {
      const fileInfo = await dfs.GetFileInfo(entry.path);
      if (!fileInfo) continue;
      text = await new Response(fileInfo.Contents).text();
    } catch {
      continue;
    }

    // Parse dependencies
    const refs = depsParser.parse(text);
    const uniquePackages = depsParser.getUniquePackages(refs);

    for (const [packageName, ref] of uniquePackages) {
      // Skip if we've already processed this package
      if (processedPackages.has(packageName)) {
        const cachedVersion = processedPackages.get(packageName)!;
        if (cachedVersion !== ref.version) {
          // Version mismatch in different files - still add upgrade
          if (versionComparator.isNewer(ref.version, cachedVersion)) {
            upgrades.push({
              packageName,
              registry: ref.registry,
              currentVersion: ref.version,
              newVersion: cachedVersion,
              source: 'deps-file',
              filePath: fullPath,
            });
          }
        }
        continue;
      }

      // Apply mode filter
      if (mode === 'jsr' && ref.registry !== 'jsr') continue;
      if (mode === 'npm' && ref.registry !== 'npm') continue;
      if (mode === 'local-only' && localPackageNames && !localPackageNames.has(packageName)) {
        continue;
      }

      // Apply package filter
      if (packageFilter) {
        const filtered = depsParser.filterByPattern([ref], packageFilter);
        if (filtered.length === 0) continue;
      }

      // Get latest version
      try {
        const latestVersion = await versionResolver.getLatest(
          ref.registry,
          packageName,
          channel,
        );

        if (!latestVersion) {
          processedPackages.set(packageName, ref.version);
          if (verbose) {
            const channelLabel = channel ? ` (${channel})` : '';
            log.Info(`  ${packageName}: No version found${channelLabel}`);
          }
          continue;
        }

        processedPackages.set(packageName, latestVersion);

        // Check if upgrade is beneficial
        if (!versionComparator.isNewer(ref.version, latestVersion)) {
          if (verbose) {
            log.Info(`  ${packageName}: Already at latest (${ref.version})`);
          }
          continue;
        }

        upgrades.push({
          packageName,
          registry: ref.registry,
          currentVersion: ref.version,
          newVersion: latestVersion,
          source: 'deps-file',
          filePath: fullPath,
        });
      } catch (error) {
        processedPackages.set(packageName, ref.version);
        if (verbose) {
          log.Info(
            `  ${packageName}: Failed to fetch versions - ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  return upgrades;
}

/**
 * Group upgrades by file path.
 */
function groupByFile(upgrades: PendingUpgrade[]): Map<string, PendingUpgrade[]> {
  const grouped = new Map<string, PendingUpgrade[]>();

  for (const upgrade of upgrades) {
    if (!grouped.has(upgrade.filePath)) {
      grouped.set(upgrade.filePath, []);
    }
    grouped.get(upgrade.filePath)!.push(upgrade);
  }

  return grouped;
}

/**
 * Apply upgrades to import map (deno.jsonc).
 */
async function applyImportMapUpgrades(
  configPath: string,
  upgrades: PendingUpgrade[],
  dfs: DFSFileHandler,
): Promise<void> {
  // Read current file
  const relativePath = relative(dfs.Root, configPath);
  const fileInfo = await dfs.GetFileInfo(relativePath);
  if (!fileInfo) return;

  let text = await new Response(fileInfo.Contents).text();

  // Apply each upgrade
  for (const upgrade of upgrades) {
    // Replace version in the import value
    const escapedName = upgrade.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(["'])(jsr|npm):${escapedName}@${escapeRegex(upgrade.currentVersion)}(/[^"']*)?\\1`,
      'g',
    );

    text = text.replace(regex, (_match, quote, registry, subpath) => {
      const newSubpath = subpath || '';
      return `${quote}${registry}:${upgrade.packageName}@${upgrade.newVersion}${newSubpath}${quote}`;
    });
  }

  // Write back
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  await dfs.WriteFile(relativePath, stream);
}

/**
 * Apply upgrades to a .deps.ts file.
 */
async function applyDepsFileUpgrades(
  filePath: string,
  upgrades: PendingUpgrade[],
  dfs: DFSFileHandler,
  depsParser: DepsFileParser,
): Promise<void> {
  // Read current file
  const relativePath = relative(dfs.Root, filePath);
  const fileInfo = await dfs.GetFileInfo(relativePath);
  if (!fileInfo) return;

  let text = await new Response(fileInfo.Contents).text();

  // Build update map
  const updates = new Map<string, string>();
  for (const upgrade of upgrades) {
    updates.set(upgrade.packageName, upgrade.newVersion);
  }

  // Use parser to apply updates
  text = depsParser.update(text, updates);

  // Write back
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  await dfs.WriteFile(relativePath, stream);
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
