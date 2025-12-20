/**
 * Get a value from a JSON config file stored in ConfigDFS.
 *
 * @example Get a simple key
 * ```bash
 * ftm cli config get config.json AZURE_AI_FOUNDRY_API_KEY
 * ```
 *
 * @example Get a nested key using dot-notation
 * ```bash
 * ftm cli config get config.json azure.ai.apiKey
 * # Returns the value at: { "azure": { "ai": { "apiKey": "..." } } }
 * ```
 *
 * @module
 */

import { CLIDFSContextManager, Command, CommandParams, type CommandStatus } from '@fathym/cli';
import { z } from 'zod';
import { ConfigFileService } from '../../../src/services/ConfigFileService.ts';

/**
 * Result data for the config get command.
 */
export interface ConfigGetResult {
  /** The config file path */
  file: string;
  /** The key that was requested */
  key: string;
  /** The value at the key (undefined if not found) */
  value: unknown;
  /** Whether the key was found */
  found: boolean;
}

const ArgsSchema = z.tuple([
  z.string().describe('Config file path (relative to ConfigDFS)'),
  z.string().describe('Key (dot-notation, e.g., "azure.apiKey")'),
]);

const FlagsSchema = z.object({});

class ConfigGetParams extends CommandParams<
  z.infer<typeof ArgsSchema>,
  z.infer<typeof FlagsSchema>
> {
  get FilePath(): string {
    return this.Args[0];
  }
  get Key(): string {
    return this.Args[1];
  }
}

export default Command('cli/config/get', 'Get a value from a JSON config file')
  .Args(ArgsSchema)
  .Flags(FlagsSchema)
  .Params(ConfigGetParams)
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
  .Run(async ({ Params, Services, Log }): Promise<CommandStatus<ConfigGetResult>> => {
    const value = await Services.configService.get(Params.FilePath, Params.Key);
    const found = value !== undefined;

    if (!found) {
      Log.Info(`Key "${Params.Key}" not found in ${Params.FilePath}`);
    } else {
      Log.Info(JSON.stringify(value, null, 2));
    }

    return {
      Code: 0,
      Message: found ? `Found ${Params.Key}` : `Key "${Params.Key}" not found`,
      Data: { file: Params.FilePath, key: Params.Key, value, found },
    };
  });
