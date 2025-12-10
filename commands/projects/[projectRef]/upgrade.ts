/**
 * Upgrade command - upgrade all references to a package across the workspace.
 *
 * The projects:[projectRef]:upgrade command finds all references to a package in the workspace
 * and upgrades them to a specified version. This is useful for cascading version
 * updates after publishing a new package version.
 *
 * ## Usage
 *
 * ```bash
 * # Upgrade all references to a package
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release
 *
 * # Preview changes without writing (dry-run)
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --dry-run
 *
 * # Filter by source type
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --filter=config
 *
 * # Filter by target project (only upgrade refs in @fathym/eac)
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --filter=@fathym/eac
 *
 * # Combine source type and project filters
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --filter=config,@fathym/eac
 *
 * # Filter by multiple projects (comma-separated)
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --filter=@fathym/eac,@fathym/common
 *
 * # Output as JSON for programmatic consumption
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --json
 * ```
 *
 * ## Filter Values
 *
 * The --filter flag accepts comma-separated values:
 * - Source types: config, deps, template, docs, other
 * - Project refs: package names (@scope/pkg), paths (./path), directories
 *
 * ## File Types
 *
 * The command searches and updates references in:
 * - `deno.json(c)` - Project config files (source: config)
 * - `*.deps.ts` - Dependency files (source: deps)
 * - `*.hbs` - Handlebars templates (source: template)
 * - `*.md/*.mdx` - Documentation files (source: docs)
 * - `*.ts/*.tsx` - Source files with inline imports (source: other)
 *
 * @example Upgrade all references
 * ```bash
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release
 * ```
 *
 * @example Dry-run to preview changes
 * ```bash
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --dry-run
 * ```
 *
 * @example Upgrade only config files
 * ```bash
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --filter=config
 * ```
 *
 * @example Upgrade only in specific project
 * ```bash
 * ftm projects @fathym/dfs upgrade 0.0.81-dfs-release --filter=@fathym/eac
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../../src/projects/ProjectResolver.ts';
import {
  type PackageReference,
  upgradePackageReferences,
  type UpgradeResult,
} from '../../../src/projects/PackageReferences.ts';

/**
 * Valid source types for filtering.
 */
const SOURCE_TYPES = ['config', 'deps', 'template', 'docs', 'other', 'all'] as const;
type SourceFilter = (typeof SOURCE_TYPES)[number];

/**
 * Check if a filter value is a source type.
 */
function isSourceType(value: string): value is SourceFilter {
  return (SOURCE_TYPES as readonly string[]).includes(value);
}

/**
 * Parsed filter result containing source types and project refs.
 */
interface ParsedFilters {
  sourceTypes: SourceFilter[];
  projectRefs: string[];
}

/**
 * Parse comma-separated filter values into source types and project refs.
 *
 * Filter values are classified as:
 * - Source types: config, deps, template, docs, other, all
 * - Project refs: everything else (package names, paths, directories)
 *
 * @example
 * parseFilters('config,deps') => { sourceTypes: ['config', 'deps'], projectRefs: [] }
 * parseFilters('@fathym/eac') => { sourceTypes: ['all'], projectRefs: ['@fathym/eac'] }
 * parseFilters('config,@fathym/eac') => { sourceTypes: ['config'], projectRefs: ['@fathym/eac'] }
 */
function parseFilters(filter?: string): ParsedFilters {
  if (!filter) {
    return { sourceTypes: ['all'], projectRefs: [] };
  }

  const parts = filter.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
  const sourceTypes: SourceFilter[] = [];
  const projectRefs: string[] = [];

  for (const part of parts) {
    if (isSourceType(part)) {
      sourceTypes.push(part);
    } else {
      projectRefs.push(part);
    }
  }

  // Default to 'all' source types if none specified
  if (sourceTypes.length === 0) {
    sourceTypes.push('all');
  }

  return { sourceTypes, projectRefs };
}

/**
 * Segments schema for the upgrade command.
 */
const UpgradeSegmentsSchema = z.object({
  projectRef: z.string().describe('Package name to upgrade references for'),
});

type UpgradeSegments = z.infer<typeof UpgradeSegmentsSchema>;

/**
 * Zod schema for upgrade command flags.
 */
const UpgradeFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe('Preview changes without writing'),
  filter: z
    .string()
    .optional()
    .describe('Comma-separated filters: source types (config, deps, template, docs, other) and/or project refs (@scope/pkg, ./path)'),
  json: z.boolean().optional().describe('Output as JSON for programmatic consumption'),
});

/**
 * Zod schema for upgrade command positional arguments.
 */
const UpgradeArgsSchema = z.tuple([
  z.string().describe('Target version to upgrade to').meta({ argName: 'version' }),
]);

/**
 * Typed parameter accessor for the upgrade command.
 */
class UpgradeCommandParams extends CommandParams<
  z.infer<typeof UpgradeArgsSchema>,
  z.infer<typeof UpgradeFlagsSchema>,
  UpgradeSegments
