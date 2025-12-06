// Re-export InstallService for use by install.ts script
export {
  consoleLogger,
  detectTarget,
  expandHome,
  findBinary,
  getBinaryExtension,
  installBinary,
  type InstallBinaryOptions,
  type InstallLogger,
} from '../services/InstallService.ts';
