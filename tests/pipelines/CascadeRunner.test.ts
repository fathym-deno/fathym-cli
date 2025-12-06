import { assertEquals } from '@std/assert';
import { CascadeRunner } from '../../src/pipelines/CascadeRunner.ts';
import type { CascadeStepDef } from '../../src/pipelines/CascadeTypes.ts';
import type { ProjectRef } from '../../src/projects/ProjectRef.ts';

const BUILD_STEPS: CascadeStepDef[] = [
  {
    name: 'fmt',
    overrideTask: 'build:fmt',
    description: 'Formatting',
    commandKey: 'Fmt',
  },
  {
    name: 'lint',
    overrideTask: 'build:lint',
    description: 'Linting',
    commandKey: 'Lint',
  },
];

function createMockLog() {
  const logs: string[] = [];
  return {
    logs,
    Info: (...args: unknown[]) => logs.push(args.join(' ')),
    Warn: (...args: unknown[]) => logs.push(`WARN: ${args.join(' ')}`),
    Error: (...args: unknown[]) => logs.push(`ERROR: ${args.join(' ')}`),
  };
}

function createProject(tasks: Record<string, string> = {}): ProjectRef {
  return {
    name: '@test/app',
    dir: '/projects/app',
    configPath: '/projects/app/deno.jsonc',
    hasDev: false,
    tasks,
  };
}

// =============================================================================
// CascadeRunner.resolve() Tests
// =============================================================================

Deno.test('CascadeRunner.resolve - Full override detected when task exists', () => {
  const project = createProject({ build: 'custom build command' });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);

  assertEquals(resolution.hasFullOverride, true);
  assertEquals(resolution.steps.length, 0);
  assertEquals(resolution.pipelineName, 'build');
  assertEquals(resolution.fullOverrideTask, 'build');
});

Deno.test('CascadeRunner.resolve - Step override detected for specific task', () => {
  const project = createProject({ 'build:fmt': 'custom fmt' });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);

  assertEquals(resolution.hasFullOverride, false);
  assertEquals(resolution.steps.length, 2);
  assertEquals(resolution.steps[0].hasOverride, true);
  assertEquals(resolution.steps[0].source, 'override');
  assertEquals(resolution.steps[1].hasOverride, false);
  assertEquals(resolution.steps[1].source, 'default');
});

Deno.test('CascadeRunner.resolve - No overrides uses all defaults', () => {
  const project = createProject({});
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);

  assertEquals(resolution.hasFullOverride, false);
  assertEquals(resolution.steps.every((s) => !s.hasOverride), true);
  assertEquals(resolution.steps.every((s) => s.source === 'default'), true);
});

Deno.test('CascadeRunner.resolve - Multiple step overrides detected', () => {
  const project = createProject({
    'build:fmt': 'custom fmt',
    'build:lint': 'custom lint',
  });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);

  assertEquals(resolution.hasFullOverride, false);
  assertEquals(resolution.steps[0].hasOverride, true);
  assertEquals(resolution.steps[1].hasOverride, true);
});

Deno.test('CascadeRunner.resolve - Full override takes priority over step overrides', () => {
  const project = createProject({
    build: 'full override',
    'build:fmt': 'ignored step override',
  });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);

  assertEquals(resolution.hasFullOverride, true);
  assertEquals(resolution.steps.length, 0);
});

// =============================================================================
// CascadeRunner.run() - Explain Mode Tests
// =============================================================================

Deno.test('CascadeRunner.run - Explain mode prints pipeline without executing', async () => {
  const project = createProject({ 'build:fmt': 'custom' });
  const log = createMockLog();
  let executed = false;
  const runner = new CascadeRunner(
    project,
    log,
    () => {
      executed = true;
      return Promise.resolve(0);
    },
    {
      verbose: false,
      ignoreFaults: false,
      dryRun: false,
      explain: true,
    },
  );

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(resolution, {}, '@test/app');

  assertEquals(code, 0);
  assertEquals(executed, false);
  assertEquals(
    log.logs.some((l) => l.includes('Pipeline')),
    true,
  );
});

Deno.test('CascadeRunner.run - Explain mode shows override status', async () => {
  const project = createProject({ 'build:fmt': 'custom' });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: true,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  await runner.run(resolution, {}, '@test/app');

  assertEquals(
    log.logs.some((l) => l.includes('OVERRIDE')),
    true,
  );
  assertEquals(
    log.logs.some((l) => l.includes('default')),
    true,
  );
});

// =============================================================================
// CascadeRunner.run() - Dry Run Mode Tests
// =============================================================================

Deno.test('CascadeRunner.run - Dry run shows what would execute without running', async () => {
  const project = createProject({});
  const log = createMockLog();
  let executed = false;
  const runner = new CascadeRunner(
    project,
    log,
    () => {
      executed = true;
      return Promise.resolve(0);
    },
    {
      verbose: false,
      ignoreFaults: false,
      dryRun: true,
      explain: false,
    },
  );

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(
    resolution,
    {
      Fmt: () => {
        executed = true;
        return Promise.resolve(0);
      },
      Lint: () => {
        executed = true;
        return Promise.resolve(0);
      },
    },
    '@test/app',
  );

  assertEquals(code, 0);
  assertEquals(executed, false);
  assertEquals(
    log.logs.some((l) => l.includes('DRY RUN')),
    true,
  );
});

Deno.test('CascadeRunner.run - Dry run with full override shows task name', async () => {
  const project = createProject({ build: 'custom build' });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: true,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  await runner.run(resolution, {}, '@test/app');

  assertEquals(
    log.logs.some((l) => l.includes('DRY RUN') && l.includes('build')),
    true,
  );
});

