import { assertEquals, assertExists } from "@std/assert";
import { MemoryDFSFileHandler } from "@fathym/dfs/handlers";
import { DFSProjectResolver } from "../../src/projects/ProjectResolver.ts";
import {
  ALWAYS_SKIP_DIRS,
  findPackageReferences,
  getSourceType,
  REFERENCE_FILE_PATTERNS,
  upgradePackageReferences,
} from "../../src/projects/PackageReferences.ts";

/**
 * Test helper to create a memory DFS with project files
 */
async function createTestDFS(
  files: Record<string, string>,
): Promise<MemoryDFSFileHandler> {
  const handler = new MemoryDFSFileHandler({});
  for (const [path, content] of Object.entries(files)) {
    await handler.WriteFile(path, content);
  }
  return handler;
}

/**
 * Test helper to read a file from DFS (uses GetFileInfo API)
 */
async function readDFSFile(
  dfs: MemoryDFSFileHandler,
  path: string,
): Promise<string> {
  const fileInfo = await dfs.GetFileInfo(path);
  if (!fileInfo) {
    throw new Error(`File not found: ${path}`);
  }
  return await new Response(fileInfo.Contents).text();
}

// =============================================================================
// Test Constants - Use fictional packages to avoid version drift
// =============================================================================

/**
 * IMPORTANT: These tests use fictional package names (@test/pkg, @test/lib, etc.)
 * and arbitrary version strings. This ensures tests are:
 * 1. Self-contained - no external dependencies
 * 2. Stable - won't break when real packages are upgraded
 * 3. Clear - obvious what's being tested vs production data
 *
 * DO NOT use real @fathym/* package names or versions in tests.
 */
const TEST_PKG = "@test/pkg";
const TEST_PKG_V1 = "1.0.0";
const TEST_PKG_V2 = "2.0.0";
const TEST_PKG_V1_TAG = "1.0.0-alpha";

// =============================================================================
// getSourceType() Tests
// =============================================================================

Deno.test('getSourceType - returns "config" for deno.json files', () => {
  assertEquals(getSourceType("/projects/app/deno.json"), "config");
  assertEquals(getSourceType("/projects/app/deno.jsonc"), "config");
  assertEquals(getSourceType("deno.json"), "config");
  assertEquals(getSourceType("deno.jsonc"), "config");
});

Deno.test('getSourceType - returns "deps" for .deps.ts files', () => {
  assertEquals(getSourceType("/projects/app/src/mod.deps.ts"), "deps");
  assertEquals(getSourceType("main.deps.ts"), "deps");
  assertEquals(getSourceType("/lib/external.deps.ts"), "deps");
});

Deno.test('getSourceType - returns "template" for .hbs files', () => {
  assertEquals(getSourceType("/templates/init/deno.jsonc.hbs"), "template");
  assertEquals(getSourceType("config.hbs"), "template");
});

Deno.test('getSourceType - returns "docs" for .md and .mdx files', () => {
  assertEquals(getSourceType("/docs/getting-started.md"), "docs");
  assertEquals(getSourceType("/docs/api-reference.mdx"), "docs");
  assertEquals(getSourceType("README.md"), "docs");
});

Deno.test('getSourceType - returns "other" for other file types', () => {
  assertEquals(getSourceType("/src/main.ts"), "other");
  assertEquals(getSourceType("/components/Button.tsx"), "other");
  assertEquals(getSourceType("/lib/utils.js"), "other");
});

// =============================================================================
// Constants Tests
// =============================================================================

Deno.test("REFERENCE_FILE_PATTERNS - contains expected patterns", () => {
  // Verify we have patterns for deps, templates, docs, and source files
  assertEquals(REFERENCE_FILE_PATTERNS.length >= 4, true);

  // Test that patterns match expected files
  const depsPattern = REFERENCE_FILE_PATTERNS.find((p) =>
    p.test("main.deps.ts")
  );
  const hbsPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test("config.hbs"));
  const mdPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test("README.md"));
  const tsPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test("main.ts"));

  assertExists(depsPattern);
  assertExists(hbsPattern);
  assertExists(mdPattern);
  assertExists(tsPattern);
});

Deno.test("ALWAYS_SKIP_DIRS - contains common skip directories", () => {
  assertEquals(ALWAYS_SKIP_DIRS.includes(".git"), true);
  assertEquals(ALWAYS_SKIP_DIRS.includes("node_modules"), true);
  assertEquals(ALWAYS_SKIP_DIRS.includes(".deno"), true);
});

// =============================================================================
// findPackageReferences() Tests
// =============================================================================

