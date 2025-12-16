/**
 * Upgrade command - upgrade ftm CLI to a different version.
 *
 * The upgrade command provides a way to upgrade the ftm CLI to a different
 * version. It can upgrade to the latest production version, a specific version,
 * or list all available versions.
 *
 * ## Usage
 *
 * ```bash
 * # Upgrade to latest production version
 * ftm upgrade
 *
 * # Upgrade to a specific version
 * ftm upgrade --version=0.0.70
 *
 * # List available versions
 * ftm upgrade --list
 *
 * # Check if upgrade is available (no install)
 * ftm upgrade --audit
 * ```
 *
 * @module
 */

import { z } from 'zod';
import { Command, CommandParams } from '@fathym/cli';
import { VersionResolver } from '../src/deps/VersionResolver.ts';
import { VersionComparator } from '../src/deps/VersionComparator.ts';

const PACKAGE_NAME = '@fathym/ftm';

/**
 * Zod schema for upgrade command flags.
 */
const UpgradeFlagsSchema = z
  .object({
    version: z.string().optional().describe('Specific version to install'),
    list: z.boolean().optional().describe('List available versions'),
    audit: z
      .boolean()
      .optional()
      .describe('Check if upgrade available (no install)'),
  })
  .passthrough();

/**
 * Zod schema for upgrade command positional arguments.
 */
const UpgradeArgsSchema = z.tuple([]);

/**
 * Typed parameter accessor for the upgrade command.
 */
class UpgradeParams extends CommandParams<
  z.infer<typeof UpgradeArgsSchema>,
  z.infer<typeof UpgradeFlagsSchema>
> {
  /** Specific version to install */
  get Version(): string | undefined {
    return this.Flag('version');
  }

  /** Whether to list available versions */
  get List(): boolean {
    return this.Flag('list') ?? false;
  }

  /** Whether to just check for upgrades (no install) */
  get Audit(): boolean {
    return this.Flag('audit') ?? false;
  }
}

export default Command('upgrade', 'Upgrade ftm CLI to a different version.')
  .Args(UpgradeArgsSchema)
  .Flags(UpgradeFlagsSchema)
  .Params(UpgradeParams)
  .Services(async () => {
    await Promise.resolve();

    return {
      VersionResolver: new VersionResolver(),
      VersionComparator: new VersionComparator(),
    };
  })
  .Run(async ({ Params, Log, Services, Config }) => {
    const { VersionResolver, VersionComparator } = Services;

    // Get current version directly from Config (embedded in .cli.ts at compile time)
    const currentVersion = Config.Version;

    // Fetch available versions from JSR
    const versionsByChannel = await VersionResolver.getVersionsByChannel(
      'jsr',
      PACKAGE_NAME,
    );

    // Get latest production version
    const latestProduction = versionsByChannel.get('production')?.[0]?.version;

    // --audit mode: just check and report
    if (Params.Audit) {
      if (!latestProduction) {
        Log.Info('No production version available.');
        return 0;
      }

      const comparison = VersionComparator.compare(
        currentVersion,
        latestProduction,
      );
      if (comparison < 0) {
        Log.Warn(`A newer version is available: ${latestProduction}`);
        Log.Warn(`   Current version: ${currentVersion}`);
        Log.Warn(`   To upgrade: ftm upgrade --version=${latestProduction}`);
        Log.Warn(`   Or: ftm upgrade (installs latest production)`);
      } else {
        Log.Success(
          `You are on the latest production version (${currentVersion})`,
        );
      }
      return 0;
    }

    // --list mode: show versions and let user select
    // Only show list if --list is explicitly requested, OR if no production version
    // AND no explicit --version was provided
    if (Params.List || (!latestProduction && !Params.Version)) {
      Log.Info('Available versions:');
      Log.Info('');

      // Group by channel
      for (const [channel, channelVersions] of versionsByChannel) {
        Log.Info(`  ${channel}:`);
        for (const v of channelVersions.slice(0, 5)) {
          // Show top 5 per channel
          const marker = v.version === currentVersion ? ' (current)' : '';
          Log.Info(`    ${v.version}${marker}`);
        }
        if (channelVersions.length > 5) {
          Log.Info(`    ... and ${channelVersions.length - 5} more`);
        }
      }

      Log.Info('');
      Log.Info('To install a specific version:');
      Log.Info(`  ftm upgrade --version=<version>`);
      return 0;
    }

    // Determine target version
    const targetVersion = Params.Version ?? latestProduction;

    if (!targetVersion) {
      Log.Error('No version specified and no production version available.');
      Log.Info('Use --list to see available versions.');
      return 1;
    }

    // Verify target version exists
    const exists = await VersionResolver.hasVersion(
      'jsr',
      PACKAGE_NAME,
      targetVersion,
    );
    if (!exists) {
      Log.Error(`Version ${targetVersion} not found.`);
      Log.Info('Use --list to see available versions.');
      return 1;
    }

    // Check if already on target version
    if (targetVersion === currentVersion) {
      Log.Info(`Already on version ${currentVersion}.`);
      return 0;
    }

    // Run the install script for the target version
    Log.Info(`Upgrading from ${currentVersion} to ${targetVersion}...`);

    const cmd = new Deno.Command('deno', {
      args: ['run', '-A', `jsr:${PACKAGE_NAME}@${targetVersion}/install`],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const { code } = await cmd.output();

    if (code === 0) {
      Log.Success(`Successfully upgraded to ${targetVersion}`);
      Log.Info('   Restart your terminal to use the new version.');
    }

    return code;
  });