// =============================================================================
// CascadeRunner.run() - Full Override Tests
// =============================================================================

Deno.test('CascadeRunner.run - Full override delegates to task invoker', async () => {
  const project = createProject({ build: 'custom build' });
  const log = createMockLog();
  let taskArgs: unknown[] = [];
  const runner = new CascadeRunner(
    project,
    log,
    (args) => {
      taskArgs = args as unknown[];
      return Promise.resolve(0);
    },
    {
      verbose: false,
      ignoreFaults: false,
      dryRun: false,
      explain: false,
    },
  );

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(resolution, {}, '@test/app');

  assertEquals(code, 0);
  assertEquals(taskArgs[0], '@test/app');
  assertEquals(taskArgs[1], 'build');
});

Deno.test('CascadeRunner.run - Full override returns task exit code', async () => {
  const project = createProject({ build: 'custom build' });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(42), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(resolution, {}, '@test/app');

  assertEquals(code, 42);
});

// =============================================================================
// CascadeRunner.run() - Step Execution Tests
// =============================================================================

Deno.test('CascadeRunner.run - Steps execute in order', async () => {
  const project = createProject({});
  const log = createMockLog();
  const executionOrder: string[] = [];
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  await runner.run(
    resolution,
    {
      Fmt: () => {
        executionOrder.push('fmt');
        return Promise.resolve(0);
      },
      Lint: () => {
        executionOrder.push('lint');
        return Promise.resolve(0);
      },
    },
    '@test/app',
  );

  assertEquals(executionOrder, ['fmt', 'lint']);
});

Deno.test('CascadeRunner.run - Step with override delegates to task', async () => {
  const project = createProject({ 'build:fmt': 'custom fmt' });
  const log = createMockLog();
  let taskCalled = false;
  let stepCommandCalled = false;
  const runner = new CascadeRunner(
    project,
    log,
    () => {
      taskCalled = true;
      return Promise.resolve(0);
    },
    {
      verbose: false,
      ignoreFaults: false,
      dryRun: false,
      explain: false,
    },
  );

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  await runner.run(
    resolution,
    {
      Fmt: () => {
        stepCommandCalled = true;
        return Promise.resolve(0);
      },
      Lint: () => Promise.resolve(0),
    },
    '@test/app',
  );

  assertEquals(taskCalled, true); // Override uses task
  assertEquals(stepCommandCalled, false); // Step command not called
});

Deno.test('CascadeRunner.run - Step failure stops execution without ignoreFaults', async () => {
  const project = createProject({});
  const log = createMockLog();
  let lintExecuted = false;
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(
    resolution,
    {
      Fmt: () => Promise.resolve(1), // Fails
      Lint: () => {
        lintExecuted = true;
        return Promise.resolve(0);
      },
    },
    '@test/app',
  );

  assertEquals(code, 1);
  assertEquals(lintExecuted, false); // Lint never ran
});

// =============================================================================
// CascadeRunner.run() - Ignore Faults Tests
// =============================================================================

Deno.test('CascadeRunner.run - Ignore faults continues on step failure', async () => {
  const project = createProject({});
  const log = createMockLog();
  let lintExecuted = false;
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: true,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(
    resolution,
    {
      Fmt: () => Promise.resolve(1), // Fails
      Lint: () => {
        lintExecuted = true;
        return Promise.resolve(0);
      },
    },
    '@test/app',
  );

  assertEquals(code, 0); // Returns 0 due to ignoreFaults
  assertEquals(lintExecuted, true); // Lint still ran
});

Deno.test('CascadeRunner.run - Ignore faults handles thrown errors', async () => {
  const project = createProject({});
  const log = createMockLog();
  let lintExecuted = false;
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: false,
    ignoreFaults: true,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  const code = await runner.run(
    resolution,
    {
      Fmt: () => {
        throw new Error('fmt failed');
      },
      Lint: () => {
        lintExecuted = true;
        return Promise.resolve(0);
      },
    },
    '@test/app',
  );

  assertEquals(code, 0);
  assertEquals(lintExecuted, true);
  assertEquals(
    log.logs.some((l) => l.includes('WARN') && l.includes('Failed')),
    true,
  );
});

// =============================================================================
// CascadeRunner.run() - Verbose Mode Tests
// =============================================================================

Deno.test('CascadeRunner.run - Verbose mode logs step details', async () => {
  const project = createProject({});
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: true,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  await runner.run(
    resolution,
    {
      Fmt: () => Promise.resolve(0),
      Lint: () => Promise.resolve(0),
    },
    '@test/app',
  );

  assertEquals(
    log.logs.some((l) => l.includes('pipeline')),
    true,
  );
  assertEquals(
    log.logs.some((l) => l.includes('Formatting')),
    true,
  );
  assertEquals(
    log.logs.some((l) => l.includes('Linting')),
    true,
  );
});

Deno.test('CascadeRunner.run - Verbose mode shows override source', async () => {
  const project = createProject({ 'build:fmt': 'custom' });
  const log = createMockLog();
  const runner = new CascadeRunner(project, log, () => Promise.resolve(0), {
    verbose: true,
    ignoreFaults: false,
    dryRun: false,
    explain: false,
  });

  const resolution = runner.resolve('build', 'build', BUILD_STEPS);
  await runner.run(
    resolution,
    {
      Fmt: () => Promise.resolve(0),
      Lint: () => Promise.resolve(0),
    },
    '@test/app',
  );

  assertEquals(
    log.logs.some((l) => l.includes('override')),
    true,
  );
  assertEquals(
    log.logs.some((l) => l.includes('default')),
    true,
  );
});
