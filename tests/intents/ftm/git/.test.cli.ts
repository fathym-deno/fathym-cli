import { CLI } from '@fathym/cli';
import { MemoryDFSFileHandler } from '@fathym/dfs/handlers';
import { CliffyPromptService } from '../../../../src/services/PromptService.ts';
import { UrlOpener } from '../../../../src/services/UrlOpener.ts';
import { FathymApiClient, FathymConfigStore } from '../../../../src/services/.exports.ts';

/**
 * Minimal CLI configuration shared by git intent suites.
 *
 * Provides ConfigDFS + common services without loading the full production CLI.
 */
export default CLI('Git Intent CLI', 'ftm', '0.0.0')
  .ConfigDFS('.ftm-test')
  .OnInit((ioc) => {
    ioc.Register(CliffyPromptService, () => new CliffyPromptService());
    ioc.Register(UrlOpener, () => new UrlOpener());

    const configDFS = new MemoryDFSFileHandler({ Root: '/' });

    ioc.Register(FathymConfigStore, () => new FathymConfigStore(configDFS));
    ioc.Register(
      FathymApiClient,
      async () => new FathymApiClient(await ioc.Resolve(FathymConfigStore)),
    );
  });
