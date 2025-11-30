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

import { CLIDFSContextManager, Command, CommandParams } from '@fathym/cli';
import { z } from 'zod';
import { ConfigFileService } from '../../../src/services/ConfigFileService.ts';

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
    const configDfs = await dfsCtx.GetConfigDFS();

    // Try to resolve from IoC (allows override), fallback to default
    let configService: ConfigFileService;
    try {
      configService = await ioc.Resolve(ConfigFileService);
    } catch {
      configService = new ConfigFileService(configDfs);
    }

    return { configService };
  })
  .Run(async ({ Params, Services, Log }) => {
    await Services.configService.set(Params.FilePath, Params.Key, Params.Value);
    Log.Info(`Set ${Params.Key} in ${Params.FilePath}`);
  });
