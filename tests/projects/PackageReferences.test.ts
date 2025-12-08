import { assertEquals, assertExists } from '@std/assert';
import { MemoryDFSFileHandler } from '@fathym/dfs/handlers';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';
import {
  ALWAYS_SKIP_DIRS,
  findPackageReferences,
  getSourceType,
  REFERENCE_FILE_PATTERNS,
  upgradePackageReferences,
} from '../../src/projects/PackageReferences.ts';

/**
 * Test helper to create a memory DFS with project files
 */
async function createTestDFS(files: Record<string, string>): Promise<MemoryDFSFileHandler> {
  const handler = new MemoryDFSFileHandler({});
  for (const [path, content] of Object.entries(files)) {
    await handler.WriteFile(path, content);
  }
  return handler;
}

/**
 * Test helper to read a file from DFS (uses GetFileInfo API)
 */
async function readDFSFile(dfs: MemoryDFSFileHandler, path: string): Promise<string> {
  const fileInfo = await dfs.GetFileInfo(path);
  if (!fileInfo) {
    throw new Error(`File not found: ${path}`);
  }
  return await new Response(fileInfo.Contents).text();
}

// =============================================================================
// getSourceType() Tests
// =============================================================================

Deno.test('getSourceType - returns "config" for deno.json files', () => {
  assertEquals(getSourceType('/projects/app/deno.json'), 'config');
  assertEquals(getSourceType('/projects/app/deno.jsonc'), 'config');
  assertEquals(getSourceType('deno.json'), 'config');
  assertEquals(getSourceType('deno.jsonc'), 'config');
});

Deno.test('getSourceType - returns "deps" for .deps.ts files', () => {
  assertEquals(getSourceType('/projects/app/src/mod.deps.ts'), 'deps');
  assertEquals(getSourceType('main.deps.ts'), 'deps');
  assertEquals(getSourceType('/lib/external.deps.ts'), 'deps');
});

Deno.test('getSourceType - returns "template" for .hbs files', () => {
  assertEquals(getSourceType('/templates/init/deno.jsonc.hbs'), 'template');
  assertEquals(getSourceType('config.hbs'), 'template');
});

Deno.test('getSourceType - returns "docs" for .md and .mdx files', () => {
  assertEquals(getSourceType('/docs/getting-started.md'), 'docs');
  assertEquals(getSourceType('/docs/api-reference.mdx'), 'docs');
  assertEquals(getSourceType('README.md'), 'docs');
});

Deno.test('getSourceType - returns "other" for other file types', () => {
  assertEquals(getSourceType('/src/main.ts'), 'other');
  assertEquals(getSourceType('/components/Button.tsx'), 'other');
  assertEquals(getSourceType('/lib/utils.js'), 'other');
});

// =============================================================================
// Constants Tests
// =============================================================================

Deno.test('REFERENCE_FILE_PATTERNS - contains expected patterns', () => {
  // Verify we have patterns for deps, templates, docs, and source files
  assertEquals(REFERENCE_FILE_PATTERNS.length >= 4, true);

  // Test that patterns match expected files
  const depsPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test('main.deps.ts'));
  const hbsPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test('config.hbs'));
  const mdPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test('README.md'));
  const tsPattern = REFERENCE_FILE_PATTERNS.find((p) => p.test('main.ts'));

  assertExists(depsPattern);
  assertExists(hbsPattern);
  assertExists(mdPattern);
  assertExists(tsPattern);
});

Deno.test('ALWAYS_SKIP_DIRS - contains common skip directories', () => {
  assertEquals(ALWAYS_SKIP_DIRS.includes('.git'), true);
  assertEquals(ALWAYS_SKIP_DIRS.includes('node_modules'), true);
  assertEquals(ALWAYS_SKIP_DIRS.includes('.deno'), true);
});

// =============================================================================
// findPackageReferences() Tests
// =============================================================================

