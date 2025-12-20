/**
 * Set a value in a JSON config file stored in ConfigDFS.
 *
 * @example Set a simple key
 * ```bash
 * ftm cli config set config.json AZURE_AI_FOUNDRY_API_KEY "my-secret-key"
 * ```
 *
 * @example Set a nested key using dot-notation
 * ```bash
 * ftm cli config set config.json azure.ai.apiKey "my-secret-key"
 * # Creates: { "azure": { "ai": { "apiKey": "my-secret-key" } } }
 * ```
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import { z } from 'zod';
import { ConfigFileService } from '../../../src/services/ConfigFileService.ts';

/**
 * Result data for the config set command.
 */
export interface ConfigSetResult {
  /** The config file path */
  file: string;
  /** The key that was set */
  key: string;
  /** The value that was set */
  value: string;
}

const ArgsSchema = z.tuple([
  z.string().describe('Config file path (relative to ConfigDFS)'),
  z.string().describe('Key (dot-notation, e.g., "azure.apiKey")'),
  z.string().describe('Value to set'),
]);

const FlagsSchema = z.object({});

class ConfigSetParams extends CommandParams<
  z.infer<typeof ArgsSchema>,
  z.infer<typeof FlagsSchema>
> {
  get FilePath(): string {
    return this.Args[0];
  }
  get Key(): string {
    return this.Args[1];
  }
  get Value(): string {
    return this.Args[2];
  }
}

export default Command('cli/config/set', 'Set a value in a JSON config file')
  .Args(ArgsSchema)
  .Flags(FlagsSchema)
  .Params(ConfigSetParams)
  .Services(async (_ctx, ioc) => {
    const dfsCtx = await ioc.Resolve(CLIDFSContextManager);

    // Create ConfigFileService if ConfigDFS is available.
    // If not (e.g., in tests), the service will be provided via WithServices().
    let configService: ConfigFileService | undefined;
    try {
      const configDfs = await dfsCtx.GetConfigDFS();
      configService = new ConfigFileService(configDfs);
    } catch {
      // ConfigDFS not registered - service will be provided via WithServices() in tests
    }

    return { configService: configService! };
  })
  .Run(async ({ Params, Services, Log }): Promise<CommandStatus<ConfigSetResult>> => {
    await Services.configService.set(Params.FilePath, Params.Key, Params.Value);
    Log.Info(`Set ${Params.Key} in ${Params.FilePath}`);

    return {
      Code: 0,
      Message: `Set ${Params.Key} in ${Params.FilePath}`,
      Data: { file: Params.FilePath, key: Params.Key, value: Params.Value },
    };
  });