Deno.test("findPackageReferences - finds references in deno.jsonc imports", async () => {
  const dfs = await createTestDFS({
    "/projects/app1/deno.jsonc": JSON.stringify({
      name: "@test/app1",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
    "/projects/app2/deno.jsonc": JSON.stringify({
      name: "@test/app2",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
        "@test/other": "jsr:@test/other@1.0.0",
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  assertEquals(refs.length, 2);

  const app1Ref = refs.find((r) => r.file.includes("app1"));
  const app2Ref = refs.find((r) => r.file.includes("app2"));

  assertExists(app1Ref);
  assertExists(app2Ref);
  assertEquals(app1Ref.currentVersion, TEST_PKG_V1);
  assertEquals(app2Ref.currentVersion, TEST_PKG_V1);
  assertEquals(app1Ref.source, "config");
  assertEquals(app2Ref.source, "config");
});

Deno.test("findPackageReferences - finds references in .deps.ts files", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
    }),
    "/projects/app/src/main.deps.ts": `
export * from 'jsr:${TEST_PKG}@${TEST_PKG_V1}';
export type { FileInfo } from 'jsr:${TEST_PKG}@${TEST_PKG_V1}';
`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  // Should find both references in the deps file
  const depsRefs = refs.filter((r) => r.source === "deps");
  assertEquals(depsRefs.length >= 1, true);
  assertEquals(depsRefs[0].currentVersion, TEST_PKG_V1);
});

Deno.test("findPackageReferences - finds references in .hbs template files", async () => {
  const dfs = await createTestDFS({
    "/projects/cli/deno.jsonc": JSON.stringify({
      name: "@test/cli",
      exports: { ".": "./mod.ts" },
    }),
    "/projects/cli/templates/init/deno.jsonc.hbs": `{
  "name": "{{name}}",
  "imports": {
    "${TEST_PKG}": "jsr:${TEST_PKG}@${TEST_PKG_V1}"
  }
}`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  const templateRefs = refs.filter((r) => r.source === "template");
  assertEquals(templateRefs.length, 1);
  assertEquals(templateRefs[0].currentVersion, TEST_PKG_V1);
});

Deno.test("findPackageReferences - finds references in .md documentation files", async () => {
  const dfs = await createTestDFS({
    "/projects/docs/deno.jsonc": JSON.stringify({
      name: "@test/docs",
      exports: { ".": "./mod.ts" },
    }),
    "/projects/docs/content/getting-started.md": `
# Getting Started

Install the package:

\`\`\`bash
deno add jsr:${TEST_PKG}@${TEST_PKG_V1}
\`\`\`
`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  const docRefs = refs.filter((r) => r.source === "docs");
  assertEquals(docRefs.length, 1);
  assertEquals(docRefs[0].currentVersion, TEST_PKG_V1);
});

Deno.test("findPackageReferences - returns empty array for non-existent package", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences("@nonexistent/package", resolver);

  assertEquals(refs.length, 0);
});

Deno.test("findPackageReferences - records correct line numbers", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify(
      {
        name: "@test/app",
        exports: { ".": "./mod.ts" },
        imports: {
          [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
        },
      },
      null,
      2,
    ),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].line > 0, true); // Line number should be positive
});

// =============================================================================
// upgradePackageReferences() Tests
// =============================================================================

Deno.test("upgradePackageReferences - upgrades all references in dry-run mode", async () => {
  const dfs = await createTestDFS({
    "/projects/app1/deno.jsonc": JSON.stringify({
      name: "@test/app1",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
    "/projects/app2/deno.jsonc": JSON.stringify({
      name: "@test/app2",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: true,
  });

  assertEquals(results.length, 2);
  assertEquals(results.every((r) => r.success), true);
  assertEquals(results.every((r) => r.newVersion === TEST_PKG_V2), true);

  // Verify files were NOT modified (dry-run)
  const app1Content = await readDFSFile(dfs, "/projects/app1/deno.jsonc");
  assertEquals(app1Content.includes(TEST_PKG_V1), true);
  assertEquals(app1Content.includes(TEST_PKG_V2), false);
});

Deno.test("upgradePackageReferences - upgrades all references when not dry-run", async () => {
  const dfs = await createTestDFS({
    "/projects/app1/deno.jsonc": JSON.stringify({
      name: "@test/app1",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
    "/projects/app2/deno.jsonc": JSON.stringify({
      name: "@test/app2",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  assertEquals(results.length, 2);
  assertEquals(results.every((r) => r.success), true);

  // Verify files WERE modified
  const app1Content = await readDFSFile(dfs, "/projects/app1/deno.jsonc");
  const app2Content = await readDFSFile(dfs, "/projects/app2/deno.jsonc");

  assertEquals(app1Content.includes(TEST_PKG_V2), true);
  assertEquals(app2Content.includes(TEST_PKG_V2), true);
  assertEquals(app1Content.includes(TEST_PKG_V1), false);
  assertEquals(app2Content.includes(TEST_PKG_V1), false);
});

Deno.test("upgradePackageReferences - excludes references from specified projects", async () => {
  const dfs = await createTestDFS({
    // The package project itself (should be excluded from upgrades)
    "/projects/pkg/deno.jsonc": JSON.stringify({
      name: TEST_PKG,
      exports: { ".": "./mod.ts" },
    }),
    "/projects/pkg/src/mod.deps.ts":
      `export * from 'jsr:${TEST_PKG}@${TEST_PKG_V1}';`,

    // A consuming project (should be upgraded)
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
    excludeProjectFilter: [TEST_PKG],
  });

  // Only the consuming project should be upgraded
  assertEquals(results.length, 1);
  assertEquals(results[0].projectName, "@test/app");

  const pkgDeps = await readDFSFile(dfs, "/projects/pkg/src/mod.deps.ts");
  assertEquals(pkgDeps.includes(TEST_PKG_V1), true);
  assertEquals(pkgDeps.includes(TEST_PKG_V2), false);

  const appConfig = await readDFSFile(dfs, "/projects/app/deno.jsonc");
  assertEquals(appConfig.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}`), true);
  assertEquals(appConfig.includes(`jsr:${TEST_PKG}@${TEST_PKG_V1}`), false);
});

Deno.test("upgradePackageReferences - filters by source type", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
    "/projects/app/src/main.deps.ts":
      `export * from 'jsr:${TEST_PKG}@${TEST_PKG_V1}';`,
  });

  const resolver = new DFSProjectResolver(dfs);

  // Filter to only config files
  const configResults = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: true,
    sourceFilter: "config",
  });

  assertEquals(configResults.length, 1);
  assertEquals(configResults[0].source, "config");

  // Filter to only deps files
  const depsResults = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: true,
    sourceFilter: "deps",
  });

  assertEquals(depsResults.length, 1);
  assertEquals(depsResults[0].source, "deps");
});

Deno.test("upgradePackageReferences - returns correct old and new versions", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: true,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].oldVersion, TEST_PKG_V1);
  assertEquals(results[0].newVersion, TEST_PKG_V2);
});

Deno.test("upgradePackageReferences - handles multiple references in same file", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
        [`${TEST_PKG}/handlers`]: `jsr:${TEST_PKG}@${TEST_PKG_V1}/handlers`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  // Should find both references (bare and with subpath)
  assertEquals(results.length >= 1, true);

  // Verify both were upgraded in the file
  const content = await readDFSFile(dfs, "/projects/app/deno.jsonc");
  // New version should be present (bare and with subpath preserved)
  assertEquals(content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}`), true);
  assertEquals(
    content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}/handlers`),
    true,
  );
  // Old version should be gone
  assertEquals(content.includes(TEST_PKG_V1), false);
});

Deno.test("upgradePackageReferences - returns empty results for no matches", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        "@test/other": "jsr:@test/other@1.0.0",
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: true,
  });

  assertEquals(results.length, 0);
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test("upgradePackageReferences - handles scoped package names with special characters", async () => {
  // Use a fictional package with hyphens to test regex escaping
  const specialPkg = "@test/pkg-with-hyphens";
  const specialV1 = "1.0.0";
  const specialV2 = "2.0.0-release";

  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [specialPkg]: `jsr:${specialPkg}@${specialV1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(specialPkg, resolver, {
    version: specialV2,
    dryRun: false,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const content = await readDFSFile(dfs, "/projects/app/deno.jsonc");
  assertEquals(content.includes(`jsr:${specialPkg}@${specialV2}`), true);
});

Deno.test("upgradePackageReferences - preserves other content in files", async () => {
  const originalContent = JSON.stringify(
    {
      name: "@test/app",
      version: "1.0.0",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
        "@std/path": "jsr:@std/path@1.0.0",
      },
      tasks: {
        build: "deno task compile",
        test: "deno test -A",
      },
    },
    null,
    2,
  );

  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": originalContent,
  });

  const resolver = new DFSProjectResolver(dfs);
  await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  const newContent = await readDFSFile(dfs, "/projects/app/deno.jsonc");

  // Verify other content is preserved
  assertEquals(newContent.includes('"name": "@test/app"'), true);
  assertEquals(newContent.includes('"version": "1.0.0"'), true);
  assertEquals(newContent.includes("@std/path@1.0.0"), true);
  assertEquals(newContent.includes('"build": "deno task compile"'), true);

  // Verify test package was upgraded
  assertEquals(newContent.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}`), true);
  assertEquals(newContent.includes(`jsr:${TEST_PKG}@${TEST_PKG_V1}`), false);
});

// =============================================================================
// TDD Tests: Export Barrel / Subpath Preservation (BUG FIX)
// =============================================================================

Deno.test("upgradePackageReferences - upgrades bare imports without subpaths (baseline)", async () => {
  // Baseline test: Ensure imports WITHOUT subpaths continue to work
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const content = await readDFSFile(dfs, "/projects/app/deno.jsonc");

  // Bare import should be upgraded
  assertEquals(
    content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}`),
    true,
    `Expected bare import to be upgraded. Got: ${content}`,
  );
  // Should NOT have the old version
  assertEquals(content.includes(`@${TEST_PKG_V1}`), false);
  // Should NOT accidentally add a subpath
  assertEquals(
    content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}"`),
    true,
    `Bare import should end with version and quote, no trailing subpath. Got: ${content}`,
  );
});

Deno.test("upgradePackageReferences - preserves export barrel subpaths like /build", async () => {
  // Bug: When upgrading jsr:@test/pkg@1.0.0/build to 2.0.0,
  // the /build subpath is lost, resulting in jsr:@test/pkg@2.0.0
  // Expected: jsr:@test/pkg@2.0.0/build
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [`${TEST_PKG}/build`]: `jsr:${TEST_PKG}@${TEST_PKG_V1}/build`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const content = await readDFSFile(dfs, "/projects/app/deno.jsonc");

  // The subpath /build MUST be preserved
  assertEquals(
    content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}/build`),
    true,
    `Expected subpath /build to be preserved. Got: ${content}`,
  );
  // Old version should be gone
  assertEquals(content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V1}/build`), false);
});

Deno.test("upgradePackageReferences - preserves deep export barrel subpaths like /handlers/memory", async () => {
  // Test with deeper subpaths
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [`${TEST_PKG}/handlers/memory`]:
          `jsr:${TEST_PKG}@${TEST_PKG_V1}/handlers/memory`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const content = await readDFSFile(dfs, "/projects/app/deno.jsonc");

  // Deep subpath MUST be preserved
  assertEquals(
    content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V2}/handlers/memory`),
    true,
    `Expected subpath /handlers/memory to be preserved. Got: ${content}`,
  );
  assertEquals(
    content.includes(`jsr:${TEST_PKG}@${TEST_PKG_V1}/handlers/memory`),
    false,
  );
});

Deno.test("upgradePackageReferences - handles mixed imports with and without subpaths", async () => {
  // Test that both bare imports and subpath imports are handled correctly
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
        [`${TEST_PKG}/build`]: `jsr:${TEST_PKG}@${TEST_PKG_V1}/build`,
        [`${TEST_PKG}/handlers`]: `jsr:${TEST_PKG}@${TEST_PKG_V1}/handlers`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  const content = await readDFSFile(dfs, "/projects/app/deno.jsonc");

  // All three should be upgraded correctly
  assertEquals(
    content.includes(`"jsr:${TEST_PKG}@${TEST_PKG_V2}"`),
    true,
    `Expected bare import to be upgraded. Got: ${content}`,
  );
  assertEquals(
    content.includes(`"jsr:${TEST_PKG}@${TEST_PKG_V2}/build"`),
    true,
    `Expected /build subpath to be preserved. Got: ${content}`,
  );
  assertEquals(
    content.includes(`"jsr:${TEST_PKG}@${TEST_PKG_V2}/handlers"`),
    true,
    `Expected /handlers subpath to be preserved. Got: ${content}`,
  );

  // Old versions should all be gone
  assertEquals(content.includes(`@${TEST_PKG_V1}`), false);
});

Deno.test("upgradePackageReferences - preserves subpaths in .deps.ts files", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
    }),
    "/projects/app/src/main.deps.ts": `
export * from 'jsr:${TEST_PKG}@${TEST_PKG_V1}/build';
export type { FileInfo } from 'jsr:${TEST_PKG}@${TEST_PKG_V1}/types';
`,
  });

  const resolver = new DFSProjectResolver(dfs);
  await upgradePackageReferences(TEST_PKG, resolver, {
    version: TEST_PKG_V2,
    dryRun: false,
  });

  const content = await readDFSFile(dfs, "/projects/app/src/main.deps.ts");

  assertEquals(
    content.includes(`'jsr:${TEST_PKG}@${TEST_PKG_V2}/build'`),
    true,
    `Expected /build subpath to be preserved in .deps.ts. Got: ${content}`,
  );
  assertEquals(
    content.includes(`'jsr:${TEST_PKG}@${TEST_PKG_V2}/types'`),
    true,
    `Expected /types subpath to be preserved in .deps.ts. Got: ${content}`,
  );
  assertEquals(content.includes(`@${TEST_PKG_V1}`), false);
});

Deno.test("findPackageReferences - correctly captures version without subpath when subpath exists", async () => {
  // Verify that the currentVersion field does NOT include the subpath
  // The subpath should be preserved during upgrade, but version detection should be accurate
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [`${TEST_PKG}/build`]: `jsr:${TEST_PKG}@${TEST_PKG_V1_TAG}/build`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  assertEquals(refs.length, 1);
  // The currentVersion should be just the version, not including subpath
  // Currently it might incorrectly include "/build" as part of the version
  assertEquals(
    refs[0].currentVersion,
    TEST_PKG_V1_TAG,
    `Expected currentVersion to be just the version, not include subpath. Got: ${
      refs[0].currentVersion
    }`,
  );
});

// =============================================================================
// TDD Tests: Relative Path Requirements
// =============================================================================

Deno.test("findPackageReferences - returns relative file paths", async () => {
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  assertEquals(refs.length, 1);
  // file should be relative, not absolute
  assertEquals(refs[0].file, "projects/app/deno.jsonc");
  // Should NOT start with drive letter or /
  assertEquals(refs[0].file.includes(":"), false);
  assertEquals(refs[0].file.startsWith("/"), false);
});

// =============================================================================
// TDD Tests: Project Name Enhancement
// =============================================================================

Deno.test("findPackageReferences - includes projectName for each reference", async () => {
  // Enhancement: PackageReference should include the project name from the
  // deno.json(c) file so consumers know which project contains the reference.
  const dfs = await createTestDFS({
    "/projects/app1/deno.jsonc": JSON.stringify({
      name: "@test/app1",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
    "/projects/app2/deno.jsonc": JSON.stringify({
      name: "@test/app2",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  assertEquals(refs.length, 2);

  const app1Ref = refs.find((r) => r.file.includes("app1"));
  const app2Ref = refs.find((r) => r.file.includes("app2"));

  assertExists(app1Ref);
  assertExists(app2Ref);

  // NEW: Each reference should include the project name
  assertEquals(app1Ref.projectName, "@test/app1");
  assertEquals(app2Ref.projectName, "@test/app2");
});

Deno.test("findPackageReferences - only includes files within resolved projects", async () => {
  // Files that aren't in a project directory should NOT be included
  // since every reference must have a projectName
  const dfs = await createTestDFS({
    "/projects/app/deno.jsonc": JSON.stringify({
      name: "@test/app",
      exports: { ".": "./mod.ts" },
      imports: {
        [TEST_PKG]: `jsr:${TEST_PKG}@${TEST_PKG_V1}`,
      },
    }),
    // A .deps.ts file in the root, not inside any project - should be excluded
    "/standalone/utils.deps.ts":
      `export * from 'jsr:${TEST_PKG}@${TEST_PKG_V1}';`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  // Should NOT find the reference in standalone/utils.deps.ts (no project context)
  const standaloneRef = refs.find((r) => r.file.includes("standalone"));
  assertEquals(
    standaloneRef,
    undefined,
    "Files outside projects should not be included",
  );

  // Should find the reference in the project
  const appRef = refs.find((r) => r.file.includes("app"));
  assertExists(appRef);
  assertEquals(appRef.projectName, "@test/app");
});

Deno.test("findPackageReferences - projectName populated for nested files within project", async () => {
  // Files nested within a project directory should inherit the project's name
  const dfs = await createTestDFS({
    "/projects/cli/deno.jsonc": JSON.stringify({
      name: "@test/cli",
      exports: { ".": "./mod.ts" },
    }),
    "/projects/cli/src/commands/build.deps.ts":
      `export * from 'jsr:${TEST_PKG}@${TEST_PKG_V1}';`,
    "/projects/cli/templates/init.hbs":
      `"${TEST_PKG}": "jsr:${TEST_PKG}@${TEST_PKG_V1}"`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences(TEST_PKG, resolver);

  // All refs from within /projects/cli should have projectName '@test/cli'
  for (const ref of refs) {
    if (ref.file.startsWith("projects/cli/")) {
      assertEquals(
        ref.projectName,
        "@test/cli",
        `Expected projectName '@test/cli' for file ${ref.file}`,
      );
    }
  }
});
