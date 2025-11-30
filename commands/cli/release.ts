/**
 * Release command - orchestrates a full CLI release.
 *
 * The release command combines build, compile (for all targets), and
 * install-scripts generation into a single workflow. It's designed to
 * prepare all release artifacts before uploading to GitHub Releases.
 *
 * ## Execution Flow
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  1. Load .cli.json and determine targets                           │
 * │  2. Run `ftm cli build` to prepare static artifacts                │
 * │  3. For each target, run `ftm cli compile --target=<target>`       │
 * │  4. Run `ftm cli install scripts` to generate install scripts      │
 * │  5. Output summary of generated files                              │
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
 * Targets can be specified in `.cli.json`:
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
 * @module
 */

import { join } from '@std/path';
import { z } from 'zod';
import { CLIDFSContextManager, Command, CommandParams, loadCLIConfig } from '@fathym/cli';
import { DEFAULT_TARGETS, type FathymCLIConfig } from '../../src/config/FathymCLIConfig.ts';
import BuildCommand from './build.ts';
import CompileCommand from './compile.ts';
import ScriptsCommand from './install/scripts.ts';

/**
 * Zod schema for release command positional arguments.
 */
export const ReleaseArgsSchema = z.tuple([]);

/**
 * Zod schema for release command flags.
 *
 * @property config - Path to .cli.json configuration
 * @property targets - Comma-separated list of targets (overrides config)
 * @property skip-scripts - Skip install scripts generation
 * @property repo - GitHub repository for install scripts
 */
export const ReleaseFlagsSchema = z
  .object({
    config: z
      .string()
      .optional()
      .describe('Path to .cli.json (default: ./.cli.json)'),
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
}

/**
 * Release command - orchestrates a full CLI release.
 */
export default Command('release', 'Build and compile CLI for all target platforms')
  .Args(ReleaseArgsSchema)
  .Flags(ReleaseFlagsSchema)
  .Params(ReleaseParams)
  .Commands({
    Build: BuildCommand.Build(),
    Compile: CompileCommand.Build(),
    Scripts: ScriptsCommand.Build(),
  })
  .Services(async (ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    if (ctx.Params.ConfigPath) {
      await dfsCtx.RegisterProjectDFS(ctx.Params.ConfigPath, 'CLI');
    }

    const dfs = ctx.Params.ConfigPath
      ? await dfsCtx.GetDFS('CLI')
      : await dfsCtx.GetExecutionDFS();

    return { DFS: dfs };
  })
  .Run(async ({ Params, Log, Commands, Services }) => {
    const { DFS } = Services;
    const { Build, Compile, Scripts } = Commands!;

    // Load config
    const configPath = await DFS.ResolvePath('.cli.json');
    const config = await loadCLIConfig<FathymCLIConfig>(configPath);

    const cliName = config.Tokens?.[0] ?? 'cli';
    const version = config.Version;

    Log.Info(`🚀 Starting release for ${config.Name} v${version}`);
    Log.Info('');

    // Determine targets
    const targets = Params.Targets ?? config.Release?.Targets ?? [...DEFAULT_TARGETS];
    Log.Info(`📦 Targets: ${targets.join(', ')}`);
    Log.Info('');

    // Step 1: Build
    Log.Info('━'.repeat(50));
    Log.Info('Step 1/3: Building static artifacts');
    Log.Info('━'.repeat(50));
    await Build([], { config: configPath });
    Log.Info('');

    // Step 2: Compile for each target
    Log.Info('━'.repeat(50));
    Log.Info(`Step 2/3: Compiling for ${targets.length} targets`);
    Log.Info('━'.repeat(50));

    for (const target of targets) {
      Log.Info(`\n🎯 Compiling for: ${target}`);
      await Compile([], { config: configPath, target });
    }
    Log.Info('');

    // Step 3: Generate install scripts
    if (!Params.SkipScripts) {
      Log.Info('━'.repeat(50));
      Log.Info('Step 3/3: Generating install scripts');
      Log.Info('━'.repeat(50));
      await Scripts([], {
        config: configPath,
        ...(Params.Repo ? { repo: Params.Repo } : {}),
      });
    } else {
      Log.Info('━'.repeat(50));
      Log.Info('Step 3/3: Skipping install scripts (--skip-scripts)');
      Log.Info('━'.repeat(50));
    }

    Log.Info('');
    Log.Info('━'.repeat(50));
    Log.Info('📋 Release Summary');
    Log.Info('━'.repeat(50));
    Log.Info(`   CLI: ${config.Name} v${version}`);
    Log.Info(`   Tokens: ${config.Tokens?.join(', ')}`);
    Log.Info(`   Targets: ${targets.length} platforms`);
    Log.Info('');
    Log.Info('📁 Generated files in .dist/:');

    for (const target of targets) {
      const ext = target.includes('windows') ? '.exe' : '';
      Log.Info(`   - ${target}/${cliName}${ext}`);
    }

    if (!Params.SkipScripts) {
      Log.Info('   - install.sh');
      Log.Info('   - install.ps1');
    }

    Log.Info('');
    Log.Success('🎉 Release artifacts ready!');
    Log.Info('');
    Log.Info('📤 Next steps:');
    Log.Info('   1. Create a GitHub release with tag v' + version);
    Log.Info('   2. Upload all files from .dist/ to the release');
    Log.Info('   3. Users can then install via:');
    Log.Info('');
    Log.Info('      # macOS/Linux');
    Log.Info('      curl -fsSL https://github.com/OWNER/REPO/releases/latest/download/install.sh | bash');
    Log.Info('');
    Log.Info('      # Windows PowerShell');
    Log.Info('      iwr -useb https://github.com/OWNER/REPO/releases/latest/download/install.ps1 | iex');
  });
