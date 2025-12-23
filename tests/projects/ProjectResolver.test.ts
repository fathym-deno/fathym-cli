import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { MemoryDFSFileHandler } from '@fathym/dfs/handlers';
import {
  DFSProjectResolver,
  MultipleProjectsError,
  parseRefs,
} from '../../src/projects/ProjectResolver.ts';

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

// =============================================================================
// parseRefs() Tests
// =============================================================================

Deno.test('parseRefs - parses comma-separated refs', async (t) => {
  await t.step('single ref unchanged', () => {
    assertEquals(parseRefs('@fathym/cli'), ['@fathym/cli']);
  });

  await t.step('two refs split correctly', () => {
    assertEquals(parseRefs('@a,@b'), ['@a', '@b']);
  });

  await t.step('three refs', () => {
    assertEquals(parseRefs('@a,@b,@c'), ['@a', '@b', '@c']);
  });

  await t.step('whitespace before comma trimmed', () => {
    assertEquals(parseRefs('@a ,@b'), ['@a', '@b']);
  });

  await t.step('whitespace after comma trimmed', () => {
    assertEquals(parseRefs('@a, @b'), ['@a', '@b']);
  });

  await t.step('whitespace both sides trimmed', () => {
    assertEquals(parseRefs('@a , @b'), ['@a', '@b']);
  });

  await t.step('multiple spaces trimmed', () => {
    assertEquals(parseRefs('@a   ,   @b'), ['@a', '@b']);
  });

  await t.step('empty segment filtered (double comma)', () => {
    assertEquals(parseRefs('@a,,@b'), ['@a', '@b']);
  });

  await t.step('multiple empty segments filtered', () => {
    assertEquals(parseRefs('@a,,,@b'), ['@a', '@b']);
  });

  await t.step('leading comma filtered', () => {
    assertEquals(parseRefs(',@a,@b'), ['@a', '@b']);
  });

  await t.step('trailing comma filtered', () => {
    assertEquals(parseRefs('@a,@b,'), ['@a', '@b']);
  });

  await t.step('only commas returns empty', () => {
    assertEquals(parseRefs(',,,'), []);
  });

  await t.step('empty string returns empty', () => {
    assertEquals(parseRefs(''), []);
  });

  await t.step('whitespace only returns empty', () => {
    assertEquals(parseRefs('   '), []);
  });

  await t.step('mixed whitespace and commas returns empty', () => {
    assertEquals(parseRefs('  ,  ,  '), []);
  });
});

// =============================================================================
// Comma-Separated Resolution Tests
// =============================================================================

Deno.test('DFSProjectResolver - comma-separated resolution', async (t) => {
  await t.step('resolves comma-separated package names', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
      '/projects/app3/deno.jsonc': JSON.stringify({ name: '@test/app3' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1,@test/app2');

    assertEquals(projects.length, 2);
    const names = projects.map((p) => p.name).sort();
    assertEquals(names, ['@test/app1', '@test/app2']);
  });

  await t.step('resolves three comma-separated packages', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
      '/projects/app3/deno.jsonc': JSON.stringify({ name: '@test/app3' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1,@test/app2,@test/app3');

    assertEquals(projects.length, 3);
  });

  await t.step('preserves order of comma-separated refs', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app2,@test/app1');

    assertEquals(projects.length, 2);
    assertEquals(projects[0].name, '@test/app2');
    assertEquals(projects[1].name, '@test/app1');
  });

  await t.step('deduplicates same project referenced twice', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1,@test/app1');

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app1');
  });

  await t.step('partial match returns found only', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1,@test/nonexistent');

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app1');
  });

  await t.step('all non-existent returns empty', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@nope1,@nope2');

    assertEquals(projects.length, 0);
  });
});

// =============================================================================
// singleOnly Option Tests
// =============================================================================

Deno.test('DFSProjectResolver - singleOnly option', async (t) => {
  await t.step('with zero results returns empty', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@nonexistent', {
      singleOnly: true,
    });

    assertEquals(projects.length, 0);
  });

  await t.step('with one result succeeds', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1', { singleOnly: true });

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app1');
  });

  await t.step('with two results throws MultipleProjectsError', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);

    await assertRejects(
      async () => await resolver.Resolve('@test/app1,@test/app2', { singleOnly: true }),
      MultipleProjectsError,
      'Expected single project but found 2',
    );
  });

  await t.step('error includes count', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
      '/projects/app3/deno.jsonc': JSON.stringify({ name: '@test/app3' }),
    });

    const resolver = new DFSProjectResolver(dfs);

    try {
      await resolver.Resolve('@test/app1,@test/app2,@test/app3', {
        singleOnly: true,
      });
    } catch (e) {
      if (e instanceof MultipleProjectsError) {
        assertEquals(e.count, 3);
        return;
      }
      throw e;
    }
    throw new Error('Expected MultipleProjectsError');
  });

  await t.step('error includes original ref', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);

    try {
      await resolver.Resolve('@test/app1,@test/app2', { singleOnly: true });
    } catch (e) {
      if (e instanceof MultipleProjectsError) {
        assertEquals(e.ref, '@test/app1,@test/app2');
        return;
      }
      throw e;
    }
    throw new Error('Expected MultipleProjectsError');
  });

  await t.step('with directory walk throws if multi', async () => {
    const dfs = await createTestDFS({
      '/projects/libs/lib1/deno.jsonc': JSON.stringify({ name: '@test/lib1' }),
      '/projects/libs/lib2/deno.jsonc': JSON.stringify({ name: '@test/lib2' }),
    });

    const resolver = new DFSProjectResolver(dfs);

    await assertRejects(
      async () => await resolver.Resolve('/projects/libs', { singleOnly: true }),
      MultipleProjectsError,
    );
  });

  await t.step('false allows multiple', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1,@test/app2', {
      singleOnly: false,
    });

    assertEquals(projects.length, 2);
  });
});

