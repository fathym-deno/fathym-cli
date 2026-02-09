/**
 * Cascade scheduler - discovers dependency graph and sorts into parallel layers.
 *
 * The CascadeScheduler is the core engine for cascade automation. It:
 * 1. Discovers the full dependency graph starting from a root package
 * 2. Detects cycles (which would make the cascade impossible)
 * 3. Topologically sorts packages into layers for parallel execution
 *
 * ## How Discovery Works
 *
 * Starting from the root package, the scheduler performs a BFS traversal:
 * 1. Find all packages that reference the root (via `findPackageReferences`)
 * 2. For each referencing package, repeat the discovery
 * 3. Build a graph of package → dependents relationships
 * 4. Stop when maxDepth is reached or no new packages are found
 *
 * ## How Layering Works
 *
 * After discovery, packages are sorted into layers:
 * - Layer 0: Root package only (no dependencies in this cascade)
 * - Layer N: Packages whose ALL dependencies are in layers 0..N-1
 *
 * This ensures that when we release layer N, all its dependencies have
 * already been released. Packages in the same layer are independent and
 * can be released in parallel.
 *
 * @example Build a cascade schedule
 * ```typescript
 * const scheduler = new CascadeScheduler(resolver);
 * const schedule = await scheduler.buildSchedule('@fathym/dfs');
 *
 * for (const layer of schedule.layers) {
 *   console.log(`Layer ${layer.index}:`, layer.packages.map(p => p.name));
 * }
 * ```
 *
 * @module
 */

import type { DFSProjectResolver } from '../projects/ProjectResolver.ts';
import { findPackageReferences, type PackageReference } from '../projects/PackageReferences.ts';
import type {
  CascadeGraphNode,
  CascadeLayer,
  CascadeLayerPackage,
  CascadeSchedule,
  CascadeScheduleOptions,
  CycleDetectionResult,
} from './CascadeScheduleTypes.ts';

/**
 * Scheduler for building cascade release schedules.
 *
 * Takes a root package and discovers all packages that depend on it,
 * transitively. Then sorts them into layers for parallel execution.
 */
export class CascadeScheduler {
  /**
   * Create a new cascade scheduler.
   *
   * @param resolver - Project resolver for discovering packages
   */
  constructor(private readonly resolver: DFSProjectResolver) {}

  /**
   * Build a cascade schedule starting from a root package.
   *
   * Discovers all packages that depend on the root (transitively),
   * detects cycles, and sorts into parallel layers.
   *
   * @param rootPackage - Package name or path to start from
   * @param options - Discovery options
   * @returns Complete cascade schedule
   * @throws Error if root package not found or cycle detected
   *
   * @example Basic usage
   * ```typescript
   * const schedule = await scheduler.buildSchedule('@fathym/dfs');
   * ```
   *
   * @example With depth limit
   * ```typescript
   * const schedule = await scheduler.buildSchedule('@fathym/dfs', { maxDepth: 2 });
   * ```
   */
  async buildSchedule(
    rootPackage: string,
    options?: CascadeScheduleOptions,
  ): Promise<CascadeSchedule> {
    // 1. Resolve the root package
    const rootProjects = await this.resolver.Resolve(rootPackage);

    if (rootProjects.length === 0) {
      throw new Error(`Root package not found: ${rootPackage}`);
    }

    if (rootProjects.length > 1) {
      throw new Error(
        `Multiple projects match '${rootPackage}'. Please specify a single project:\n` +
          rootProjects.map((p) => `  - ${p.name ?? p.dir}`).join('\n'),
      );
    }

    const rootProject = rootProjects[0];
    const rootName = rootProject.name;

    if (!rootName) {
      throw new Error(
        `Root project does not have a package name defined in deno.json(c)`,
      );
    }

    // Get channel from branch
    const channel = this.extractChannel(await this.getGitBranch(rootProject.dir));

    // 2. Discover the dependency graph via BFS
    const graph = await this.discoverGraph(rootName, options);

    // 3. Detect cycles
    const cycleResult = this.detectCycles(graph);
    if (cycleResult.hasCycle && cycleResult.cyclePath) {
      throw new Error(
        `Cycle detected in dependency graph: ${cycleResult.cyclePath.join(' → ')}`,
      );
    }

    // 4. Topological sort into layers
    const layers = this.topologicalSort(graph, rootName);

    // 5. Collect skipped packages
    const skipped: string[] = [];
    for (const node of graph.values()) {
      if (!options?.includeWithoutBuild && !node.package.hasBuild) {
        skipped.push(node.name);
      }
    }

    // 6. Build the schedule
    return {
      root: rootName,
      channel,
      layers,
      totalPackages: layers.reduce((sum, l) => sum + l.packages.length, 0),
      skipped,
      generatedAt: new Date().toISOString(),
      maxDepth: options?.maxDepth,
    };
  }

