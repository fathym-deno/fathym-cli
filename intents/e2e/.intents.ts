/**
 * E2E Test Barrel for @fathym/ftm Compiled Binary
 *
 * These tests run the COMPILED ftm binary at .dist/exe/{targetTriple}/ftm
 * to verify end-to-end functionality as a real user would experience it.
 *
 * CRITICAL: Tests verify plugin composition works in compiled binary.
 *
 * These tests are run via `deno task ftm:test:e2e` AFTER `ftm:compile`
 * in the build chain. They are NOT imported by the main test entry point.
 *
 * @module
 */

import './ftm-plugins.e2e.intents.ts';
import './ftm-core.e2e.intents.ts';
