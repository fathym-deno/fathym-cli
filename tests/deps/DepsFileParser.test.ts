import { assertEquals } from '@std/assert';
import { DepsFileParser } from '../../src/deps/DepsFileParser.ts';

const parser = new DepsFileParser();

// =============================================================================
// DepsFileParser.parse() Tests
// =============================================================================

Deno.test('DepsFileParser.parse - Parses JSR scoped package', () => {
  const content = `export { merge } from 'jsr:@fathym/common@0.2.299/merge';`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].registry, 'jsr');
  assertEquals(refs[0].scope, '@fathym');
  assertEquals(refs[0].name, 'common');
  assertEquals(refs[0].fullName, '@fathym/common');
  assertEquals(refs[0].version, '0.2.299');
  assertEquals(refs[0].subpath, '/merge');
  assertEquals(refs[0].fullSpecifier, 'jsr:@fathym/common@0.2.299/merge');
  assertEquals(refs[0].line, 1);
});

Deno.test('DepsFileParser.parse - Parses JSR package with channel version', () => {
  const content = `export { type EverythingAsCode } from "jsr:@fathym/eac@0.2.166-hmis";`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].registry, 'jsr');
  assertEquals(refs[0].fullName, '@fathym/eac');
  assertEquals(refs[0].version, '0.2.166-hmis');
  assertEquals(refs[0].subpath, undefined);
});

Deno.test('DepsFileParser.parse - Parses npm package', () => {
  const content = `export { z } from 'npm:zod@4.1.13';`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].registry, 'npm');
  assertEquals(refs[0].scope, undefined);
  assertEquals(refs[0].name, 'zod');
  assertEquals(refs[0].fullName, 'zod');
  assertEquals(refs[0].version, '4.1.13');
  assertEquals(refs[0].subpath, undefined);
});

Deno.test('DepsFileParser.parse - Parses npm scoped package', () => {
  const content = `export * as msal from "npm:@azure/msal-node@2.16.2";`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].registry, 'npm');
  assertEquals(refs[0].scope, '@azure');
  assertEquals(refs[0].name, 'msal-node');
  assertEquals(refs[0].fullName, '@azure/msal-node');
  assertEquals(refs[0].version, '2.16.2');
});

Deno.test('DepsFileParser.parse - Parses multiple packages on same line', () => {
  const content = `export { a } from 'jsr:@pkg/a@1.0.0'; export { b } from 'npm:b@2.0.0';`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 2);
  assertEquals(refs[0].fullName, '@pkg/a');
  assertEquals(refs[1].fullName, 'b');
});

Deno.test('DepsFileParser.parse - Handles multiple lines', () => {
  const content = `
export { merge } from 'jsr:@fathym/common@0.2.299/merge';
export { telemetryFor } from 'jsr:@fathym/common@0.2.299/telemetry';
export { z } from 'npm:zod@4.1.13';
`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 3);
  assertEquals(refs[0].fullName, '@fathym/common');
  assertEquals(refs[0].line, 2);
  assertEquals(refs[1].fullName, '@fathym/common');
  assertEquals(refs[1].line, 3);
  assertEquals(refs[2].fullName, 'zod');
  assertEquals(refs[2].line, 4);
});

Deno.test('DepsFileParser.parse - Ignores non-specifier imports', () => {
  const content = `
import { something } from './local.ts';
import type { Foo } from '../types.ts';
export { merge } from 'jsr:@fathym/common@0.2.299/merge';
`;
  const refs = parser.parse(content);

  assertEquals(refs.length, 1);
  assertEquals(refs[0].fullName, '@fathym/common');
});

// =============================================================================
// DepsFileParser.parseSpecifier() Tests
// =============================================================================

Deno.test('DepsFileParser.parseSpecifier - Parses valid JSR specifier', () => {
  const result = parser.parseSpecifier('jsr:@fathym/common@0.2.299/merge');

  assertEquals(result?.registry, 'jsr');
  assertEquals(result?.fullName, '@fathym/common');
  assertEquals(result?.version, '0.2.299');
  assertEquals(result?.subpath, '/merge');
});

Deno.test('DepsFileParser.parseSpecifier - Parses valid npm specifier', () => {
  const result = parser.parseSpecifier('npm:zod@4.1.13');

  assertEquals(result?.registry, 'npm');
  assertEquals(result?.fullName, 'zod');
  assertEquals(result?.version, '4.1.13');
  assertEquals(result?.subpath, undefined);
});

Deno.test('DepsFileParser.parseSpecifier - Returns null for invalid specifier', () => {
  assertEquals(parser.parseSpecifier('invalid'), null);
  assertEquals(parser.parseSpecifier('./local.ts'), null);
  assertEquals(parser.parseSpecifier('jsr:@pkg/name'), null); // Missing version
});

// =============================================================================
// DepsFileParser.update() Tests
// =============================================================================

Deno.test('DepsFileParser.update - Updates single package version', () => {
  const content = `export { merge } from 'jsr:@fathym/common@0.2.299/merge';`;
  const updates = new Map([['@fathym/common', '0.2.300']]);

  const result = parser.update(content, updates);

  assertEquals(result, `export { merge } from 'jsr:@fathym/common@0.2.300/merge';`);
});

Deno.test('DepsFileParser.update - Updates multiple occurrences of same package', () => {
  const content = `
export { merge } from 'jsr:@fathym/common@0.2.299/merge';
export { telemetryFor } from 'jsr:@fathym/common@0.2.299/telemetry';
`;
  const updates = new Map([['@fathym/common', '0.2.300-integration']]);

  const result = parser.update(content, updates);

  assertEquals(result.includes('@fathym/common@0.2.300-integration/merge'), true);
  assertEquals(result.includes('@fathym/common@0.2.300-integration/telemetry'), true);
  assertEquals(result.includes('@0.2.299'), false);
});

