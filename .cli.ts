import { CLI } from '@fathym/cli';
import { VersionResolver } from './src/deps/VersionResolver.ts';
import { VersionComparator } from './src/deps/VersionComparator.ts';

const PACKAGE_NAME = '@fathym/ftm';

export default CLI(
  'Fathym CLI',
  'ftm',
  '0.0.0',
  'Open-source Fathym CLI',
)
  .Commands(['./commands', 'jsr:@fathym/ftm@0/commands'])
  .ConfigDFS('.ftm')
  .Plugins(['jsr:@fathym/cli-mcp-server/plugin'])
  .Templates('./templates')
  .InitCommand((cmd) =>
    cmd
      // ═══════════════════════════════════════════════════════════════════
      // Register services for version checking
      // ═══════════════════════════════════════════════════════════════════
      .Services(() =>
        Promise.resolve({
          VersionResolver: new VersionResolver(),
          VersionComparator: new VersionComparator(),
        })
      )
      // ═══════════════════════════════════════════════════════════════════
      // Run logic: check for updates, then execute matched command
      // ═══════════════════════════════════════════════════════════════════
      .Run(async ({ Services, Config, Log, Commands }) => {
        const { VersionResolver, VersionComparator } = Services;

        // Check for updates (silently ignore network errors)
        try {
          const versions = await VersionResolver.getVersionsByChannel(
            'jsr',
            PACKAGE_NAME,
          );
          const latestProduction = versions.get('production')?.[0]?.version;

          if (latestProduction) {
            const comparison = VersionComparator.compare(
              Config.Version,
              latestProduction,
            );
            if (comparison < 0) {
              Log.Warn(`A newer version is available: ${latestProduction}`);
              Log.Warn(`  Current: ${Config.Version}`);
              Log.Warn(`  Upgrade: ftm upgrade`);
              Log.Warn('');
            }
          }
        } catch {
          // Silently ignore network errors - don't block command execution
        }

        // Execute the matched command
        // If we don't call this, the command never runs!
        return await Commands!.$Command();
      })
  )
  .Build();
