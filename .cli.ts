import { CLI } from '@fathym/cli';
import { FtmCli } from '@fathym/cli/ftm-cli';
import EaCInstallCLI from '@fathym/eac-install';
import { VersionResolver } from './src/deps/VersionResolver.ts';
import { VersionComparator } from './src/deps/VersionComparator.ts';
import { CliffyPromptService } from './src/services/PromptService.ts';
import { UrlOpener } from './src/services/UrlOpener.ts';

const PACKAGE_NAME = '@fathym/ftm';

export default CLI(
  'Fathym CLI',
  'ftm',
  '0.0.0',
  'Open-source Fathym CLI',
)
  .Origin(import.meta.url)
  .Commands(['./commands'])
  .ConfigDFS('.ftm')
  .CLIs({
    cli: FtmCli, // Maps ftm-cli commands under 'cli' group (ftm cli build, etc.)
    eac: EaCInstallCLI, // Maps ftm-eac-install commands under 'eac' group (ftm eac install, etc.)
  })
  .Templates('./templates')
  .OnInit((ioc, _config) => {
    ioc.Register(CliffyPromptService, () => new CliffyPromptService());
    ioc.Register(UrlOpener, () => new UrlOpener());
  })
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

        // Execute the matched command (args/flags inherited automatically)
        return await Commands?.$Command();
      })
  );