Deno.test('findPackageReferences - finds references in deno.jsonc imports', async () => {
  const dfs = await createTestDFS({
    '/projects/app1/deno.jsonc': JSON.stringify({
      name: '@test/app1',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78-integration',
      },
    }),
    '/projects/app2/deno.jsonc': JSON.stringify({
      name: '@test/app2',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.77',
        '@fathym/eac': 'jsr:@fathym/eac@0.0.50',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences('@fathym/dfs', resolver);

  assertEquals(refs.length, 2);

  const app1Ref = refs.find((r) => r.file.includes('app1'));
  const app2Ref = refs.find((r) => r.file.includes('app2'));

  assertExists(app1Ref);
  assertExists(app2Ref);
  assertEquals(app1Ref.currentVersion, '0.0.78-integration');
  assertEquals(app2Ref.currentVersion, '0.0.77');
  assertEquals(app1Ref.source, 'config');
  assertEquals(app2Ref.source, 'config');
});

Deno.test('findPackageReferences - finds references in .deps.ts files', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
    }),
    '/projects/app/src/main.deps.ts': `
export * from 'jsr:@fathym/dfs@0.0.78-integration';
export type { FileInfo } from 'jsr:@fathym/dfs@0.0.78-integration/types';
`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences('@fathym/dfs', resolver);

  // Should find both references in the deps file
  const depsRefs = refs.filter((r) => r.source === 'deps');
  assertEquals(depsRefs.length >= 1, true);
  assertEquals(depsRefs[0].currentVersion, '0.0.78-integration');
});

Deno.test('findPackageReferences - finds references in .hbs template files', async () => {
  const dfs = await createTestDFS({
    '/projects/cli/deno.jsonc': JSON.stringify({
      name: '@test/cli',
      exports: { '.': './mod.ts' },
    }),
    '/projects/cli/templates/init/deno.jsonc.hbs': `{
  "name": "{{name}}",
  "imports": {
    "@fathym/dfs": "jsr:@fathym/dfs@0.0.78-integration"
  }
}`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences('@fathym/dfs', resolver);

  const templateRefs = refs.filter((r) => r.source === 'template');
  assertEquals(templateRefs.length, 1);
  assertEquals(templateRefs[0].currentVersion, '0.0.78-integration');
});

Deno.test('findPackageReferences - finds references in .md documentation files', async () => {
  const dfs = await createTestDFS({
    '/projects/docs/deno.jsonc': JSON.stringify({
      name: '@test/docs',
      exports: { '.': './mod.ts' },
    }),
    '/projects/docs/content/getting-started.md': `
# Getting Started

Install the package:

\`\`\`bash
deno add jsr:@fathym/dfs@0.0.78-integration
\`\`\`
`,
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences('@fathym/dfs', resolver);

  const docRefs = refs.filter((r) => r.source === 'docs');
  assertEquals(docRefs.length, 1);
  assertEquals(docRefs[0].currentVersion, '0.0.78-integration');
});

Deno.test('findPackageReferences - returns empty array for non-existent package', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences('@nonexistent/package', resolver);

  assertEquals(refs.length, 0);
});

Deno.test('findPackageReferences - records correct line numbers', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify(
      {
        name: '@test/app',
        exports: { '.': './mod.ts' },
        imports: {
          '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
        },
      },
      null,
      2,
    ),
  });

  const resolver = new DFSProjectResolver(dfs);
  const refs = await findPackageReferences('@fathym/dfs', resolver);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].line > 0, true); // Line number should be positive
});

// =============================================================================
// upgradePackageReferences() Tests
// =============================================================================