  /**
   * Discover dependency graph via BFS from root.
   *
   * For each package, finds all packages that reference it (via referencedBy).
   * Those referencing packages are the "dependents" - they depend on the
   * current package and must be released after it.
   *
   * @param rootName - Root package name to start from
   * @param options - Discovery options
   * @returns Map of package name to graph node
   */
  private async discoverGraph(
    rootName: string,
    options?: CascadeScheduleOptions,
  ): Promise<Map<string, CascadeGraphNode>> {
    const graph = new Map<string, CascadeGraphNode>();
    const visited = new Set<string>();

    // BFS queue: [packageName, depth]
    const queue: Array<[string, number]> = [[rootName, 0]];

    // Default source filter: only config and deps (not docs/templates)
    const sourceFilter = options?.sourceFilter ?? ['config', 'deps'];

    while (queue.length > 0) {
      const [currentName, depth] = queue.shift()!;

      // Skip if already processed
      if (visited.has(currentName)) continue;
      visited.add(currentName);

      // Check depth limit
      if (options?.maxDepth !== undefined && depth > options.maxDepth) {
        continue;
      }

      // Resolve the package
      const projects = await this.resolver.Resolve(currentName);
      if (projects.length !== 1) continue;

      const project = projects[0];
      if (!project.name) continue;

      // Get git branch for this project
      const branch = await this.getGitBranch(project.dir);

      // Create package metadata
      const pkg: CascadeLayerPackage = {
        name: project.name,
        dir: project.dir,
        configPath: project.configPath,
        branch,
        currentVersion: undefined, // Will be populated from JSR if needed
        dependsOn: [],
        hasBuild: project.tasks ? Object.hasOwn(project.tasks, 'build') : false,
      };

      // Create graph node
      const node: CascadeGraphNode = {
        name: project.name,
        package: pkg,
        dependsOn: new Set<string>(),
        dependents: new Set<string>(),
        depth,
      };

      // If not root, record the dependency
      if (currentName !== rootName) {
        // Find what this package depends on (from our cascade scope)
        // For now, we track this as we discover - the package's dependsOn
        // will be set when we add it as a dependent of another package
      }

      graph.set(project.name, node);

      // Find all packages that reference this package (its dependents)
      const references = await findPackageReferences(
        project.name,
        this.resolver,
        { sourceFilter: sourceFilter as PackageReference['source'][] },
      );

      // Extract unique project names from references
      const dependentNames = new Set<string>();
      for (const ref of references) {
        if (ref.projectName && ref.projectName !== project.name) {
          dependentNames.add(ref.projectName);
        }
      }

      // Add each dependent to the graph
      for (const dependentName of dependentNames) {
        node.dependents.add(dependentName);

        // The dependent depends on the current package
        if (graph.has(dependentName)) {
          const dependentNode = graph.get(dependentName)!;
          dependentNode.dependsOn.add(project.name);
          dependentNode.package.dependsOn.push(project.name);
        }

        // Queue the dependent for processing
        if (!visited.has(dependentName)) {
          queue.push([dependentName, depth + 1]);
        }
      }
    }

    // Second pass: ensure all dependsOn relationships are bidirectional
    for (const node of graph.values()) {
      for (const depName of node.dependsOn) {
        const depNode = graph.get(depName);
        if (depNode) {
          depNode.dependents.add(node.name);
        }
      }
    }

    return graph;
  }

