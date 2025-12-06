import { assertEquals, assertExists } from '@std/assert';
import { MemoryDFSFileHandler } from '@fathym/dfs/handlers';
import { DFSProjectResolver } from '../../src/projects/ProjectResolver.ts';

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

// =============================================================================
// DFSProjectResolver.Resolve() Tests
// =============================================================================

Deno.test('DFSProjectResolver - Resolve with no ref returns all projects', async () => {
  const dfs = await createTestDFS({
    '/projects/app1/deno.jsonc': JSON.stringify({
      name: '@test/app1',
      exports: { '.': './mod.ts' },
    }),
    '/projects/app2/deno.jsonc': JSON.stringify({
      name: '@test/app2',
      exports: { '.': './mod.ts' },
    }),
    '/other/deno.jsonc': JSON.stringify({
      name: '@test/other',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve();

  assertEquals(projects.length, 3);
});

Deno.test('DFSProjectResolver - Resolve by direct deno.jsonc path', async () => {
  const dfs = await createTestDFS({
    '/projects/myapp/deno.jsonc': JSON.stringify({
      name: '@test/myapp',
      exports: { '.': './mod.ts' },
      tasks: { dev: 'deno run dev.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/myapp/deno.jsonc');

  assertEquals(projects.length, 1);
  assertEquals(projects[0].name, '@test/myapp');
  assertEquals(projects[0].hasDev, true);
});

Deno.test('DFSProjectResolver - Resolve by directory path', async () => {
  const dfs = await createTestDFS({
    '/projects/myapp/deno.jsonc': JSON.stringify({
      name: '@test/myapp',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/myapp');

  assertEquals(projects.length, 1);
  assertEquals(projects[0].name, '@test/myapp');
});

Deno.test('DFSProjectResolver - Resolve by package name', async () => {
  const dfs = await createTestDFS({
    '/projects/app1/deno.jsonc': JSON.stringify({
      name: '@test/app1',
      exports: { '.': './mod.ts' },
    }),
    '/projects/app2/deno.jsonc': JSON.stringify({
      name: '@test/app2',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/app2');

  assertEquals(projects.length, 1);
  assertEquals(projects[0].name, '@test/app2');
});

Deno.test('DFSProjectResolver - Resolve directory with multiple projects', async () => {
  const dfs = await createTestDFS({
    '/projects/libs/lib1/deno.jsonc': JSON.stringify({
      name: '@test/lib1',
      exports: { '.': './mod.ts' },
    }),
    '/projects/libs/lib2/deno.jsonc': JSON.stringify({
      name: '@test/lib2',
      exports: { '.': './mod.ts' },
    }),
    '/projects/apps/app1/deno.jsonc': JSON.stringify({
      name: '@test/app1',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/libs');

  assertEquals(projects.length, 2);
  const names = projects.map((p) => p.name).sort();
  assertEquals(names, ['@test/lib1', '@test/lib2']);
});

Deno.test('DFSProjectResolver - Resolve skips node_modules', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
    }),
    '/projects/app/node_modules/dep/deno.jsonc': JSON.stringify({
      name: 'dep',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve();

  assertEquals(projects.length, 1);
  assertEquals(projects[0].name, '@test/app');
});

Deno.test('DFSProjectResolver - Resolve returns empty array for non-existent ref', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/nonexistent');

  assertEquals(projects.length, 0);
});

Deno.test('DFSProjectResolver - Resolve with includeNameless option', async () => {
  const dfs = await createTestDFS({
    '/projects/named/deno.jsonc': JSON.stringify({
      name: '@test/named',
      exports: { '.': './mod.ts' },
    }),
    '/projects/unnamed/deno.jsonc': JSON.stringify({
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);

  // With includeNameless: true (default)
  const allProjects = await resolver.Resolve();
  assertEquals(allProjects.length, 2);

  // With includeNameless: false
  const namedOnly = await resolver.Resolve(undefined, {
    includeNameless: false,
  });
  assertEquals(namedOnly.length, 1);
  assertEquals(namedOnly[0].name, '@test/named');
});

Deno.test('DFSProjectResolver - Resolve detects hasDev correctly', async () => {
  const dfs = await createTestDFS({
    '/projects/with-dev/deno.jsonc': JSON.stringify({
      name: '@test/with-dev',
      exports: { '.': './mod.ts' },
      tasks: { dev: 'deno run dev.ts', build: 'deno task build' },
    }),
    '/projects/no-dev/deno.jsonc': JSON.stringify({
      name: '@test/no-dev',
      exports: { '.': './mod.ts' },
      tasks: { build: 'deno task build' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve();

  const withDev = projects.find((p) => p.name === '@test/with-dev');
  const noDev = projects.find((p) => p.name === '@test/no-dev');

  assertExists(withDev);
  assertExists(noDev);
  assertEquals(withDev.hasDev, true);
  assertEquals(noDev.hasDev, false);
});

Deno.test('DFSProjectResolver - Resolve handles deno.json (not just jsonc)', async () => {
  const dfs = await createTestDFS({
    '/projects/json-app/deno.json': JSON.stringify({
      name: '@test/json-app',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/json-app');

  assertEquals(projects.length, 1);
  assertEquals(projects[0].name, '@test/json-app');
});

Deno.test('DFSProjectResolver - Resolve populates tasks field', async () => {
  const dfs = await createTestDFS({
    '/projects/with-tasks/deno.jsonc': JSON.stringify({
      name: '@test/with-tasks',
      exports: { '.': './mod.ts' },
      tasks: {
        build: 'deno task compile',
        test: 'deno test -A',
        dev: 'deno run -A --watch src/main.ts',
        lint: 'deno lint',
      },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/with-tasks');

  assertEquals(projects.length, 1);
  assertExists(projects[0].tasks);
  assertEquals(Object.keys(projects[0].tasks!).length, 4);
  assertEquals(projects[0].tasks!['build'], 'deno task compile');
  assertEquals(projects[0].tasks!['test'], 'deno test -A');
  assertEquals(projects[0].tasks!['dev'], 'deno run -A --watch src/main.ts');
  assertEquals(projects[0].tasks!['lint'], 'deno lint');
});

Deno.test('DFSProjectResolver - Resolve returns empty tasks for project without tasks', async () => {
  const dfs = await createTestDFS({
    '/projects/no-tasks/deno.jsonc': JSON.stringify({
      name: '@test/no-tasks',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('/projects/no-tasks');

  assertEquals(projects.length, 1);
  assertExists(projects[0].tasks);
  assertEquals(Object.keys(projects[0].tasks!).length, 0);
});