> {
  /** Project reference from dynamic segment */
  get ProjectRef(): string {
    return this.Segment('projectRef') ?? '';
  }

  /** Target version from positional argument */
  get Version(): string {
    return this.Arg(0)!;
  }

  /** Raw filter string (comma-separated source types and/or project refs) */
  get Filter(): string | undefined {
    return this.Flag('filter');
  }

  /** Whether to output as JSON */
  get Json(): boolean {
    return this.Flag('json') ?? false;
  }
}

/**
 * Output structure for the upgrade command.
 */
interface UpgradeOutput {
  packageName: string;
  targetVersion: string;
  dryRun: boolean;
  filter: {
    sourceTypes: SourceFilter[];
    projectRefs: string[];
  };
  results: UpgradeResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
  };
}

export default Command(
  'projects:[projectRef]:upgrade',
  'Upgrade all references to a package across the workspace.',
)
  .Args(UpgradeArgsSchema)
  .Flags(UpgradeFlagsSchema)
  .Segments(UpgradeSegmentsSchema)
  .Params(UpgradeCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    const { ProjectResolver } = Services;

    if (!Params.ProjectRef) {
      Log.Error('No project reference provided.');
      return 1;
    }

    try {
      // Resolve the package to get its name
      const projects = await ProjectResolver.Resolve(Params.ProjectRef);

      if (projects.length === 0) {
        Log.Error(`No projects found matching '${Params.ProjectRef}'.`);
        return 1;
      }

      if (projects.length > 1) {
        Log.Error(
          `Found ${projects.length} projects. Please specify a single project:\n` +
            projects.map((p) => `  - ${p.name ?? p.dir}`).join('\n'),
        );
        return 1;
      }

      const project = projects[0];
      const packageName = project.name;

      if (!packageName) {
        Log.Error('Project does not have a package name defined in deno.json(c).');
        return 1;
      }

      // Parse filter into source types and project refs
      const parsedFilters = parseFilters(Params.Filter);

      // Convert source types for the API
      // 'all' is special - it means no source filter
      const sourceFilterForApi = parsedFilters.sourceTypes.includes('all')
        ? 'all' as const
        : parsedFilters.sourceTypes.filter((t): t is PackageReference['source'] => t !== 'all');

      // Perform the upgrade
      const results = await upgradePackageReferences(packageName, ProjectResolver, {
        version: Params.Version,
        dryRun: Params.DryRun,
        sourceFilter: sourceFilterForApi,
        projectFilter: parsedFilters.projectRefs,
      });

      // Calculate summary
      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      // Build output
      const output: UpgradeOutput = {
        packageName,
        targetVersion: Params.Version,
        dryRun: Params.DryRun,
        filter: parsedFilters,
        results,
        summary: {
          total: results.length,
          success: successCount,
          failed: failedCount,
        },
      };

      if (Params.Json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        // Human-readable output
        const modeLabel = Params.DryRun ? ' (dry-run)' : '';
        Log.Info(`📦 Upgrading ${packageName} to ${Params.Version}${modeLabel}`);
        Log.Info('');

        if (results.length === 0) {
          Log.Info('No references found in workspace.');
          return 0;
        }

        Log.Info(`Found ${results.length} reference(s) in workspace:`);
        Log.Info('');

        // Group results by file for cleaner output
        const resultsByFile = new Map<string, UpgradeResult[]>();
        for (const result of results) {
          const existing = resultsByFile.get(result.file) || [];
          existing.push(result);
          resultsByFile.set(result.file, existing);
        }

        for (const [file, fileResults] of resultsByFile) {
          const firstResult = fileResults[0];
          const status = firstResult.success ? '✓' : '✗';
          const sourceLabel = getSourceLabel(firstResult.source);

          Log.Info(`${status} ${file}:${firstResult.line}${sourceLabel}`);
          Log.Info(`  @${firstResult.oldVersion} → @${firstResult.newVersion}`);

          if (!firstResult.success && firstResult.error) {
            Log.Error(`  Error: ${firstResult.error}`);
          }
        }

        Log.Info('');

        if (Params.DryRun) {
          Log.Info(`📋 Dry-run complete: ${successCount} file(s) would be updated`);
        } else if (failedCount > 0) {
          Log.Warn(`⚠️  Upgraded ${successCount} file(s), ${failedCount} failed`);
        } else {
          Log.Success(`✅ Upgraded ${successCount} file(s) successfully`);
        }
      }

      return failedCount > 0 ? 1 : 0;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });

/**
 * Get a label for the source type.
 */
function getSourceLabel(source: PackageReference['source']): string {
  const labels: Record<PackageReference['source'], string> = {
    config: '',
    deps: ' [.deps.ts]',
    template: ' [template]',
    docs: ' [docs]',
    other: ' [other]',
  };
  return labels[source];
}
