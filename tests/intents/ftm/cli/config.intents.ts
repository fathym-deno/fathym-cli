import { CommandIntents } from '@fathym/cli';
import ConfigSetCommand from '../../../../commands/cli/config/set.ts';
import ConfigGetCommand from '../../../../commands/cli/config/get.ts';
import type { ConfigFileService } from '../../../../src/services/ConfigFileService.ts';

// Config intents test the config set/get commands using mocked ConfigFileService.
// This avoids needing actual ConfigDFS registration in tests.

// Mock in-memory config store for testing
const mockConfigStore: Record<string, Record<string, unknown>> = {};

function createMockConfigService(): ConfigFileService {
  return {
    get<T = unknown>(filePath: string, key: string): Promise<T | undefined> {
      const config = mockConfigStore[filePath] ?? {};
      return Promise.resolve(getNestedValue(config, key) as T | undefined);
    },
    set(filePath: string, key: string, value: unknown): Promise<void> {
      if (!mockConfigStore[filePath]) {
        mockConfigStore[filePath] = {};
      }
      setNestedValue(mockConfigStore[filePath], key, value);
      return Promise.resolve();
    },
    load(filePath: string): Promise<Record<string, unknown>> {
      return Promise.resolve(mockConfigStore[filePath] ?? {});
    },
    save(filePath: string, config: Record<string, unknown>): Promise<void> {
      mockConfigStore[filePath] = config;
      return Promise.resolve();
    },
  } as ConfigFileService;
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (o, k) => (o as Record<string, unknown>)?.[k],
    obj,
  );
}

function setNestedValue(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const keys = key.split('.');
  const last = keys.pop()!;
  let current = obj;
  for (const k of keys) {
    if (!(k in current) || typeof current[k] !== 'object') {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }
  current[last] = value;
}

const CONFIG_FILE = 'test-config.json';

CommandIntents(
  'Config Set Command Suite',
  ConfigSetCommand.Build(),
  import.meta.resolve('../../../../.cli.json'),
)
  .BeforeAll(() => {
    // Clear mock store before tests
    for (const key in mockConfigStore) {
      delete mockConfigStore[key];
    }
  })
  .Intent('Set a simple key', (int) =>
    int
      .Args([CONFIG_FILE, 'API_KEY', 'my-secret-key'])
      .WithServices({ configService: createMockConfigService() })
      .ExpectLogs('Set API_KEY in test-config.json')
      .ExpectExit(0))
  .Intent('Set a nested key using dot-notation', (int) =>
    int
      .Args([CONFIG_FILE, 'azure.ai.apiKey', 'nested-secret'])
      .WithServices({ configService: createMockConfigService() })
      .ExpectLogs('Set azure.ai.apiKey in test-config.json')
      .ExpectExit(0))
  .Run();

CommandIntents(
  'Config Get Command Suite',
  ConfigGetCommand.Build(),
  import.meta.resolve('../../../../.cli.json'),
)
  .BeforeAll(() => {
    // Pre-populate mock store with test data
    mockConfigStore[CONFIG_FILE] = {
      API_KEY: 'test-api-key',
      azure: {
        ai: {
          apiKey: 'azure-ai-key',
          endpoint: 'https://example.azure.com',
        },
      },
    };
  })
  .Intent('Get a simple key', (int) =>
    int
      .Args([CONFIG_FILE, 'API_KEY'])
      .WithServices({ configService: createMockConfigService() })
      .ExpectLogs('"test-api-key"')
      .ExpectExit(0))
  .Intent('Get a nested key using dot-notation', (int) =>
    int
      .Args([CONFIG_FILE, 'azure.ai.apiKey'])
      .WithServices({ configService: createMockConfigService() })
      .ExpectLogs('"azure-ai-key"')
      .ExpectExit(0))
  .Intent('Get a non-existent key', (int) =>
    int
      .Args([CONFIG_FILE, 'nonexistent.key'])
      .WithServices({ configService: createMockConfigService() })
      .ExpectLogs('Key "nonexistent.key" not found')
      .ExpectExit(0))
  .Run();
