/**
 * Version comparison utilities with channel awareness.
 *
 * This module provides tools for comparing semantic versions that may include
 * pre-release channel suffixes like `-integration`, `-hmis`, etc.
 *
 * ## Version Format
 *
 * Versions follow the semver format with optional channel suffix:
 * - `1.2.3` - Production version
 * - `1.2.3-integration` - Integration channel
 * - `1.2.3-hmis` - HMIS feature branch
 * - `1.2.3-rc.1` - Release candidate
 *
 * ## Comparison Logic
 *
 * When comparing versions:
 * 1. Parse base version (major.minor.patch)
 * 2. Compare base versions numerically
 * 3. If base versions are equal, production > pre-release
 * 4. If both are pre-release, compare channel strings
 *
 * @module
 */

import { compare, parse, type SemVer } from '@std/semver';

/**
 * Represents a parsed version with channel information.
 */
export interface ParsedVersion {
  /** Original version string */
  original: string;

  /** Base version without channel (e.g., '0.2.299') */
  base: string;

  /** Parsed semver representation */
  semver: SemVer;

  /** Channel name if present (e.g., 'integration'), undefined for production */
  channel?: string;

  /** Whether this is a production (non-pre-release) version */
  isProduction: boolean;
}

/**
 * Version comparison utility with channel awareness.
 *
 * @example Basic comparison
 * ```typescript
 * const comparator = new VersionComparator();
 *
 * // Compare two versions
 * comparator.compare('0.2.299', '0.2.300'); // -1 (a < b)
 * comparator.compare('0.2.300', '0.2.299'); // 1 (a > b)
 * comparator.compare('0.2.299', '0.2.299'); // 0 (equal)
 * ```
 *
 * @example Channel-aware comparison
 * ```typescript
 * // Production is newer than same base with channel
 * comparator.compare('0.2.299', '0.2.299-integration'); // 1
 *
 * // Different base versions
 * comparator.compare('0.2.299', '0.2.300-integration'); // -1
 * ```
 *
 * @example Check if upgrade is beneficial
 * ```typescript
 * comparator.isNewer('0.2.299', '0.2.300-integration'); // true
 * comparator.isNewer('0.2.299', '0.2.298-integration'); // false
 * ```
 */
export class VersionComparator {
  /**
   * Parse a version string into its components.
   *
   * @param version - Version string (e.g., '0.2.299-integration')
   * @returns Parsed version with channel info
   * @throws Error if version cannot be parsed
   */
  parse(version: string): ParsedVersion {
    // Try to parse directly with semver
    try {
      const semver = parse(version);

      // Extract channel from prerelease if present
      let channel: string | undefined;
      let base: string;

      if (semver.prerelease && semver.prerelease.length > 0) {
        // Join all prerelease parts to form the channel
        channel = semver.prerelease.map(String).join('.');
        base = `${semver.major}.${semver.minor}.${semver.patch}`;
      } else {
        base = `${semver.major}.${semver.minor}.${semver.patch}`;
      }

      return {
        original: version,
        base,
        semver,
        channel,
        isProduction: !channel,
      };
    } catch {
      // If semver parsing fails, try manual parsing for non-standard formats
      return this.parseManually(version);
    }
  }

  /**
   * Manually parse versions that don't conform to strict semver.
   */
  private parseManually(version: string): ParsedVersion {
    // Split on first hyphen to separate base and channel
    const hyphenIndex = version.indexOf('-');

    let base: string;
    let channel: string | undefined;

    if (hyphenIndex !== -1) {
      base = version.substring(0, hyphenIndex);
      channel = version.substring(hyphenIndex + 1);
    } else {
      base = version;
    }

    // Parse base version
    const parts = base.split('.').map(Number);
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;

    // Create a semver-compatible representation
    const semver: SemVer = {
      major,
      minor,
      patch,
      prerelease: channel ? [channel] : [],
      build: [],
    };

    return {
      original: version,
      base: `${major}.${minor}.${patch}`,
      semver,
      channel,
      isProduction: !channel,
    };
  }

  /**
   * Compare two versions.
   *
   * @param a - First version
   * @param b - Second version
   * @returns -1 if a < b, 0 if equal, 1 if a > b
   */
  compare(a: string, b: string): number {
    const parsedA = this.parse(a);
    const parsedB = this.parse(b);

    // Use semver compare which handles prerelease correctly
    return compare(parsedA.semver, parsedB.semver);
  }

  /**
   * Check if candidate version is newer than current version.
   *
   * This is the primary method for upgrade decisions.
   *
   * @param current - Current version in use
   * @param candidate - Candidate version to upgrade to
   * @returns true if candidate is strictly newer than current
   */
  isNewer(current: string, candidate: string): boolean {
    return this.compare(current, candidate) < 0;
  }

  /**
   * Find the latest version from a list, optionally filtering by channel.
   *
   * @param versions - List of version strings
   * @param channel - Optional channel to filter by (undefined = production only)
   * @returns Latest version matching criteria, or undefined if none match
   */
  findLatest(versions: string[], channel?: string): string | undefined {
    let candidates: string[];

    if (channel === undefined) {
      // Production only - no prerelease
      candidates = versions.filter((v) => {
        const parsed = this.parse(v);
        return parsed.isProduction;
      });
    } else {
      // Specific channel
      candidates = versions.filter((v) => {
        const parsed = this.parse(v);
        return parsed.channel === channel;
      });
    }

    if (candidates.length === 0) return undefined;

    // Sort descending and return first
    return candidates.sort((a, b) => -this.compare(a, b))[0];
  }

  /**
   * Get all versions that match a specific channel.
   *
   * @param versions - List of version strings
   * @param channel - Channel to match (undefined = production)
   * @returns Versions matching the channel, sorted newest first
   */
  getVersionsByChannel(versions: string[], channel?: string): string[] {
    const matching = versions.filter((v) => {
      const parsed = this.parse(v);
      if (channel === undefined) {
        return parsed.isProduction;
      }
      return parsed.channel === channel;
    });

    return matching.sort((a, b) => -this.compare(a, b));
  }

  /**
   * Extract the channel from a version string.
   *
   * @param version - Version string
   * @returns Channel name or undefined if production
   */
  getChannel(version: string): string | undefined {
    return this.parse(version).channel;
  }

  /**
   * Check if a version has a specific channel.
   *
   * @param version - Version string
   * @param channel - Channel to check for (undefined = production)
   * @returns true if version has the specified channel
   */
  hasChannel(version: string, channel?: string): boolean {
    const parsed = this.parse(version);
    if (channel === undefined) {
      return parsed.isProduction;
    }
    return parsed.channel === channel;
  }

  /**
   * Build a version string from components.
   *
   * @param base - Base version (e.g., '0.2.300')
   * @param channel - Optional channel suffix
   * @returns Combined version string
   */
  buildVersion(base: string, channel?: string): string {
    if (!channel) return base;
    return `${base}-${channel}`;
  }
}
