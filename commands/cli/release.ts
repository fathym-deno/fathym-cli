/**
 * Release command - orchestrates a full CLI release.
 *
 * The release command combines compile (for all targets) and install-scripts
 * generation into a single workflow. It's designed to prepare all release
 * artifacts before uploading to GitHub Releases.
 *
 * Note: The compile command internally calls build, so there's no need
 * for a separate build step.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Load .cli.ts and determine targets                             │
 * │  2. Run `ftm cli compile --all --version=<version>`                │
 * │     (compile internally runs build first)                          │
 * │  3. Run `ftm cli install scripts` to generate install scripts      │
 * │  4. Output summary of generated files                              │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Output Structure
 *
 * ```
 * .dist/
 * ├── install.sh
 * ├── install.ps1
 * ├── x86_64-pc-windows-msvc/
 * │   └── my-cli.exe
 * ├── x86_64-apple-darwin/
 * │   └── my-cli
 * ├── aarch64-apple-darwin/
 * │   └── my-cli
 * ├── x86_64-unknown-linux-gnu/
 * │   └── my-cli
 * └── aarch64-unknown-linux-gnu/
 *     └── my-cli
 * ```
 *
 * ## Target Configuration
 *
 * Targets can be specified in `.cli.ts`:
 *
 * ```json
 * {
 *   "Name": "My CLI",
 *   "Tokens": ["my-cli"],
 *   "Version": "1.0.0",
 *   "Release": {
 *     "Targets": ["x86_64-pc-windows-msvc", "x86_64-apple-darwin"]
 *   }
 * }
 * ```
 *
 * If not specified, all 5 default targets are used.
 *
 * @example Full release with all targets
 * ```bash
 * ftm cli release
 * ```
 *
 * @example Release with specific targets
 * ```bash
 * ftm cli release --targets=x86_64-pc-windows-msvc,x86_64-apple-darwin
 * ```
 *
 * @example Skip install scripts generation
 * ```bash
 * ftm cli release --skip-scripts
 * ```
 *
 * @example Release with embedded version
 * ```bash
 * ftm cli release --version=1.2.3
 * ```
 *
 * @module
 */

import { join } from '@std/path';
import { parse as parseJsonc } from '@std/jsonc';
import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import { DEFAULT_TARGETS } from '../../src/config/FathymCLIConfig.ts';
import CompileCommand from './compile.ts';
import ScriptsCommand from './install/scripts.ts';

/**
 * Result data for the release command.
 */
export interface ReleaseResult {
  /** The CLI name */
  cliName: string;
  /** The version */
  version: string;
  /** Number of targets compiled */
  targetCount: number;
  /** Whether install scripts were generated */
  scriptsGenerated: boolean;
}

/**
 * Attempts to detect the GitHub repository from .git/config.
 */
