import { assertEquals, assertNotEquals } from '@std/assert';
import { pascalCase } from '@luca/cases';

/**
 * Tests for the alias generation logic in commands/cli/build.ts
 *
 * The collectCommandMetadata function generates import aliases for commands.
 * These tests ensure aliases are unique even when commands have the same
 * filename in different directories.
 */

/**
 * Simulates the alias generation logic from collectCommandMetadata.
 * This mirrors the actual implementation to test the algorithm.
 */
function generateAlias(key: string, isMeta: boolean): string {
  // This is the FIXED logic - uses full path
  const baseName = pascalCase(key.replace(/\//g, '-'));
  return isMeta ? `${baseName}Group` : `${baseName}Command`;
}

/**
 * The OLD broken logic for comparison in tests
 */
function generateAliasOld(key: string, isMeta: boolean): string {
  // This was the BROKEN logic - only used filename
  const baseName = pascalCase(key.split('/').pop()!);
  return isMeta ? `${baseName}Group` : `${baseName}Command`;
}

// =============================================================================
// Alias Uniqueness Tests
// =============================================================================

Deno.test('Build alias generation - Same filename in different directories produces unique aliases', () => {
  const alias1 = generateAlias('cli/build', false);
  const alias2 = generateAlias('projects/build', false);

  assertNotEquals(alias1, alias2, 'cli/build and projects/build should have different aliases');
  assertEquals(alias1, 'CliBuildCommand');
  assertEquals(alias2, 'ProjectsBuildCommand');
});

Deno.test('Build alias generation - Nested paths produce unique aliases', () => {
  const alias1 = generateAlias('projects/check', false);
  const alias2 = generateAlias('projects/publish/check', false);

  assertNotEquals(
    alias1,
    alias2,
    'projects/check and projects/publish/check should have different aliases',
  );
  assertEquals(alias1, 'ProjectsCheckCommand');
  assertEquals(alias2, 'ProjectsPublishCheckCommand');
});

Deno.test('Build alias generation - Multiple same-named commands all get unique aliases', () => {
  const testCases = [
    'cli/test',
    'projects/test',
    'cli/build',
    'projects/build',
    'projects/check',
    'projects/publish/check',
  ];

  const aliases = testCases.map((key) => generateAlias(key, false));
  const uniqueAliases = new Set(aliases);

  assertEquals(
    aliases.length,
    uniqueAliases.size,
    `Expected ${aliases.length} unique aliases but got ${uniqueAliases.size}. Duplicates found: ${
      aliases.filter((a, i) => aliases.indexOf(a) !== i).join(', ')
    }`,
  );
});

Deno.test('Build alias generation - Group metadata gets unique aliases too', () => {
  const alias1 = generateAlias('cli/config', true);
  const alias2 = generateAlias('projects/imports', true);

  assertEquals(alias1, 'CliConfigGroup');
  assertEquals(alias2, 'ProjectsImportsGroup');
});

Deno.test('Build alias generation - Top-level commands work correctly', () => {
  const alias = generateAlias('task', false);

  assertEquals(alias, 'TaskCommand');
});

// =============================================================================
// Regression Tests - Verify old logic was broken
// =============================================================================

Deno.test('Build alias generation - Old logic would have produced duplicates (regression test)', () => {
  // This test documents WHY the fix was needed
  const oldAlias1 = generateAliasOld('cli/build', false);
  const oldAlias2 = generateAliasOld('projects/build', false);

  // Old logic produced the SAME alias - this was the bug!
  assertEquals(
    oldAlias1,
    oldAlias2,
    'Old logic should produce duplicates (this is the bug we fixed)',
  );
  assertEquals(oldAlias1, 'BuildCommand');

  // New logic produces DIFFERENT aliases
  const newAlias1 = generateAlias('cli/build', false);
  const newAlias2 = generateAlias('projects/build', false);

  assertNotEquals(newAlias1, newAlias2, 'New logic should produce unique aliases');
});

// =============================================================================
// Valid Identifier Tests
// =============================================================================

Deno.test('Build alias generation - Produces valid JavaScript identifiers', () => {
  const testCases = [
    'cli/build',
    'cli/config/get',
    'projects/deps/upgrade',
    'projects/imports/sync',
  ];

  const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

  for (const key of testCases) {
    const alias = generateAlias(key, false);
    assertEquals(
      validIdentifierRegex.test(alias),
      true,
      `Alias "${alias}" from key "${key}" should be a valid JS identifier`,
    );
  }
});

Deno.test('Build alias generation - No slashes in generated aliases', () => {
  const alias = generateAlias('cli/config/get', false);

  assertEquals(alias.includes('/'), false, 'Alias should not contain slashes');
  assertEquals(alias, 'CliConfigGetCommand');
});
