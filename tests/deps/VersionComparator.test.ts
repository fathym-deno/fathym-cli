import { assertEquals } from '@std/assert';
import { VersionComparator } from '../../src/deps/VersionComparator.ts';

const comparator = new VersionComparator();

// =============================================================================
// VersionComparator.parse() Tests
// =============================================================================

Deno.test('VersionComparator.parse - Parses production version', () => {
  const parsed = comparator.parse('0.2.299');

  assertEquals(parsed.original, '0.2.299');
  assertEquals(parsed.base, '0.2.299');
  assertEquals(parsed.channel, undefined);
  assertEquals(parsed.isProduction, true);
});

Deno.test('VersionComparator.parse - Parses version with channel', () => {
  const parsed = comparator.parse('0.2.299-integration');

  assertEquals(parsed.original, '0.2.299-integration');
  assertEquals(parsed.base, '0.2.299');
  assertEquals(parsed.channel, 'integration');
  assertEquals(parsed.isProduction, false);
});

Deno.test('VersionComparator.parse - Parses version with complex channel', () => {
  const parsed = comparator.parse('0.0.45-integration');

  assertEquals(parsed.base, '0.0.45');
  assertEquals(parsed.channel, 'integration');
});

Deno.test('VersionComparator.parse - Handles different channel names', () => {
  assertEquals(comparator.parse('1.0.0-hmis').channel, 'hmis');
  assertEquals(comparator.parse('1.0.0-beta').channel, 'beta');
  assertEquals(comparator.parse('1.0.0-alpha.1').channel, 'alpha.1');
});

// =============================================================================
// VersionComparator.compare() Tests
// =============================================================================

Deno.test('VersionComparator.compare - Production versions: a < b', () => {
  assertEquals(comparator.compare('0.2.299', '0.2.300'), -1);
  assertEquals(comparator.compare('0.1.0', '0.2.0'), -1);
  assertEquals(comparator.compare('1.0.0', '2.0.0'), -1);
});

Deno.test('VersionComparator.compare - Production versions: a > b', () => {
  assertEquals(comparator.compare('0.2.300', '0.2.299'), 1);
  assertEquals(comparator.compare('0.2.0', '0.1.0'), 1);
  assertEquals(comparator.compare('2.0.0', '1.0.0'), 1);
});

Deno.test('VersionComparator.compare - Production versions: equal', () => {
  assertEquals(comparator.compare('0.2.299', '0.2.299'), 0);
  assertEquals(comparator.compare('1.0.0', '1.0.0'), 0);
});

Deno.test('VersionComparator.compare - Production > pre-release with same base', () => {
  // In semver, 1.0.0 > 1.0.0-anything
  assertEquals(comparator.compare('0.2.299', '0.2.299-integration'), 1);
});

Deno.test('VersionComparator.compare - Pre-release < production with same base', () => {
  assertEquals(comparator.compare('0.2.299-integration', '0.2.299'), -1);
});

Deno.test('VersionComparator.compare - Different base versions with channels', () => {
  // 0.2.300-integration > 0.2.299
  assertEquals(comparator.compare('0.2.299', '0.2.300-integration'), -1);
  // 0.2.298-integration < 0.2.299
  assertEquals(comparator.compare('0.2.299', '0.2.298-integration'), 1);
});

Deno.test('VersionComparator.compare - Same base, different channels', () => {
  // Both pre-release, compared alphabetically
  const result = comparator.compare('0.2.299-beta', '0.2.299-alpha');
  // beta > alpha alphabetically
  assertEquals(result, 1);
});

// =============================================================================
// VersionComparator.isNewer() Tests
// =============================================================================

Deno.test('VersionComparator.isNewer - Newer production version', () => {
  assertEquals(comparator.isNewer('0.2.299', '0.2.300'), true);
});

Deno.test('VersionComparator.isNewer - Older production version', () => {
  assertEquals(comparator.isNewer('0.2.300', '0.2.299'), false);
});

Deno.test('VersionComparator.isNewer - Same version', () => {
  assertEquals(comparator.isNewer('0.2.299', '0.2.299'), false);
});

Deno.test('VersionComparator.isNewer - Channel version with higher base', () => {
  // 0.2.300-integration is newer than 0.2.299
  assertEquals(comparator.isNewer('0.2.299', '0.2.300-integration'), true);
});