// =============================================================================
// useFirst Option Tests
// =============================================================================

Deno.test('DFSProjectResolver - useFirst option', async (t) => {
  await t.step('with zero results returns empty', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@nonexistent', { useFirst: true });

    assertEquals(projects.length, 0);
  });

  await t.step('with one result returns it', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1', { useFirst: true });

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app1');
  });

  await t.step('with multiple returns first only', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
      '/projects/app3/deno.jsonc': JSON.stringify({ name: '@test/app3' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve(
      '@test/app1,@test/app2,@test/app3',
      { useFirst: true },
    );

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app1');
  });

  await t.step('preserves resolution order', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app2,@test/app1', {
      useFirst: true,
    });

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app2');
  });

  await t.step('with directory returns first found', async () => {
    const dfs = await createTestDFS({
      '/projects/libs/lib1/deno.jsonc': JSON.stringify({ name: '@test/lib1' }),
      '/projects/libs/lib2/deno.jsonc': JSON.stringify({ name: '@test/lib2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('/projects/libs', {
      useFirst: true,
    });

    assertEquals(projects.length, 1);
    assertExists(projects[0].name);
  });

  await t.step('with undefined returns first project', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve(undefined, { useFirst: true });

    assertEquals(projects.length, 1);
    assertExists(projects[0].name);
  });

  await t.step('takes precedence over singleOnly', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    // Both options true - useFirst wins, no error thrown
    const projects = await resolver.Resolve('@test/app1,@test/app2', {
      useFirst: true,
      singleOnly: true,
    });

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app1');
  });
});

// =============================================================================
// Combined Options & Backward Compatibility Tests
// =============================================================================

Deno.test('DFSProjectResolver - backward compatibility', async (t) => {
  await t.step('options object is optional', async () => {
    const dfs = await createTestDFS({
      '/projects/app/deno.jsonc': JSON.stringify({ name: '@test/app' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app');

    assertEquals(projects.length, 1);
  });

  await t.step('empty options object uses defaults', async () => {
    const dfs = await createTestDFS({
      '/projects/app1/deno.jsonc': JSON.stringify({ name: '@test/app1' }),
      '/projects/app2/deno.jsonc': JSON.stringify({ name: '@test/app2' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app1,@test/app2', {});

    assertEquals(projects.length, 2);
  });

  await t.step('single ref works same as before', async () => {
    const dfs = await createTestDFS({
      '/projects/app/deno.jsonc': JSON.stringify({ name: '@test/app' }),
    });

    const resolver = new DFSProjectResolver(dfs);
    const projects = await resolver.Resolve('@test/app');

    assertEquals(projects.length, 1);
    assertEquals(projects[0].name, '@test/app');
  });
});

// =============================================================================
// TDD Tests: Relative Path Requirements
// =============================================================================

Deno.test('DFSProjectResolver - Resolve returns relative dir path', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/app');

  assertEquals(projects.length, 1);
  // dir should be relative, not absolute
  assertEquals(projects[0].dir, 'projects/app');
  // Should NOT start with drive letter or /
  assertEquals(projects[0].dir.includes(':'), false);
  assertEquals(projects[0].dir.startsWith('/'), false);
});

Deno.test('DFSProjectResolver - Resolve returns relative configPath', async () => {
  const dfs = await createTestDFS({
    '/projects/app/deno.jsonc': JSON.stringify({
      name: '@test/app',
      exports: { '.': './mod.ts' },
    }),
  });

  const resolver = new DFSProjectResolver(dfs);
  const projects = await resolver.Resolve('@test/app');

  assertEquals(projects.length, 1);
  // configPath should be relative, not absolute
  assertEquals(projects[0].configPath, 'projects/app/deno.jsonc');
  // Should NOT start with drive letter or /
  assertEquals(projects[0].configPath.includes(':'), false);
  assertEquals(projects[0].configPath.startsWith('/'), false);
});
