/**
 * Build command - build a project with cascading task overrides.
 *
 * The projects:build command runs a multi-step build pipeline that supports
 * cascading overrides. Each step checks for a project-defined task before
 * falling back to CLI defaults.
 *
 * ## Cascade Resolution
 *
 * ```
 * ftm projects build @fathym/cli
 *      │
 *      ├─► Check: project has 'build' task?
 *      │   └─► YES: delegate entirely (full override)
 *      │
 *      └─► NO: run step pipeline
 *          ├─► fmt:   'build:fmt' exists? → project task : deno fmt
 *          ├─► lint:  'build:lint' exists? → project task : deno lint
 *          ├─► check: 'build:check' exists? → project task : deno check
 *          └─► test:  'test' exists? → project task : deno test
 * ```
 *
 * ## Usage
 *
 * ```bash
 * # Build with cascading overrides
 * ftm projects build @myorg/my-package
 *
 * # See what would run (dry run)
 * ftm projects build @myorg/my-package --dry-run
 *
 * # Show detailed cascade resolution
 * ftm projects build @myorg/my-package --verbose
 *
 * # Show pipeline structure and override status
 * ftm projects build @myorg/my-package --explain
 *
 * # Continue on failure (ignore faults)
 * ftm projects build @myorg/my-package --ignore-faults
 * ```
 *
 * ## Overriding Steps
 *
 * To customize a step, add a task to your deno.jsonc:
 *
 * ```jsonc
 * {
 *   "tasks": {
 *     "build:lint": "deno lint --fix",  // Custom lint step
 *     "build:check": "deno check src/"   // Custom check step
 *   }
 * }
 * ```
 *
 * To override the entire build, define a `build` task:
 *
 * ```jsonc
 * {
 *   "tasks": {
 *     "build": "deno task build:fmt && deno task build:lint && deno task test"
 *   }
 * }
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';
import { CascadeRunner } from '../../src/pipelines/CascadeRunner.ts';
import type { CascadeStepDef, CommandInvoker } from '../../src/pipelines/CascadeTypes.ts';
import TaskCommand from '../task.ts';
import FmtCommand from './fmt.ts';
import LintCommand from './lint.ts';
import CheckCommand from './check.ts';
import TestCommand from './test.ts';

/**
 * Build pipeline step definitions.
 *
 * Each step has:
 * - name: Step identifier
 * - overrideTask: Task name to check for project override
 * - description: Human-readable description for logging
 * - commandKey: Key in Commands map for default implementation
 */
const BUILD_STEPS: CascadeStepDef[] = [
  {
    name: 'fmt',
    overrideTask: 'build:fmt',
    description: 'Formatting code',
    commandKey: 'Fmt',
  },
  {
    name: 'lint',
    overrideTask: 'build:lint',
    description: 'Linting code',
    commandKey: 'Lint',
  },
  {
    name: 'check',
    overrideTask: 'build:check',
    description: 'Type checking',
    commandKey: 'Check',
  },
  {
    name: 'test',
    overrideTask: 'test',
    description: 'Running tests',
    commandKey: 'Test',
  },
];

/**
 * Zod schema for build command flags.
 */
const BuildFlagsSchema = z.object({
  'dry-run': z.boolean().optional().describe(
    'Show what would run without executing',
  ),
  'verbose': z.boolean().optional().describe(
    'Show detailed cascade resolution and execution',
  ),
  'ignore-faults': z.boolean().optional().describe(
    'Continue on step failure, attempting fallback to defaults',
  ),
  'explain': z.boolean().optional().describe(
    'Show pipeline structure and override status without executing',
  ),
});

/**
 * Zod schema for build command positional arguments.
 */
const BuildArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the build command.
 */
class BuildCommandParams extends CommandParams<
  z.infer<typeof BuildArgsSchema>,
  z.infer<typeof BuildFlagsSchema>
> {
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  get Verbose(): boolean {
    return this.Flag('verbose') ?? false;
  }

  get IgnoreFaults(): boolean {
    return this.Flag('ignore-faults') ?? false;
  }

  get Explain(): boolean {
    return this.Flag('explain') ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag('dry-run') ?? false;
  }
}

export default Command(
  'projects:build',
  'Build a project with cascading task overrides.',
)
  .Args(BuildArgsSchema)
  .Flags(BuildFlagsSchema)
  .Params(BuildCommandParams)
  .Commands({
    Task: TaskCommand.Build(),
    Fmt: FmtCommand.Build(),
    Lint: LintCommand.Build(),
    Check: CheckCommand.Build(),
    Test: TestCommand.Build(),
  })
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();
    const resolver = new DFSProjectResolver(dfs as unknown as DFSFileHandler);

    // Resolve project upfront so we can access it in Run
    const projects = await resolver.Resolve(ctx.Params.ProjectRef);

    if (projects.length === 0) {
      throw new Error(`No projects found matching '${ctx.Params.ProjectRef}'.`);
    }

    if (projects.length > 1) {
      throw new Error(
        `Found ${projects.length} projects. Please specify a single project:\n` +
          projects.map((p) => `  - ${p.name ?? p.dir}`).join('\n'),
      );
    }

    return {
      Project: projects[0],
    };
  })
  .Run(async ({ Params, Commands, Services, Log }) => {
    const { Project } = Services;
    const { Task, Fmt, Lint, Check, Test } = Commands!;

    // Build step commands map (excluding Task which is used for overrides)
    const stepCommands: Record<string, CommandInvoker> = {
      Fmt: Fmt as CommandInvoker,
      Lint: Lint as CommandInvoker,
      Check: Check as CommandInvoker,
      Test: Test as CommandInvoker,
    };

    // Create cascade runner with options
    const runner = new CascadeRunner(Project, Log, Task as CommandInvoker, {
      verbose: Params.Verbose,
      ignoreFaults: Params.IgnoreFaults,
      dryRun: Params.DryRun,
      explain: Params.Explain,
    });

    // Resolve cascade (check for overrides)
    const resolution = runner.resolve('build', 'build', BUILD_STEPS);

    // Execute (handles --explain, --dry-run, full override, and step execution)
    try {
      return await runner.run(resolution, stepCommands, Params.ProjectRef);
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