  /**
   * Detect cycles in the dependency graph.
   *
   * Uses DFS with coloring to detect back edges that indicate cycles.
   *
   * @param graph - The dependency graph
   * @returns Cycle detection result
   */
  detectCycles(graph: Map<string, CascadeGraphNode>): CycleDetectionResult {
    // Colors: 0 = white (unvisited), 1 = gray (in progress), 2 = black (done)
    const colors = new Map<string, number>();
    const parent = new Map<string, string>();

    for (const name of graph.keys()) {
      colors.set(name, 0);
    }

    const dfs = (name: string): string[] | null => {
      colors.set(name, 1); // Mark as in progress

      const node = graph.get(name);
      if (!node) return null;

      // Check dependents (forward edges in our discovery graph)
      for (const depName of node.dependents) {
        if (!graph.has(depName)) continue;

        const color = colors.get(depName) ?? 0;

        if (color === 1) {
          // Found a back edge - cycle detected!
          // Reconstruct cycle path
          const cycle = [depName, name];
          let current = name;
          while (parent.has(current) && parent.get(current) !== depName) {
            current = parent.get(current)!;
            cycle.push(current);
          }
          cycle.push(depName);
          return cycle.reverse();
        }

        if (color === 0) {
          parent.set(depName, name);
          const result = dfs(depName);
          if (result) return result;
        }
      }

      colors.set(name, 2); // Mark as done
      return null;
    };

    // Run DFS from each unvisited node
    for (const name of graph.keys()) {
      if (colors.get(name) === 0) {
        const cycle = dfs(name);
        if (cycle) {
          return { hasCycle: true, cyclePath: cycle };
        }
      }
    }

    return { hasCycle: false };
  }

  /**
   * Topological sort with layer grouping.
   *
   * Groups packages into layers where each layer's packages have all
   * dependencies satisfied by prior layers. Uses Kahn's algorithm.
   *
   * @param graph - The dependency graph
   * @param rootName - The root package name
   * @returns Ordered layers for parallel execution
   */
  private topologicalSort(
    graph: Map<string, CascadeGraphNode>,
    rootName: string,
  ): CascadeLayer[] {
    const layers: CascadeLayer[] = [];

    // Track which packages have been placed in a layer
    const placed = new Set<string>();

    // Track in-degree (number of unsatisfied dependencies) for each package
    const inDegree = new Map<string, number>();

    for (const node of graph.values()) {
      // Count dependencies that are within our cascade scope
      let count = 0;
      for (const depName of node.dependsOn) {
        if (graph.has(depName)) {
          count++;
        }
      }
      inDegree.set(node.name, count);
    }

    // Root is always layer 0
    if (graph.has(rootName)) {
      layers.push({
        index: 0,
        packages: [graph.get(rootName)!.package],
      });
      placed.add(rootName);
    }

    // Process remaining layers
    let currentLayer = 1;
    let remaining = graph.size - 1; // Exclude root which is already placed

    while (remaining > 0) {
      const layerPackages: CascadeLayerPackage[] = [];

      // Find all packages whose dependencies are all satisfied
      for (const node of graph.values()) {
        if (placed.has(node.name)) continue;

        // Check if all dependencies are satisfied
        let allSatisfied = true;
        for (const depName of node.dependsOn) {
          if (graph.has(depName) && !placed.has(depName)) {
            allSatisfied = false;
            break;
          }
        }

        if (allSatisfied) {
          layerPackages.push(node.package);
        }
      }

      if (layerPackages.length === 0) {
        // No progress made - this shouldn't happen if there's no cycle
        // but handle gracefully
        break;
      }

      // Add layer
      layers.push({
        index: currentLayer,
        packages: layerPackages,
      });

      // Mark packages as placed
      for (const pkg of layerPackages) {
        placed.add(pkg.name);
        remaining--;
      }

      currentLayer++;
    }

    return layers;
  }

  /**
   * Get the git branch for a project directory.
   *
   * @param dir - Project directory
   * @returns Branch name or 'unknown'
   */
  private async getGitBranch(dir: string): Promise<string> {
    try {
      const cmd = new Deno.Command('git', {
        args: ['branch', '--show-current'],
        cwd: dir,
        stdout: 'piped',
        stderr: 'piped',
      });
      const result = await cmd.output();
      if (result.code === 0) {
        return new TextDecoder().decode(result.stdout).trim() || 'unknown';
      }
    } catch {
      // Ignore errors
    }
    return 'unknown';
  }

  /**
   * Extract release channel from branch name.
   *
   * For 'feature/dfs-release', returns 'dfs-release'.
   * For 'integration', returns 'integration'.
   *
   * @param branch - Git branch name
   * @returns Release channel
   */
  private extractChannel(branch: string): string {
    if (branch.startsWith('feature/')) {
      return branch.slice('feature/'.length);
    }
    return branch;
  }
}
