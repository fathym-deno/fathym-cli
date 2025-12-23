/**
 * Lint command - lint project code with deno lint.
 *
 * The projects:[projectRef]:lint command provides a unified way to lint code in a project.
 * It can be used standalone or as a building block in pipeline commands like build.
 *
 * ## Usage
 *
 * ```bash
 * # Lint a project by package name
 * ftm projects @myorg/my-package lint
 *
 * # Dry run to see what would execute
 * ftm projects @myorg/my-package lint --dry-run
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
 * Result data for the lint command.
 */
export interface ProjectLintResult {
  /** The project that was linted */
  project: string;
  /** Whether linting passed */
  success: boolean;
  /** Exit code from deno lint */
  exitCode: number;
}

/**
 * Segments schema for the lint command.
 */
const LintSegmentsSchema = z.object({
  projectRef: z.string().describe(
    "Project name, path to deno.json(c), or directory",
  ),
});

type LintSegments = z.infer<typeof LintSegmentsSchema>;

/**
 * Zod schema for lint command flags.
 */
const LintFlagsSchema = z.object({
  "dry-run": z.boolean().optional().describe(
    "Show what would run without executing",
  ),
  "verbose": z.boolean().optional().describe(
    "Show detailed output",
  ),
});

/**
 * Zod schema for lint command positional arguments.
 */
const LintArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the lint command.
 */
class LintCommandParams extends CommandParams<
  z.infer<typeof LintArgsSchema>,
  z.infer<typeof LintFlagsSchema>,
  LintSegments
> {
  get ProjectRef(): string {
    return this.Segment("projectRef") ?? "";
  }

  get Verbose(): boolean {
    return this.Flag("verbose") ?? false;
  }

  override get DryRun(): boolean {
    return this.Flag("dry-run") ?? false;
  }
}

export default Command(
  "projects:[projectRef]:lint",
  "Lint project code with deno lint.",
)
  .Args(LintArgsSchema)
  .Flags(LintFlagsSchema)
  .Segments(LintSegmentsSchema)
  .Params(LintCommandParams)
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
    ): Promise<CommandStatus<ProjectLintResult>> => {
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
          Log.Info(`Linting ${projectName}...`);
        }

        const args = ["lint"];

        if (Params.DryRun) {
          Log.Info(
            `[DRY RUN] Would run: deno ${args.join(" ")} in ${project.dir}`,
          );
          return {
            Code: 0,
            Message: `[DRY RUN] Would lint ${projectName}`,
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
          Log.Info(`Linting complete.`);
        }

        return {
          Code: code,
          Message: success
            ? `Linting passed for ${projectName}`
            : `Linting failed for ${projectName}`,
          Data: { project: projectName, success, exitCode: code },
        };
      } catch (error) {
        Log.Error(error instanceof Error ? error.message : String(error));
        return {
          Code: 1,
          Message: `Linting failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          Data: { project: Params.ProjectRef, success: false, exitCode: 1 },
        };
      }
    },
  );