async function detectGitHubRepo(cwd: string): Promise<string | undefined> {
  try {
    const gitConfigPath = join(cwd, '.git', 'config');
    const content = await Deno.readTextFile(gitConfigPath);

    // Match GitHub remote URL patterns
    const httpsMatch = content.match(
      /url\s*=\s*https:\/\/github\.com\/([^/]+\/[^/\s]+?)(?:\.git)?$/m,
    );
    const sshMatch = content.match(
      /url\s*=\s*git@github\.com:([^/]+\/[^/\s]+?)(?:\.git)?$/m,
    );

    const match = httpsMatch || sshMatch;
    return match ? match[1].replace(/\.git$/, '') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Zod schema for release command positional arguments.
 */
export const ReleaseArgsSchema = z.tuple([]);

/**
 * Zod schema for release command flags.
 *
 * @property config - Path to .cli.ts configuration
 * @property targets - Comma-separated list of targets (overrides config)
 * @property skip-scripts - Skip install scripts generation
 * @property repo - GitHub repository for install scripts
 */
export const ReleaseFlagsSchema = z
  .object({
    config: z
      .string()
      .optional()
      .describe('Path to .cli.ts (default: ./.cli.ts)'),
    targets: z
      .string()
      .optional()
      .describe('Comma-separated targets (default: all 5 platforms)'),
    'skip-scripts': z
      .boolean()
      .optional()
      .describe('Skip generating install scripts'),
    repo: z
      .string()
      .optional()
      .describe('GitHub repository for install scripts'),
    version: z
      .string()
      .optional()
      .describe('Version to embed in the compiled binary (default: 0.0.0)'),
  })
  .passthrough();

/**
 * Typed parameter accessor for the release command.
 */
export class ReleaseParams extends CommandParams<
  z.infer<typeof ReleaseArgsSchema>,
  z.infer<typeof ReleaseFlagsSchema>
> {
  get ConfigPath(): string | undefined {
    return this.Flag('config');
  }

  get Targets(): string[] | undefined {
    const targets = this.Flag('targets');
    return targets ? targets.split(',').map((t) => t.trim()) : undefined;
  }

  get SkipScripts(): boolean {
    return this.Flag('skip-scripts') ?? false;
  }

  get Repo(): string | undefined {
    return this.Flag('repo');
  }

  get Version(): string {
    return this.Flag('version') ?? '0.0.0';
  }
}

/**
 * Release command - orchestrates a full CLI release.
 */
export default Command(
  'release',
  'Build and compile CLI for all target platforms',
)
  .Args(ReleaseArgsSchema)
  .Flags(ReleaseFlagsSchema)
  .Params(ReleaseParams)
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.ConfigPath) {
      await dfsCtx.RegisterProjectDFS(ctx.Params.ConfigPath, 'CLI');
    }

    const dfs = ctx.Params.ConfigPath ? await dfsCtx.GetDFS('CLI') : await dfsCtx.GetExecutionDFS();

    return { DFS: dfs };
  })
  .Commands({
    Compile: CompileCommand.Build(),
    Scripts: ScriptsCommand.Build(),
  })
  .Run(
    async (
      { Params, Log, Commands, Config, Services },
    ): Promise<CommandStatus<ReleaseResult>> => {
      const { Compile, Scripts } = Commands!;
      const { DFS } = Services;

      // Load config
      const configPath = Params.ConfigPath || '.cli.ts';

      const cliName = Config.Tokens?.[0] ?? 'cli';
      const version = Config.Version;

      // Detect GitHub repo
      let repo = Params.Repo;
      if (!repo) {
        repo = await detectGitHubRepo(DFS.Root);
      }

      // Read package name from deno.jsonc
      let packageName = `@scope/${cliName}`; // fallback
      try {
        const denoJsoncPath = await DFS.ResolvePath('deno.jsonc');
        const denoContent = await Deno.readTextFile(denoJsoncPath);
        const denoConfig = parseJsonc(denoContent) as Record<string, unknown>;
        if (typeof denoConfig.name === 'string') {
          packageName = denoConfig.name;
        }
      } catch {
        // Try deno.json as fallback
        try {
          const denoJsonPath = await DFS.ResolvePath('deno.json');
          const denoContent = await Deno.readTextFile(denoJsonPath);
          const denoConfig = JSON.parse(denoContent) as Record<string, unknown>;
          if (typeof denoConfig.name === 'string') {
            packageName = denoConfig.name;
          }
        } catch {
          // Use fallback
        }
      }

      Log.Info(`🚀 Starting release for ${Config.Name} v${version}`);
      Log.Info('');

      // Determine targets
      const targets = Params.Targets ?? [...DEFAULT_TARGETS];
      const useAllTargets = !Params.Targets; // Use --all flag if no specific targets provided
      Log.Info(`📦 Targets: ${targets.join(', ')}`);
      Log.Info('');

      // Step 1: Compile (includes build internally)
      Log.Info('━'.repeat(50));
      Log.Info(
        `Step 1/2: Building and compiling for ${targets.length} targets`,
      );
      Log.Info('━'.repeat(50));

      if (useAllTargets) {
        // Use --all flag for default targets (more efficient)
        await Compile([], {
          config: configPath,
          all: true,
          version: Params.Version,
        });
      } else {
        // Loop through specific targets if user provided --targets
        for (const target of targets) {
          Log.Info(`\n🎯 Compiling for: ${target}`);
          await Compile([], {
            config: configPath,
            target,
            version: Params.Version,
          });
        }
      }
      Log.Info('');

      // Step 2: Generate install scripts
      const scriptsGenerated = !Params.SkipScripts;
      if (scriptsGenerated) {
        Log.Info('━'.repeat(50));
        Log.Info('Step 2/2: Generating install scripts');
        Log.Info('━'.repeat(50));
        await Scripts([], {
          config: configPath,
          ...(Params.Repo ? { repo: Params.Repo } : {}),
        });
      } else {
        Log.Info('━'.repeat(50));
        Log.Info('Step 2/2: Skipping install scripts (--skip-scripts)');
        Log.Info('━'.repeat(50));
      }

      Log.Info('');
      Log.Info('━'.repeat(50));
      Log.Info('📋 Release Summary');
      Log.Info('━'.repeat(50));
      Log.Info(`   CLI: ${Config.Name} v${version}`);
      Log.Info(`   Tokens: ${Config.Tokens?.join(', ')}`);
      Log.Info(`   Targets: ${targets.length} platforms`);
      Log.Info('');
      Log.Info('📁 Generated files in .dist/:');

      for (const target of targets) {
        const ext = target.includes('windows') ? '.exe' : '';
        Log.Info(`   - ${target}/${cliName}${ext}`);
      }

      if (scriptsGenerated) {
        Log.Info('   - install.sh');
        Log.Info('   - install.ps1');
      }

      Log.Info('');
      Log.Success('🎉 Release artifacts ready!');
      Log.Info('');
      Log.Info('📤 Next steps:');
      Log.Info('');
      Log.Info('   If using CI/CD (recommended):');
      Log.Info('   - Commit and push to trigger your release workflow');
      Log.Info(
        '   - CI will publish to JSR and create GitHub releases automatically',
      );
      Log.Info('');
      Log.Info('   Users can install via:');
      Log.Info('');
      Log.Info('      # Deno (recommended, cross-platform)');
      Log.Info(`      deno run -A jsr:${packageName}/install`);
      if (repo) {
        Log.Info('');
        Log.Info('      # macOS/Linux');
        Log.Info(
          `      curl -fsSL https://github.com/${repo}/releases/latest/download/install.sh | bash`,
        );
        Log.Info('');
        Log.Info('      # Windows PowerShell');
        Log.Info(
          `      iwr -useb https://github.com/${repo}/releases/latest/download/install.ps1 | iex`,
        );
      }

      return {
        Code: 0,
        Message: `Release complete for ${cliName} v${version}`,
        Data: {
          cliName,
          version,
          targetCount: targets.length,
          scriptsGenerated,
        },
      };
    },
  );