Deno.test('VersionComparator.isNewer - Channel version with lower base', () => {
  // 0.2.298-integration is NOT newer than 0.2.299
  assertEquals(comparator.isNewer('0.2.299', '0.2.298-integration'), false);
});

Deno.test('VersionComparator.isNewer - Switching from one channel to another', () => {
  // 0.2.167-integration is newer than 0.2.166-hmis
  assertEquals(comparator.isNewer('0.2.166-hmis', '0.2.167-integration'), true);
  // 0.2.165-integration is NOT newer than 0.2.166-hmis
  assertEquals(
    comparator.isNewer('0.2.166-hmis', '0.2.165-integration'),
    false,
  );
});

// =============================================================================
// VersionComparator.findLatest() Tests
// =============================================================================

Deno.test('VersionComparator.findLatest - Production versions only', () => {
  const versions = ['0.2.297', '0.2.299', '0.2.298', '0.2.300-integration'];
  const latest = comparator.findLatest(versions, undefined);

  assertEquals(latest, '0.2.299');
});

Deno.test('VersionComparator.findLatest - Specific channel', () => {
  const versions = [
    '0.2.299',
    '0.2.300-integration',
    '0.2.301-integration',
    '0.2.298-hmis',
  ];
  const latest = comparator.findLatest(versions, 'integration');

  assertEquals(latest, '0.2.301-integration');
});

Deno.test('VersionComparator.findLatest - No matching channel returns undefined', () => {
  const versions = ['0.2.299', '0.2.300'];
  const latest = comparator.findLatest(versions, 'integration');

  assertEquals(latest, undefined);
});

Deno.test('VersionComparator.findLatest - Empty array returns undefined', () => {
  assertEquals(comparator.findLatest([], undefined), undefined);
});

// =============================================================================
// VersionComparator.getVersionsByChannel() Tests
// =============================================================================

Deno.test('VersionComparator.getVersionsByChannel - Groups by channel', () => {
  const versions = [
    '0.2.299',
    '0.2.300',
    '0.2.301-integration',
    '0.2.300-integration',
    '0.2.298-hmis',
  ];

  const production = comparator.getVersionsByChannel(versions, undefined);
  const integration = comparator.getVersionsByChannel(versions, 'integration');
  const hmis = comparator.getVersionsByChannel(versions, 'hmis');

  assertEquals(production.length, 2);
  assertEquals(production[0], '0.2.300'); // Sorted newest first
  assertEquals(integration.length, 2);
  assertEquals(integration[0], '0.2.301-integration');
  assertEquals(hmis.length, 1);
  assertEquals(hmis[0], '0.2.298-hmis');
});

// =============================================================================
// VersionComparator.getChannel() Tests
// =============================================================================

Deno.test('VersionComparator.getChannel - Returns channel for pre-release', () => {
  assertEquals(comparator.getChannel('0.2.299-integration'), 'integration');
  assertEquals(comparator.getChannel('1.0.0-beta'), 'beta');
});

Deno.test('VersionComparator.getChannel - Returns undefined for production', () => {
  assertEquals(comparator.getChannel('0.2.299'), undefined);
  assertEquals(comparator.getChannel('1.0.0'), undefined);
});

// =============================================================================
// VersionComparator.hasChannel() Tests
// =============================================================================

Deno.test('VersionComparator.hasChannel - Checks for specific channel', () => {
  assertEquals(
    comparator.hasChannel('0.2.299-integration', 'integration'),
    true,
  );
  assertEquals(comparator.hasChannel('0.2.299-integration', 'hmis'), false);
  assertEquals(comparator.hasChannel('0.2.299', 'integration'), false);
});

Deno.test('VersionComparator.hasChannel - Checks for production', () => {
  assertEquals(comparator.hasChannel('0.2.299', undefined), true);
  assertEquals(comparator.hasChannel('0.2.299-integration', undefined), false);
});

// =============================================================================
// VersionComparator.buildVersion() Tests
// =============================================================================

Deno.test('VersionComparator.buildVersion - Builds production version', () => {
  assertEquals(comparator.buildVersion('0.2.299'), '0.2.299');
  assertEquals(comparator.buildVersion('0.2.299', undefined), '0.2.299');
});

Deno.test('VersionComparator.buildVersion - Builds channel version', () => {
  assertEquals(
    comparator.buildVersion('0.2.299', 'integration'),
    '0.2.299-integration',
  );
  assertEquals(comparator.buildVersion('1.0.0', 'beta'), '1.0.0-beta');
});
