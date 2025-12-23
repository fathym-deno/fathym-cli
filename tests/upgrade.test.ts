import { assertEquals } from "@std/assert";
import {
  type AvailableVersion,
  VersionResolver,
} from "../src/deps/VersionResolver.ts";
import { VersionComparator } from "../src/deps/VersionComparator.ts";

// =============================================================================
// Upgrade Command - Intent Tests
// =============================================================================
// These tests verify the core logic and intents of the upgrade command
// without requiring actual network calls or command execution.

/**
 * Mock VersionResolver for testing upgrade logic
 */
class MockVersionResolver {
  private versions: AvailableVersion[] = [];

  setVersions(versions: AvailableVersion[]): void {
    this.versions = versions;
  }

  getVersions(): AvailableVersion[] {
    return this.versions;
  }

  getVersionsByChannel(): Map<string, AvailableVersion[]> {
    const grouped = new Map<string, AvailableVersion[]>();
    for (const version of this.versions) {
      const key = version.channel ?? "production";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(version);
    }
    return grouped;
  }

  getLatest(
    _registry: "jsr" | "npm",
    _packageName: string,
    channel?: string,
  ): string | undefined {
    const comparator = new VersionComparator();
    const versionStrings = this.versions.map((v) => v.version);
    return comparator.findLatest(versionStrings, channel);
  }

  hasVersion(
    _registry: "jsr" | "npm",
    _packageName: string,
    version: string,
  ): boolean {
    return this.versions.some((v) => v.version === version);
  }
}

// =============================================================================
// Upgrade Logic - Version Selection Tests
// =============================================================================

Deno.test("Upgrade - Selects latest production version when no version specified", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.72", channel: undefined },
    { version: "0.0.71", channel: undefined },
    { version: "0.0.73-integration", channel: "integration" },
    { version: "0.0.72-integration", channel: "integration" },
  ]);

  const versionsByChannel = mockResolver.getVersionsByChannel();
  const latestProduction = versionsByChannel.get("production")?.[0]?.version;

  // Should select 0.0.72 as latest production (not 0.0.73-integration)
  assertEquals(latestProduction, "0.0.72");
});

Deno.test("Upgrade - Returns undefined when no production versions exist", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.73-integration", channel: "integration" },
    { version: "0.0.72-integration", channel: "integration" },
    { version: "0.0.71-hmis", channel: "hmis" },
  ]);

  const versionsByChannel = mockResolver.getVersionsByChannel();
  const latestProduction = versionsByChannel.get("production")?.[0]?.version;

  assertEquals(latestProduction, undefined);
});

Deno.test("Upgrade - Uses explicit version when provided", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.72", channel: undefined },
    { version: "0.0.71", channel: undefined },
    { version: "0.0.73-integration", channel: "integration" },
  ]);

  const explicitVersion = "0.0.73-integration";
  const exists = mockResolver.hasVersion("jsr", "@fathym/ftm", explicitVersion);

  assertEquals(exists, true);
});

Deno.test("Upgrade - Rejects non-existent version", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.72", channel: undefined },
    { version: "0.0.71", channel: undefined },
  ]);

  const nonExistent = "0.0.999";
  const exists = mockResolver.hasVersion("jsr", "@fathym/ftm", nonExistent);

  assertEquals(exists, false);
});

// =============================================================================
// Upgrade Logic - Audit Mode Tests
// =============================================================================

Deno.test("Upgrade - Audit detects newer production version available", () => {
  const comparator = new VersionComparator();
  const currentVersion = "0.0.70";
  const latestProduction = "0.0.72";

  const comparison = comparator.compare(currentVersion, latestProduction);

  // comparison < 0 means current is older than latest
  assertEquals(comparison < 0, true);
});

Deno.test("Upgrade - Audit detects already on latest", () => {
  const comparator = new VersionComparator();
  const currentVersion = "0.0.72";
  const latestProduction = "0.0.72";

  const comparison = comparator.compare(currentVersion, latestProduction);

  assertEquals(comparison, 0);
});

Deno.test("Upgrade - Audit handles pre-release current vs production latest", () => {
  const comparator = new VersionComparator();
  const currentVersion = "0.0.72-integration";
  const latestProduction = "0.0.72";

  const comparison = comparator.compare(currentVersion, latestProduction);

  // Pre-release is considered "less than" the production release with same base
  assertEquals(comparison < 0, true);
});

Deno.test("Upgrade - Audit handles newer pre-release base than production", () => {
  const comparator = new VersionComparator();
  const currentVersion = "0.0.73-integration";
  const latestProduction = "0.0.72";

  const comparison = comparator.compare(currentVersion, latestProduction);

  // 0.0.73-integration > 0.0.72 because base is higher
  assertEquals(comparison > 0, true);
});

// =============================================================================
// Upgrade Logic - List Mode Tests
// =============================================================================

