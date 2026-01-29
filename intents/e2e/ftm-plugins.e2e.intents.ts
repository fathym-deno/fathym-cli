/**
 * E2E Plugin Composition Tests for @fathym/ftm Compiled Binary
 *
 * CRITICAL: These tests verify that plugins load and execute correctly
 * in the compiled binary. This is the PRIMARY CONCERN since @fathym/ftm
 * is the first level where plugins are used.
 *
 * Plugins tested:
 * - FtmCLIPlugin (mapped to 'cli' command root)
 * - EaCInstallPlugin (mapped to 'eac' command root)
 *
 * These tests run the COMPILED ftm binary at .dist/exe/{targetTriple}/ftm
 * to verify end-to-end functionality as a real user would experience it.
 *
 * @module
 */

import { assert, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1.0.3';
import { binaryExists, runFtm } from './helpers.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Binary Existence Check (Prerequisite)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: compiled binary exists',
  fn: async () => {
    const exists = await binaryExists();
    assert(
      exists,
      'Compiled ftm binary should exist. Run `deno task ftm:compile` first.',
    );
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Plugin Composition Tests - CLI Framework Plugin (CRITICAL)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: CLI framework plugin loads (ftm cli --help)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['cli', '--help']);

    assert(code === 0, 'Should exit successfully');
    // Verify CLI framework commands are available
    assertMatch(output, /build/i, 'Should show build command');
    assertMatch(output, /compile/i, 'Should show compile command');
    assertMatch(output, /test/i, 'Should show test command');
    assertMatch(output, /run/i, 'Should show run command');
  },
});

Deno.test({
  name: 'E2E ftm: CLI framework plugin command executes (ftm cli build --help)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['cli', 'build', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /build/i, 'Should show build command help');
    // Verify build command options are available
    assertMatch(output, /config/i, 'Should show config option');
  },
});

Deno.test({
  name: 'E2E ftm: CLI framework plugin compile command help (ftm cli compile --help)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['cli', 'compile', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /compile/i, 'Should show compile command help');
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Plugin Composition Tests - EaC Install Plugin (CRITICAL)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: EaC install plugin loads (ftm eac --help)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['eac', '--help']);

    assert(code === 0, 'Should exit successfully');
    // Verify EaC install commands are available
    assertMatch(output, /install/i, 'Should show install command');
    assertMatch(output, /list/i, 'Should show list command');
  },
});

Deno.test({
  name: 'E2E ftm: EaC install plugin command executes (ftm eac list)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['eac', 'list']);

    assert(code === 0, 'Should exit successfully');
    // Verify EaC template names appear in output
    assertStringIncludes(output, 'runtime', 'Should list runtime template');
    assertStringIncludes(output, 'api', 'Should list api template');
    assertStringIncludes(output, 'sink', 'Should list sink template');
  },
});

Deno.test({
  name: 'E2E ftm: EaC install plugin install command help (ftm eac install --help)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['eac', 'install', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /install/i, 'Should show install command help');
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Plugin Error Handling
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: Plugin command with invalid subcommand fails gracefully (ftm cli nonexistent)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { code } = await runFtm(['cli', 'nonexistent-command']);

    // Should exit with non-zero code
    assert(code !== 0, 'Should fail with invalid plugin command');
  },
});

Deno.test({
  name: 'E2E ftm: Plugin command with invalid args fails gracefully (ftm eac install nonexistent)',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { code } = await runFtm(['eac', 'install', 'nonexistent-template']);

    // Should exit with non-zero code
    assert(code !== 0, 'Should fail with invalid template');
  },
});
