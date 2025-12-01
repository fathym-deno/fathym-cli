import type { CLIInitFn } from '@fathym/cli';

/**
 * CLI initialization hook for the Fathym CLI.
 *
 * This file is loaded by the CLI framework to configure the IoC container
 * before commands run. It can register custom services or override defaults.
 */
export default (async (_ioc, _config) => {
  // No custom registrations needed - the CLI framework provides defaults
  // for TemplateLocator and other core services
}) as CLIInitFn;