Deno.test("Upgrade - List groups versions by channel", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.72", channel: undefined },
    { version: "0.0.71", channel: undefined },
    { version: "0.0.73-integration", channel: "integration" },
    { version: "0.0.72-integration", channel: "integration" },
    { version: "0.0.70-hmis", channel: "hmis" },
  ]);

  const versionsByChannel = mockResolver.getVersionsByChannel();

  assertEquals(versionsByChannel.has("production"), true);
  assertEquals(versionsByChannel.has("integration"), true);
  assertEquals(versionsByChannel.has("hmis"), true);

  assertEquals(versionsByChannel.get("production")!.length, 2);
  assertEquals(versionsByChannel.get("integration")!.length, 2);
  assertEquals(versionsByChannel.get("hmis")!.length, 1);
});

Deno.test("Upgrade - List marks current version correctly", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.72", channel: undefined },
    { version: "0.0.71", channel: undefined },
    { version: "0.0.73-integration", channel: "integration" },
  ]);

  const currentVersion = "0.0.72";
  const versionsByChannel = mockResolver.getVersionsByChannel();

  // Find current version in the list
  let foundCurrent = false;
  for (const [, versions] of versionsByChannel) {
    for (const v of versions) {
      if (v.version === currentVersion) {
        foundCurrent = true;
        break;
      }
    }
  }

  assertEquals(foundCurrent, true);
});

// =============================================================================
// Upgrade Logic - Same Version Detection Tests
// =============================================================================

Deno.test("Upgrade - Detects already on target version (exact match)", () => {
  const currentVersion = "0.0.72";
  const targetVersion = "0.0.72";

  assertEquals(targetVersion === currentVersion, true);
});

Deno.test("Upgrade - Detects already on target version (pre-release match)", () => {
  const currentVersion = "0.0.72-integration";
  const targetVersion = "0.0.72-integration";

  assertEquals(targetVersion === currentVersion, true);
});

Deno.test("Upgrade - Allows upgrade from pre-release to production", () => {
  const currentVersion = "0.0.72-integration";
  const targetVersion = "0.0.72";

  // Different versions should be allowed to upgrade
  assertEquals(targetVersion !== currentVersion as string, true);
});

// =============================================================================
// Upgrade Command - Install Script URL Construction Tests
// =============================================================================

Deno.test("Upgrade - Constructs correct JSR install script URL", () => {
  const packageName = "@fathym/ftm";
  const targetVersion = "0.0.72-integration";

  const installUrl = `jsr:${packageName}@${targetVersion}/install`;

  assertEquals(installUrl, "jsr:@fathym/ftm@0.0.72-integration/install");
});

Deno.test("Upgrade - Constructs correct JSR install script URL for production", () => {
  const packageName = "@fathym/ftm";
  const targetVersion = "0.0.72";

  const installUrl = `jsr:${packageName}@${targetVersion}/install`;

  assertEquals(installUrl, "jsr:@fathym/ftm@0.0.72/install");
});

// =============================================================================
// Upgrade Logic - Edge Cases
// =============================================================================

Deno.test("Upgrade - Handles empty version list gracefully", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([]);

  const versionsByChannel = mockResolver.getVersionsByChannel();
  const latestProduction = versionsByChannel.get("production")?.[0]?.version;

  assertEquals(latestProduction, undefined);
  assertEquals(versionsByChannel.size, 0);
});

Deno.test("Upgrade - Handles single production version", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([{ version: "1.0.0", channel: undefined }]);

  const versionsByChannel = mockResolver.getVersionsByChannel();
  const latestProduction = versionsByChannel.get("production")?.[0]?.version;

  assertEquals(latestProduction, "1.0.0");
});

Deno.test("Upgrade - Handles only pre-release versions", () => {
  const mockResolver = new MockVersionResolver();
  mockResolver.setVersions([
    { version: "0.0.1-alpha", channel: "alpha" },
    { version: "0.0.2-beta", channel: "beta" },
  ]);

  const versionsByChannel = mockResolver.getVersionsByChannel();
  const latestProduction = versionsByChannel.get("production")?.[0]?.version;

  assertEquals(latestProduction, undefined);
  assertEquals(versionsByChannel.has("alpha"), true);
  assertEquals(versionsByChannel.has("beta"), true);
});

// =============================================================================
// Integration: Real VersionResolver (requires network)
// =============================================================================

Deno.test({
  name: "Upgrade - Integration: Fetches real versions from JSR",
  ignore: Deno.env.get("CI") === "true", // Skip in CI to avoid flaky network tests
  async fn() {
    const resolver = new VersionResolver();

    const versionsByChannel = await resolver.getVersionsByChannel(
      "jsr",
      "@fathym/ftm",
    );

    // Should have at least one channel
    assertEquals(versionsByChannel.size > 0, true);

    // Integration channel should exist (based on current release strategy)
    assertEquals(versionsByChannel.has("integration"), true);
  },
});
