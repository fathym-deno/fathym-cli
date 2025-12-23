/**
 * Check command - type check project code with deno check.
 *
 * The projects:[projectRef]:check command provides a unified way to type check code in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Type check a project by package name
 * ftm projects @myorg/my-package check
 *
 * # Dry run to see what would execute
 * ftm projects @myorg/my-package check --dry-run
 * ```
 *
 * @module
 */

import { z } from "zod";
import {
  CLIDFSContextManager,
  Command,
  CommandParams,
  type CommandStatus,
} from "@fathym/cli";
import type { DFSFileHandler } from "@fathym/dfs";
import { DFSProjectResolver } from "../../../src/projects/ProjectResolver.ts";

/**
 * Result data for the check command.
 */
export interface ProjectCheckResult {
  /** The project that was checked */
  project: string;
  /** Whether type checking passed */
  success: boolean;
  /** Exit code from deno check */
  exitCode: number;
}

/**
 * Segments schema for the check command.
 */
const CheckSegmentsSchema = z.object({
  projectRef: z.string().describe(
    "Project name, path to deno.json(c), or directory",
  ),
});

type CheckSegments = z.infer<typeof CheckSegmentsSchema>;

/**
 * Zod schema for check command flags.
 */
const CheckFlagsSchema = z.object({
  "dry-run": z.boolean().optional().describe(
    "Show what would run without executing",
  ),
  "verbose": z.boolean().optional().describe(
    "Show detailed output",
  ),
  "all": z.boolean().optional().describe(
    "Type-check all code, including remote modules and npm packages",
  ),
});

/**
 * Zod schema for check command positional arguments.
 */
const CheckArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the check command.
 */
class CheckCommandParams extends CommandParams<
  z.infer<typeof CheckArgsSchema>,
  z.infer<typeof CheckFlagsSchema>,
  CheckSegments
> {
  get ProjectRef(): string {
    return this.Segment("projectRef") ?? "";
  }

  get Verbose(): boolean {
    return this.Flag("verbose") ?? false;
  }

  get All(): boolean {
    return this.Flag("all") ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag("dry-run") ?? false;
  }
}

export default Command(
  "projects:[projectRef]:check",
  "Type check project code with deno check.",
)
  .Args(CheckArgsSchema)
  .Flags(CheckFlagsSchema)
  .Segments(CheckSegmentsSchema)
  .Params(CheckCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
    };
  })
  .Run(
    async (
      { Params, Log, Services },
    ): Promise<CommandStatus<ProjectCheckResult>> => {
      const resolver = Services.ProjectResolver;

      if (!Params.ProjectRef) {
        Log.Error("No project reference provided.");
        return {
          Code: 1,
          Message: "No project reference provided",
          Data: { project: "", success: false, exitCode: 1 },
        };
      }

      try {
        const projects = await resolver.Resolve(Params.ProjectRef);

        if (projects.length === 0) {
          Log.Error(`No projects found matching '${Params.ProjectRef}'.`);
          return {
            Code: 1,
            Message: `No projects found matching '${Params.ProjectRef}'`,
            Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
          };
        }

        if (projects.length > 1) {
          Log.Error(
            `Found ${projects.length} projects. Please specify a single project:\n` +
              projects.map((p) => `  - ${p.name ?? p.dir}`).join("\n"),
          );
          return {
            Code: 1,
            Message:
              `Found ${projects.length} projects, please specify a single project`,
            Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
          };
        }

        const project = projects[0];
        const projectName = project.name ?? project.dir;

        if (Params.Verbose) {
          Log.Info(`Type checking ${projectName}...`);
        }

        // Build check args - use mod.ts or main entry if available
        const args = ["check"];
        if (Params.All) {
          args.push("--all");
        }
        args.push("**/*.ts");

        if (Params.DryRun) {
          Log.Info(
            `[DRY RUN] Would run: deno ${args.join(" ")} in ${project.dir}`,
          );
          return {
            Code: 0,
            Message: `[DRY RUN] Would type check ${projectName}`,
            Data: { project: projectName, success: true, exitCode: 0 },
          };
        }

        const cmd = new Deno.Command("deno", {
          args,
          cwd: project.dir,
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        });

        const { code } = await cmd.output();
        const success = code === 0;

        if (Params.Verbose && success) {
          Log.Info(`Type checking complete.`);
        }

        return {
          Code: code,
          Message: success
            ? `Type checking passed for ${projectName}`
            : `Type checking failed for ${projectName}`,
          Data: { project: projectName, success, exitCode: code },
        };
      } catch (error) {
        Log.Error(error instanceof Error ? error.message : String(error));
        return {
          Code: 1,
          Message: `Type checking failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
        };
      }
    },
  );
