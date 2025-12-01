/**
 * Reference to a project discovered in the workspace.
 *
 * Represents a deno.json(c) project with its location and metadata.
 */
export type ProjectRef = {
  /** Package name from deno.json(c), if defined */
  name?: string;

  /** Absolute path to the project directory */
  dir: string;

  /** Absolute path to the deno.json(c) config file */
  configPath: string;

  /** Whether the project has a 'dev' task defined */
  hasDev?: boolean;

  /** All tasks defined in deno.json(c) */
  tasks?: Record<string, string>;
};
