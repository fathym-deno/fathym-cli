import { assertEquals } from '@std/assert';
import { MemoryDFSFileHandler } from '@fathym/dfs/handlers';
import { DFSProjectResolver } from '../src/projects/ProjectResolver.ts';

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

// =============================================================================
// Task Command - ProjectResolver Integration Tests
// =============================================================================

Deno.test('Task - Resolver finds project by package name with tasks', async () => {
  const dfs = await createTestDFS({
    '/projects/myapp/deno.jsonc': JSON.stringify({
      name: '@test/myapp',
      exports: { '.': './mod.ts' },
      tasks: {
        build: 'deno task compile',
        test: 'deno test -A',
        dev: 'deno run -A --watch',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/myapp');

  assertEquals(projects.length, 1);
  assertEquals(projects[0].name, '@test/myapp');
  assertEquals(Object.hasOwn(projects[0].tasks!, 'build'), true);
  assertEquals(Object.hasOwn(projects[0].tasks!, 'test'), true);
  assertEquals(Object.hasOwn(projects[0].tasks!, 'dev'), true);
});

Deno.test('Task - Resolver finds project by directory path with tasks', async () => {
  const dfs = await createTestDFS({
    '/projects/ref-arch/deno.jsonc': JSON.stringify({
      name: '@test/ref-arch',
      exports: { '.': './mod.ts' },
      tasks: {
        'publish:check': 'deno publish --dry-run',
        build: 'deno task compile',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/ref-arch');

  assertEquals(projects.length, 1);
  assertEquals(projects[0].tasks!['publish:check'], 'deno publish --dry-run');
});

Deno.test('Task - Resolver finds project by explicit config path', async () => {
  const dfs = await createTestDFS({
    '/projects/cli/deno.jsonc': JSON.stringify({
      name: '@test/cli',
      exports: { '.': './mod.ts' },
      tasks: {
        'ftm:release': 'deno run -A scripts/release.ts',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/cli/deno.jsonc');

  assertEquals(projects.length, 1);
  assertEquals(
    projects[0].tasks!['ftm:release'],
    'deno run -A scripts/release.ts',
  );
});

Deno.test('Task - Returns empty array for non-existent project', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@nonexistent/package');

  assertEquals(projects.length, 0);
});

Deno.test('Task - Returns multiple projects when directory has multiple', async () => {
  const dfs = await createTestDFS({
    '/projects/libs/lib1/deno.jsonc': JSON.stringify({
      name: '@test/lib1',
      exports: { '.': './mod.ts' },
      tasks: { build: 'deno task compile' },
    }),
    '/projects/libs/lib2/deno.jsonc': JSON.stringify({
      name: '@test/lib2',
      exports: { '.': './mod.ts' },
      tasks: { build: 'deno task compile' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/libs');

  assertEquals(projects.length, 2);
});

Deno.test('Task - Project with no tasks returns empty tasks object', async () => {
  const dfs = await createTestDFS({
    '/projects/empty/deno.jsonc': JSON.stringify({
      name: '@test/empty',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/empty');

  assertEquals(projects.length, 1);
  assertEquals(Object.keys(projects[0].tasks!).length, 0);
});

Deno.test('Task - Validates task exists in project', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
      tasks: {
        build: 'deno task compile',
        test: 'deno test -A',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/app');

  assertEquals(projects.length, 1);

  // Task exists
  assertEquals(Object.hasOwn(projects[0].tasks!, 'build'), true);
  assertEquals(Object.hasOwn(projects[0].tasks!, 'test'), true);

  // Task doesn't exist
  assertEquals(Object.hasOwn(projects[0].tasks!, 'nonexistent'), false);
});
