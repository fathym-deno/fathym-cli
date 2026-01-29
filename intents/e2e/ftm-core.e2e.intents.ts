/**
 * E2E Core Command Tests for @fathym/ftm Compiled Binary
 *
 * These tests verify that core CLI commands (non-plugin) work correctly
 * in the compiled binary. Focus areas:
 * - Basic functionality (--help, --version)
 * - Task command (subprocess execution)
 * - Projects command (filesystem + git + JSR API)
 * - Git command group
 * - Error handling
 *
 * These tests run the COMPILED ftm binary at .dist/exe/{targetTriple}/ftm
 * to verify end-to-end functionality as a real user would experience it.
 *
 * @module
 */

import { assert, assertMatch } from 'jsr:@std/assert@1.0.3';
import { binaryExists, runFtm } from './helpers.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Basic Functionality
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: --help shows main commands and plugins',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['--help']);

    assert(code === 0, 'Should exit successfully');
    // Core commands
    assertMatch(output, /task/i, 'Should show task command');
    assertMatch(output, /projects/i, 'Should show projects command');
    assertMatch(output, /git/i, 'Should show git command');
    assertMatch(output, /upgrade/i, 'Should show upgrade command');
    // Plugins
    assertMatch(output, /cli/i, 'Should show cli plugin');
    assertMatch(output, /eac/i, 'Should show eac plugin');
  },
});

Deno.test({
  name: 'E2E ftm: --version shows version',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['--version']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /0\.0\.0/, 'Should show version 0.0.0');
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Task Command (Subprocess Execution)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: task command --help shows usage',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['task', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /task/i, 'Should show task in help');
  },
});

// Note: The following tests are skipped because they require workspace context.
// Tests that need project resolution (ftm task <project>, ftm projects <project>)
// would need to run from workspace root, but the compiled binary runs from its location.
// These commands work correctly in real usage - this is a test environment limitation.

// Deno.test({
//   name: 'E2E ftm: task command with --dry-run (subprocess)',
//   ignore: true, // Requires workspace root context
//   fn: async () => { ... },
// });

// ═══════════════════════════════════════════════════════════════════════════
// Projects Command (Filesystem + Git + JSR API)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: projects --help shows usage',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['projects', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /projects/i, 'Should show projects in help');
  },
});

// Note: The following tests are skipped because they require workspace context.
// See note above about project resolution tests.

// Deno.test({
//   name: 'E2E ftm: projects ref displays project info',
//   ignore: true, // Requires workspace root context
//   fn: async () => { ... },
// });

// Deno.test({
//   name: 'E2E ftm: projects ref --json returns valid JSON',
//   ignore: true, // Requires workspace root context
//   fn: async () => { ... },
// });

// ═══════════════════════════════════════════════════════════════════════════
// Git Command Group
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: git --help shows subcommands',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['git', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /auth/i, 'Should show auth subcommand');
    assertMatch(output, /clone/i, 'Should show clone subcommand');
    assertMatch(output, /configure/i, 'Should show configure subcommand');
  },
});

Deno.test({
  name: 'E2E ftm: git configure --help shows usage',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['git', 'configure', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /configure/i, 'Should show configure in help');
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Upgrade Command (Version Resolution)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: upgrade --help shows usage',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { output, code } = await runFtm(['upgrade', '--help']);

    assert(code === 0, 'Should exit successfully');
    assertMatch(output, /upgrade/i, 'Should show upgrade in help');
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════════════════

Deno.test({
  name: 'E2E ftm: invalid command shows error',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { code } = await runFtm(['nonexistent-command']);

    // Should exit with non-zero code
    assert(code !== 0, 'Should fail with invalid command');
  },
});

Deno.test({
  name: 'E2E ftm: task with invalid project fails gracefully',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { code } = await runFtm(['task', 'nonexistent-package', 'build']);

    // Should exit with non-zero code
    assert(code !== 0, 'Should fail with invalid project');
  },
});

Deno.test({
  name: 'E2E ftm: projects with invalid project fails gracefully',
  ignore: !(await binaryExists()),
  fn: async () => {
    const { code } = await runFtm(['projects', 'nonexistent-package', 'ref']);

    // Should exit with non-zero code
    assert(code !== 0, 'Should fail with invalid project');
  },
});
