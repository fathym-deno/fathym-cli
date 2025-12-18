import { CLI } from '@fathym/cli';
import { CliffyPromptService } from '../../../../src/services/PromptService.ts';
import { UrlOpener } from '../../../../src/services/UrlOpener.ts';

/**
 * Minimal CLI configuration shared across git intent suites.
 *
 * Registers ConfigDFS and core services (prompt, URL opener) so intent tests
 * execute within the same IoC/DFS context as the production CLI.
 */
const GitIntentTestCLI = CLI('Git Intent Test CLI', 'ftm', '0.0.0')
  .ConfigDFS('.ftm')
  .OnInit((ioc) => {
    ioc.Register(CliffyPromptService, () => new CliffyPromptService());
    ioc.Register(UrlOpener, () => new UrlOpener());
  });

export default GitIntentTestCLI;
