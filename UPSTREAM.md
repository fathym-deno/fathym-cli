---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Upstream
Summary: Provenance and packaging notes for the Fathym CLI.
Created: 2025-11-20
Updated: 2025-11-20
Owners:
  - fathym
References:
  - Label: Project README
    Path: ./README.md
  - Label: Project Guide
    Path: ./GUIDE.md
  - Label: Project Agents Guide
    Path: ./AGENTS.md
---

# Upstream & Packaging

- Source: migrated from `projects/ref-arch/command-line-interface/src/ftm-cli`.
- Runtime dependency: uses `@fathym/cli` from the ref-arch CLI repo (import-mapped in `deno.jsonc`).
- Distribution: pending decision (Deno task, npm package, or compiled binary). Current tasks support build/compile via `scripts/cli-runtime.ts`.

## Versioning

- Current version: `0.0.0` (root `.cli.json`).
- Align runtime version with `@fathym/cli` updates; pin via import map as needed.

## Notes

- Remove reliance on local path for `@fathym/cli` once a published package is available.
- Keep `.build` artifacts generated, not committed.