Deno.test('DepsFileParser.update - Preserves quotes style', () => {
  const content = `
export { a } from 'jsr:@pkg/a@1.0.0';
export { b } from "jsr:@pkg/b@1.0.0";
`;
  const updates = new Map([
    ['@pkg/a', '2.0.0'],
    ['@pkg/b', '2.0.0'],
  ]);

  const result = parser.update(content, updates);

  assertEquals(result.includes(`'jsr:@pkg/a@2.0.0'`), true);
  assertEquals(result.includes(`"jsr:@pkg/b@2.0.0"`), true);
});

Deno.test('DepsFileParser.update - Preserves subpaths', () => {
  const content = `export { x } from 'jsr:@scope/pkg@1.0.0/deep/path';`;
  const updates = new Map([['@scope/pkg', '2.0.0']]);

  const result = parser.update(content, updates);

  assertEquals(result, `export { x } from 'jsr:@scope/pkg@2.0.0/deep/path';`);
});

Deno.test('DepsFileParser.update - Does not modify unrelated packages', () => {
  const content = `
export { a } from 'jsr:@pkg/a@1.0.0';
export { b } from 'npm:b@1.0.0';
`;
  const updates = new Map([['@pkg/a', '2.0.0']]);

  const result = parser.update(content, updates);

  assertEquals(result.includes('@pkg/a@2.0.0'), true);
  assertEquals(result.includes('npm:b@1.0.0'), true);
});

Deno.test('DepsFileParser.update - Empty updates returns original content', () => {
  const content = `export { a } from 'jsr:@pkg/a@1.0.0';`;
  const updates = new Map<string, string>();

  const result = parser.update(content, updates);

  assertEquals(result, content);
});

// =============================================================================
// DepsFileParser.getUniquePackages() Tests
// =============================================================================

Deno.test('DepsFileParser.getUniquePackages - Deduplicates same package', () => {
  const content = `
export { merge } from 'jsr:@fathym/common@0.2.299/merge';
export { telemetryFor } from 'jsr:@fathym/common@0.2.299/telemetry';
`;
  const refs = parser.parse(content);
  const unique = parser.getUniquePackages(refs);

  assertEquals(unique.size, 1);
  assertEquals(unique.has('@fathym/common'), true);
});

Deno.test('DepsFileParser.getUniquePackages - Keeps first occurrence', () => {
  const content = `
export { a } from 'jsr:@pkg/a@1.0.0/path1';
export { b } from 'jsr:@pkg/a@1.0.0/path2';
`;
  const refs = parser.parse(content);
  const unique = parser.getUniquePackages(refs);

  assertEquals(unique.get('@pkg/a')?.subpath, '/path1');
});

// =============================================================================
// DepsFileParser.filterByRegistry() Tests
// =============================================================================

Deno.test('DepsFileParser.filterByRegistry - Filters to JSR only', () => {
  const content = `
export { a } from 'jsr:@pkg/a@1.0.0';
export { b } from 'npm:b@1.0.0';
`;
  const refs = parser.parse(content);
  const jsrOnly = parser.filterByRegistry(refs, 'jsr');

  assertEquals(jsrOnly.length, 1);
  assertEquals(jsrOnly[0].fullName, '@pkg/a');
});

Deno.test('DepsFileParser.filterByRegistry - Filters to npm only', () => {
  const content = `
export { a } from 'jsr:@pkg/a@1.0.0';
export { b } from 'npm:b@1.0.0';
`;
  const refs = parser.parse(content);
  const npmOnly = parser.filterByRegistry(refs, 'npm');

  assertEquals(npmOnly.length, 1);
  assertEquals(npmOnly[0].fullName, 'b');
});

// =============================================================================
// DepsFileParser.filterByPattern() Tests
// =============================================================================

Deno.test('DepsFileParser.filterByPattern - Exact match', () => {
  const content = `
export { a } from 'jsr:@fathym/common@1.0.0';
export { b } from 'jsr:@fathym/eac@1.0.0';
`;
  const refs = parser.parse(content);
  const filtered = parser.filterByPattern(refs, '@fathym/common');

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].fullName, '@fathym/common');
});

Deno.test('DepsFileParser.filterByPattern - Wildcard suffix match', () => {
  const content = `
export { a } from 'jsr:@fathym/eac@1.0.0';
export { b } from 'jsr:@fathym/eac-identity@1.0.0';
export { c } from 'jsr:@fathym/common@1.0.0';
`;
  const refs = parser.parse(content);
  const filtered = parser.filterByPattern(refs, '@fathym/eac*');

  assertEquals(filtered.length, 2);
  assertEquals(filtered.some((r) => r.fullName === '@fathym/eac'), true);
  assertEquals(filtered.some((r) => r.fullName === '@fathym/eac-identity'), true);
});

Deno.test('DepsFileParser.filterByPattern - Wildcard scope match', () => {
  const content = `
export { a } from 'jsr:@fathym/common@1.0.0';
export { b } from 'jsr:@fathym/eac@1.0.0';
export { c } from 'jsr:@std/path@1.0.0';
`;
  const refs = parser.parse(content);
  const filtered = parser.filterByPattern(refs, '@fathym/*');

  assertEquals(filtered.length, 2);
  assertEquals(filtered.every((r) => r.fullName.startsWith('@fathym/')), true);
});

Deno.test('DepsFileParser.filterByPattern - No matches returns empty array', () => {
  const content = `export { a } from 'jsr:@pkg/a@1.0.0';`;
  const refs = parser.parse(content);
  const filtered = parser.filterByPattern(refs, '@nonexistent/*');

  assertEquals(filtered.length, 0);
});
