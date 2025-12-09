/**
 * Ref command - display ProjectRef details for a resolved project.
 *
 * The projects:ref command provides a unified way to inspect project
 * configuration details including git state and JSR version info.
 * This command is particularly useful for the release cascade workflow
 * and general debugging of project configurations.
 *
 * ## Usage
 *
 * ```bash
 * # Get project details by package name
 * ftm projects ref @fathym/dfs
 *
 * # Output as JSON for programmatic consumption
 * ftm projects ref @fathym/dfs --json
 * ```
 *
 * ## Output
 *
 * The command displays:
 * - Package name and directory
 * - Git remote and current branch
 * - Available tasks and whether build task exists
 * - JSR versions grouped by channel (production, integration, feature branches)
 *
 * @example Get project details
 * ```bash
 * ftm projects ref @fathym/dfs
 * ```
 *
 * @example Get JSON output for scripting
 * ```bash
 * ftm projects ref @fathym/dfs --json
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import type { DFSFileHandler } from '@fathym/dfs';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';
import { VersionResolver } from '../../src/deps/VersionResolver.ts';
import {
  findPackageReferences,
  type PackageReference,
} from '../../src/projects/PackageReferences.ts';

/**
 * Zod schema for ref command flags.
 */
const RefFlagsSchema = z.object({
  json: z.boolean().optional().describe('Output as JSON for programmatic consumption'),
});

/**
 * Zod schema for ref command positional arguments.
 */
const RefArgsSchema = z.tuple([
  z
    .string()
    .describe('Project name, path to deno.json(c), or directory')
    .meta({ argName: 'project' }),
]);

/**
 * Typed parameter accessor for the ref command.
 */
class RefCommandParams extends CommandParams<
  z.infer<typeof RefArgsSchema>,
  z.infer<typeof RefFlagsSchema>
> {
  /** Project reference from first positional argument */
  get ProjectRef(): string {
    return this.Arg(0)!;
  }

  /** Whether to output as JSON */
  get Json(): boolean {
    return this.Flag('json') ?? false;
  }
}

/**
 * Git information for a project.
 */
interface GitInfo {
  remote?: string;
  branch?: string;
}

/**
 * Get git information for a directory.
 */
async function getGitInfo(dir: string): Promise<GitInfo> {
  const result: GitInfo = {};

  try {
    const branchCmd = new Deno.Command('git', {
      args: ['branch', '--show-current'],
      cwd: dir,
      stdout: 'piped',
      stderr: 'piped',
    });
    const branchResult = await branchCmd.output();
    if (branchResult.code === 0) {
      result.branch = new TextDecoder().decode(branchResult.stdout).trim();
    }
  } catch {
    /* ignore git errors */
  }

  try {
    const remoteCmd = new Deno.Command('git', {
      args: ['remote', 'get-url', 'origin'],
      cwd: dir,
      stdout: 'piped',
      stderr: 'piped',
    });
    const remoteResult = await remoteCmd.output();
    if (remoteResult.code === 0) {
      result.remote = new TextDecoder().decode(remoteResult.stdout).trim();
    }
  } catch {
    /* ignore git errors */
  }

  return result;
}

/**
 * Get JSR versions grouped by channel.
 * Returns a map of channel name to latest version for that channel.
 */
async function getJsrVersionsByChannel(
  packageName: string,
  versionResolver: VersionResolver,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  try {
    const versionsByChannel = await versionResolver.getVersionsByChannel(
      'jsr',
      packageName,
    );

    for (const [channel, versions] of versionsByChannel) {
      // versions are already sorted newest first, so take the first one
      if (versions.length > 0) {
        result[channel] = versions[0].version;
      }
    }
  } catch {
    // Package may not be published yet - return empty
  }

  return result;
}

/**
 * Output structure for the ref command.
 */
interface RefOutput {
  name?: string;
  dir: string;
  configPath: string;
  git: GitInfo;
  hasBuild: boolean;
  tasks: string[];
  jsrVersions: Record<string, string>;
  referencedBy: PackageReference[];
}

export default Command('projects:ref', 'Display ProjectRef details for a resolved project.')
  .Args(RefArgsSchema)
  .Flags(RefFlagsSchema)
  .Params(RefCommandParams)
  .Services(async (_, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);
    const dfs = await dfsCtx.GetExecutionDFS();

    return {
      ProjectResolver: new DFSProjectResolver(dfs as unknown as DFSFileHandler),
      VersionResolver: new VersionResolver(),
    };
  })
  .Run(async ({ Params, Log, Services }) => {
    const { ProjectResolver, VersionResolver } = Services;

    try {
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

      // Gather git info
      const gitInfo = await getGitInfo(project.dir);

      // Fetch JSR versions by channel
      const jsrVersions = project.name
        ? await getJsrVersionsByChannel(project.name, VersionResolver)
        : {};

      // Check for build task
      const hasBuild = project.tasks ? Object.hasOwn(project.tasks, 'build') : false;
      const tasks = project.tasks ? Object.keys(project.tasks) : [];

      // Find all references to this package in the workspace
      const referencedBy = project.name
        ? await findPackageReferences(project.name, ProjectResolver)
        : [];

      // Build output
      const output: RefOutput = {
        name: project.name,
        dir: project.dir,
        configPath: project.configPath,
        git: gitInfo,
        hasBuild,
        tasks,
        jsrVersions,
        referencedBy,
      };

      if (Params.Json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        // Human-readable output
        Log.Info(`Package: ${project.name ?? '(unnamed)'}`);
        Log.Info(`Directory: ${project.dir}`);
        Log.Info(`Config: ${project.configPath}`);

        if (gitInfo.remote) {
          Log.Info(`Git Remote: ${gitInfo.remote}`);
        }
        if (gitInfo.branch) {
          Log.Info(`Git Branch: ${gitInfo.branch}`);
        }

        Log.Info(`Has Build Task: ${hasBuild ? 'yes' : 'no'}`);

        if (tasks.length > 0) {
          Log.Info(`Tasks: ${tasks.join(', ')}`);
        }

        // Display JSR versions by channel
        const channelKeys = Object.keys(jsrVersions);
        if (channelKeys.length > 0) {
          Log.Info('');
          Log.Info('JSR Versions by Channel:');
          for (const channel of channelKeys.sort()) {
            Log.Info(`  ${channel}: ${jsrVersions[channel]}`);
          }
        } else if (project.name) {
          Log.Info('');
          Log.Info('JSR Versions: (not published or no versions found)');
        }

        // Display references to this package
        if (referencedBy.length > 0) {
          Log.Info('');
          Log.Info(`Referenced By (${referencedBy.length} files):`);
          for (const ref of referencedBy) {
            const sourceLabels: Record<PackageReference['source'], string> = {
              config: '',
              deps: ' [.deps.ts]',
              template: ' [template]',
              docs: ' [docs]',
              other: ' [other]',
            };
            const sourceLabel = sourceLabels[ref.source];
            Log.Info(
              `  ${ref.projectName} → ${ref.file}:${ref.line} (@${ref.currentVersion})${sourceLabel}`,
            );
          }
        } else if (project.name) {
          Log.Info('');
          Log.Info('Referenced By: (no references found)');
        }
      }

      return 0;
    } catch (error) {
      Log.Error(error instanceof Error ? error.message : String(error));
      return 1;
    }
  });
