import { DFSFileHandler } from '@fathym/dfs';

/**
 * Service for reading and writing JSON config files with dot-notation key support.
 */
export class ConfigFileService {
  constructor(protected dfs: DFSFileHandler) {}

  /**
   * Get a value from a config file using dot-notation key.
   */
  async get<T = unknown>(filePath: string, key: string): Promise<T | undefined> {
    const config = await this.load(filePath);
    return this.getNestedValue(config, key) as T | undefined;
  }

  /**
   * Set a value in a config file using dot-notation key.
   */
  async set(filePath: string, key: string, value: unknown): Promise<void> {
    const config = await this.load(filePath);
    this.setNestedValue(config, key, value);
    await this.save(filePath, config);
  }

  /**
   * Load the entire config file.
   */
  async load(filePath: string): Promise<Record<string, unknown>> {
    try {
      const fullPath = await this.dfs.ResolvePath(filePath);
      const content = await Deno.readTextFile(fullPath);
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Save the entire config file.
   */
  async save(filePath: string, config: Record<string, unknown>): Promise<void> {
    const fullPath = await this.dfs.ResolvePath(filePath);
    await Deno.writeTextFile(fullPath, JSON.stringify(config, null, 2));
  }

  protected getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<unknown>(
      (o, k) => (o as Record<string, unknown>)?.[k],
      obj,
    );
  }

  protected setNestedValue(
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
}
