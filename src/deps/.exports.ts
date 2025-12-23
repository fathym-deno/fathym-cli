/**
 * Dependencies management utilities.
 *
 * This module provides tools for parsing, analyzing, and upgrading
 * dependencies in both import maps (deno.jsonc) and direct specifier
 * files (*.deps.ts).
 *
 * @module
 */

export { DepsFileParser, type DepsReference } from "./DepsFileParser.ts";
export { type ParsedVersion, VersionComparator } from "./VersionComparator.ts";
export {
  type AvailableVersion,
  type JsrMetaResponse,
  type NpmRegistryResponse,
  VersionResolver,
} from "./VersionResolver.ts";
