import { CLI } from '@fathym/cli';
import { parse as parseJsonc } from '@std/jsonc';
import { VersionResolver } from './src/deps/VersionResolver.ts';
import { VersionComparator } from './src/deps/VersionComparator.ts';
import { CliffyPromptService } from './src/services/PromptService.ts';

const PACKAGE_NAME = '@fathym/ftm';

// Read version from deno.jsonc so CI only needs to update one file
const denoJsoncPath = new URL('./deno.jsonc', import.meta.url);
const denoJsoncContent = await Deno.readTextFile(denoJsoncPath);
const denoConfig = parseJsonc(denoJsoncContent) as { version?: string };
const VERSION = denoConfig.version ?? '0.0.0';

export default CLI(
  'Fathym CLI',
  'ftm',
  VERSION,
  'Open-source Fathym CLI',
)
  .Commands(['./commands', 'jsr:@fathym/ftm@0/commands'])
  .ConfigDFS('.ftm')
  // NOTE: .Plugins() not yet implemented in CLIModuleBuilder
  // .Plugins(['jsr:@fathym/cli-mcp-server/plugin'])
  .Templates('./templates')
  .OnInit((ioc, _config) => {
    ioc.Register(CliffyPromptService, () => new CliffyPromptService());
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
      .Run(async ({ Services, Config, Log, Commands, Params }) => {
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

        // Execute the matched command with original args and flags
        return await Commands!.$Command(Params.Flags.args, Params.Flags.flags);
      })
  );
