/**
 * Intent tests for the cascade schedule command.
 *
 * The schedule command generates a topologically sorted release schedule
 * from a root package by discovering all packages that depend on it.
 *
 * @module
 */

import { CommandIntentSuite } from '@fathym/cli';
import ScheduleCommand from '../../../../../commands/projects/[projectRef]/cascade/schedule.ts';
import CLI from '../../../../../.cli.ts';

CommandIntentSuite(
  'projects:[projectRef]:cascade:schedule Command Suite',
  ScheduleCommand,
  CLI,
)
  .Intent('Fails for non-existent project', (int) =>
    int
      .Segments({ projectRef: '@nonexistent/package-that-does-not-exist' })
      .ExpectLogs('not found')
      .ExpectExit(1))
  .Intent('Handles package with no dependents', (int) =>
    int
      .Segments({
        projectRef: './tests/fixtures/cascade-workspace/no-dependents/deno.jsonc',
      })
      .ExpectLogs('Cascade Schedule', 'Total:')
      .ExpectExit(0))
  .Intent('Generates schedule for valid package', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .ExpectLogs('Cascade Schedule', 'Layer', 'Total:')
      .ExpectExit(0))
  .Intent('JSON output contains required fields', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ json: true })
      .ExpectLogs('"root":', '"channel":', '"layers":', '"totalPackages":')
      .ExpectExit(0))
  .Intent('Max-depth flag is accepted', (int) =>
    int
      .Segments({ projectRef: './deno.jsonc' })
      .Flags({ 'max-depth': 1 })
      .ExpectLogs('Cascade Schedule', 'Layer')
      .ExpectExit(0))
  // TDD: Verify dependsOn is properly populated for cascade layering
  // The log output includes "depends on: X" when dependsOn is populated
  .Intent('Middle packages depend on root', (int) =>
    int
      .Segments({
        projectRef: './tests/fixtures/cascade-workspace/root/deno.jsonc',
      })
      // Human-readable output shows dependencies in format:
      // "└─ @fathym/test-middle-a depends on: @fathym/test-root"
      .ExpectLogs(
        'Cascade Schedule',
        'Layer 1:',
        'depends on: @fathym/test-root',
      )
      .ExpectExit(0))
  .Intent('Leaf package depends on middle packages', (int) =>
    int
      .Segments({
        projectRef: './tests/fixtures/cascade-workspace/root/deno.jsonc',
      })
      // Leaf should depend on both middle-a and middle-b
      .ExpectLogs(
        'Layer 2:',
        '@fathym/test-leaf',
        'depends on:',
      )
      .ExpectExit(0))
  .Run();