Deno.test('upgradePackageReferences - upgrades all references in dry-run mode', async () => {
  const dfs = await createTestDFS({
    '/projects/app1/deno.jsonc': JSON.stringify({
      name: '@test/app1',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
      },
    }),
    '/projects/app2/deno.jsonc': JSON.stringify({
      name: '@test/app2',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.77',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80-release',
    dryRun: true,
  });

  assertEquals(results.length, 2);
  assertEquals(results.every((r) => r.success), true);
  assertEquals(results.every((r) => r.newVersion === '0.0.80-release'), true);

  // Verify files were NOT modified (dry-run)
  const app1Content = await readDFSFile(dfs, '/projects/app1/deno.jsonc');
  assertEquals(app1Content.includes('0.0.78'), true);
  assertEquals(app1Content.includes('0.0.80-release'), false);
});

Deno.test('upgradePackageReferences - upgrades all references when not dry-run', async () => {
  const dfs = await createTestDFS({
    '/projects/app1/deno.jsonc': JSON.stringify({
      name: '@test/app1',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
      },
    }),
    '/projects/app2/deno.jsonc': JSON.stringify({
      name: '@test/app2',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.77',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80-release',
    dryRun: false,
  });

  assertEquals(results.length, 2);
  assertEquals(results.every((r) => r.success), true);

  // Verify files WERE modified
  const app1Content = await readDFSFile(dfs, '/projects/app1/deno.jsonc');
  const app2Content = await readDFSFile(dfs, '/projects/app2/deno.jsonc');

  assertEquals(app1Content.includes('0.0.80-release'), true);
  assertEquals(app2Content.includes('0.0.80-release'), true);
  assertEquals(app1Content.includes('0.0.78'), false);
  assertEquals(app2Content.includes('0.0.77'), false);
});

Deno.test('upgradePackageReferences - filters by source type', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
      },
    }),
    '/projects/app/src/main.deps.ts': `export * from 'jsr:@fathym/dfs@0.0.78';`,
  });

  const resolver = new DFSProjectResolver(dfs);

  // Filter to only config files
  const configResults = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80',
    dryRun: true,
    filter: 'config',
  });

  assertEquals(configResults.length, 1);
  assertEquals(configResults[0].source, 'config');

  // Filter to only deps files
  const depsResults = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80',
    dryRun: true,
    filter: 'deps',
  });

  assertEquals(depsResults.length, 1);
  assertEquals(depsResults[0].source, 'deps');
});

Deno.test('upgradePackageReferences - returns correct old and new versions', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78-integration',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80-release',
    dryRun: true,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].oldVersion, '0.0.78-integration');
  assertEquals(results[0].newVersion, '0.0.80-release');
});

Deno.test('upgradePackageReferences - handles multiple references in same file', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
        '@fathym/dfs/handlers': 'jsr:@fathym/dfs@0.0.78/handlers',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80',
    dryRun: false,
  });

  // Should find both references
  assertEquals(results.length >= 1, true);

  // Verify both were upgraded in the file
  const content = await readDFSFile(dfs, '/projects/app/deno.jsonc');
  assertEquals(content.includes('jsr:@fathym/dfs@0.0.80'), true);
  assertEquals(content.includes('jsr:@fathym/dfs@0.0.78'), false);
});

Deno.test('upgradePackageReferences - returns empty results for no matches', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/eac': 'jsr:@fathym/eac@0.0.50',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80',
    dryRun: true,
  });

  assertEquals(results.length, 0);
});

// =============================================================================
// Edge Cases
// =============================================================================

Deno.test('upgradePackageReferences - handles scoped package names with special characters', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/eac-applications': 'jsr:@fathym/eac-applications@0.0.45',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const results = await upgradePackageReferences('@fathym/eac-applications', resolver, {
    version: '0.0.50-release',
    dryRun: false,
  });

  assertEquals(results.length, 1);
  assertEquals(results[0].success, true);

  const content = await readDFSFile(dfs, '/projects/app/deno.jsonc');
  assertEquals(content.includes('jsr:@fathym/eac-applications@0.0.50-release'), true);
});

Deno.test('upgradePackageReferences - preserves other content in files', async () => {
  const originalContent = JSON.stringify(
    {
      name: '@test/app',
      version: '1.0.0',
      exports: { '.': './mod.ts' },
      imports: {
        '@fathym/dfs': 'jsr:@fathym/dfs@0.0.78',
        '@std/path': 'jsr:@std/path@1.0.0',
      },
      tasks: {
        build: 'deno task compile',
        test: 'deno test -A',
      },
    },
    null,
    2,
  );

  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': originalContent,
  });

  const resolver = new DFSProjectResolver(dfs);
  await upgradePackageReferences('@fathym/dfs', resolver, {
    version: '0.0.80',
    dryRun: false,
  });

  const newContent = await readDFSFile(dfs, '/projects/app/deno.jsonc');

  // Verify other content is preserved
  assertEquals(newContent.includes('"name": "@test/app"'), true);
  assertEquals(newContent.includes('"version": "1.0.0"'), true);
  assertEquals(newContent.includes('@std/path@1.0.0'), true);
  assertEquals(newContent.includes('"build": "deno task compile"'), true);

  // Verify @fathym/dfs was upgraded
  assertEquals(newContent.includes('jsr:@fathym/dfs@0.0.80'), true);
  assertEquals(newContent.includes('jsr:@fathym/dfs@0.0.78'), false);
});
