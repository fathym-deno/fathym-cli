/**
 * Version resolver for querying JSR and npm registries.
 *
 * This module provides utilities for fetching available package versions
 * from the JSR and npm registries.
 *
 * ## Registry Endpoints
 *
 * - **JSR**: `https://jsr.io/@scope/package/meta.json`
 * - **npm**: `https://registry.npmjs.org/package-name`
 *
 * @module
 */

import { VersionComparator } from './VersionComparator.ts';

/**
 * Represents an available version from a registry.
 */
export interface AvailableVersion {
  /** Version string */
  version: string;

  /** Channel name if this is a pre-release (e.g., 'integration') */
  channel?: string;

  /** When this version was published */
  publishedAt?: Date;

  /** Whether this version has been yanked/deprecated */
  yanked?: boolean;
}

/**
 * Response structure from JSR meta.json endpoint.
 */
export interface JsrMetaResponse {
  /** Package scope */
  scope: string;

  /** Package name */
  name: string;

  /** Latest stable version */
  latest: string;

  /** Map of version to version info */
  versions: Record<
    string,
    {
      yanked?: boolean;
      createdAt?: string;
    }
  >;
}

/**
 * Response structure from npm registry endpoint.
 */
export interface NpmRegistryResponse {
  /** Package name */
  name: string;

  /** Distribution tags (latest, next, etc.) */
  'dist-tags': Record<string, string>;

  /** Map of version to package metadata */
  versions: Record<
    string,
    {
      name: string;
      version: string;
      deprecated?: string;
    }
  >;

  /** Publishing times by version */
  time?: Record<string, string>;
}

/**
 * Options for version resolution.
 */
export interface ResolveOptions {
  /** Fetch timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Whether to include yanked/deprecated versions (default: false) */
  includeYanked?: boolean;
}

/**
 * Resolver for fetching package versions from registries.
 *
 * @example Get all versions of a JSR package
 * ```typescript
 * const resolver = new VersionResolver();
 * const versions = await resolver.getVersions('jsr', '@fathym/common');
 *
 * for (const v of versions) {
 *   console.log(`${v.version} (${v.channel ?? 'production'})`);
 * }
 * ```
 *
 * @example Get latest version with a specific channel
 * ```typescript
 * const latest = await resolver.getLatest('jsr', '@fathym/eac', 'integration');
 * console.log(`Latest integration: ${latest}`);
 * ```
 */
export class VersionResolver {
  private comparator = new VersionComparator();
  private cache = new Map<string, AvailableVersion[]>();

  /**
   * Clear the version cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get all available versions for a package.
   *
   * @param registry - Registry type ('jsr' or 'npm')
   * @param packageName - Full package name (e.g., '@fathym/common' or 'zod')
   * @param options - Resolution options
   * @returns Array of available versions, sorted newest first
   */
  async getVersions(
    registry: 'jsr' | 'npm',
    packageName: string,
    options: ResolveOptions = {},
  ): Promise<AvailableVersion[]> {
    const cacheKey = `${registry}:${packageName}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let versions: AvailableVersion[];

    if (registry === 'jsr') {
      versions = await this.fetchJsrVersions(packageName, options);
    } else {
      versions = await this.fetchNpmVersions(packageName, options);
    }

    // Sort by version descending
    versions.sort((a, b) => -this.comparator.compare(a.version, b.version));

    // Cache the results
    this.cache.set(cacheKey, versions);

    return versions;
  }

  /**
   * Get the latest version matching criteria.
   *
   * @param registry - Registry type
   * @param packageName - Package name
   * @param channel - Optional channel filter (undefined = production)
   * @param options - Resolution options
   * @returns Latest version string or undefined if not found
   */
  async getLatest(
    registry: 'jsr' | 'npm',
    packageName: string,
    channel?: string,
    options: ResolveOptions = {},
  ): Promise<string | undefined> {
    const versions = await this.getVersions(registry, packageName, options);
    const versionStrings = versions.map((v) => v.version);
    return this.comparator.findLatest(versionStrings, channel);
  }

  /**
   * Get versions grouped by channel.
   *
   * @param registry - Registry type
   * @param packageName - Package name
   * @param options - Resolution options
   * @returns Map of channel (or 'production') to version list
   */
  async getVersionsByChannel(
    registry: 'jsr' | 'npm',
    packageName: string,
    options: ResolveOptions = {},
  ): Promise<Map<string, AvailableVersion[]>> {
    const versions = await this.getVersions(registry, packageName, options);
    const grouped = new Map<string, AvailableVersion[]>();

    for (const version of versions) {
      const key = version.channel ?? 'production';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(version);
    }

    return grouped;
  }

  /**
   * Check if a specific version exists.
   *
   * @param registry - Registry type
   * @param packageName - Package name
   * @param version - Version to check
   * @param options - Resolution options
   * @returns true if version exists
   */
  async hasVersion(
    registry: 'jsr' | 'npm',
    packageName: string,
    version: string,
    options: ResolveOptions = {},
  ): Promise<boolean> {
    const versions = await this.getVersions(registry, packageName, options);
    return versions.some((v) => v.version === version);
  }

  /**
   * Fetch versions from JSR registry.
   */
  private async fetchJsrVersions(
    packageName: string,
    options: ResolveOptions,
  ): Promise<AvailableVersion[]> {
    // Build URL: https://jsr.io/@scope/name/meta.json
    const url = `https://jsr.io/${packageName}/meta.json`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Package not found: ${packageName}`);
      }
      throw new Error(
        `Failed to fetch JSR package ${packageName}: ${response.status}`,
      );
    }

    const data = (await response.json()) as JsrMetaResponse;
    const versions: AvailableVersion[] = [];

    for (const [version, info] of Object.entries(data.versions)) {
      // Skip yanked versions unless requested
      if (info.yanked && !options.includeYanked) {
        continue;
      }

      const parsed = this.comparator.parse(version);

      versions.push({
        version,
        channel: parsed.channel,
        publishedAt: info.createdAt ? new Date(info.createdAt) : undefined,
        yanked: info.yanked,
      });
    }

    return versions;
  }

  /**
   * Fetch versions from npm registry.
   */
  private async fetchNpmVersions(
    packageName: string,
    options: ResolveOptions,
  ): Promise<AvailableVersion[]> {
    // Build URL: https://registry.npmjs.org/package-name
    // Handle scoped packages
    const encodedName = packageName.startsWith('@') ? packageName.replace('/', '%2F') : packageName;

    const url = `https://registry.npmjs.org/${encodedName}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Package not found: ${packageName}`);
      }
      throw new Error(
        `Failed to fetch npm package ${packageName}: ${response.status}`,
      );
    }

    const data = (await response.json()) as NpmRegistryResponse;
    const versions: AvailableVersion[] = [];

    for (const [version, info] of Object.entries(data.versions)) {
      // Skip deprecated versions unless requested
      if (info.deprecated && !options.includeYanked) {
        continue;
      }

      const parsed = this.comparator.parse(version);

      versions.push({
        version,
        channel: parsed.channel,
        publishedAt: data.time?.[version] ? new Date(data.time[version]) : undefined,
        yanked: !!info.deprecated,
      });
    }

    return versions;
  }
}
