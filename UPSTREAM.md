---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Upstream
Summary: Provenance, versioning, and packaging notes for the Fathym CLI.
Created: 2025-11-20
Updated: 2025-11-29
Owners:
  - fathym
References:
  - Label: Project README
    Path: ./README.md
  - Label: Project Guide
    Path: ./GUIDE.md
  - Label: Project Agents Guide
    Path: ./AGENTS.md
  - Label: CLI Runtime (ref-arch)
    Path: ../../ref-arch/command-line-interface/README.md
---

# Upstream & Packaging

## Provenance

- **Source**: Migrated from `projects/ref-arch/command-line-interface/src/ftm-cli`
- **Runtime**: `@fathym/cli@0.0.65-integration` (JSR, import-mapped in `deno.jsonc`)
- **Related packages**: `@fathym/common`, `@fathym/dfs`, `zod`

## Versioning

| Component | Version | Source |
|-----------|---------|--------|
| ftm-cli | `0.0.0` | `.cli.json` |
| @fathym/cli | `0.0.65-integration` | `deno.jsonc` imports |
| @fathym/common | `0.2.299` | `deno.jsonc` imports |
| @fathym/dfs | `0.0.43` | `deno.jsonc` imports |

## Distribution Strategy

**Status**: Pending decision

Options under consideration:
1. **Deno task** - Run via `deno task ftm-cli:run`
2. **JSR package** - Publish to `jsr:@fathym/ftm-cli`
3. **Compiled binary** - Native executable via `deno compile`

Current support:
- `deno task ftm-cli:build` - Prepare static build
- `deno task ftm-cli:compile` - Generate native binary
- `deno task ftm-cli:run` - Execute from source

## Build Artifacts

| Directory | Contents | Committed |
|-----------|----------|-----------|
| `.build/` | Static CLI entry point, embedded templates/commands | No |
| `.dist/` | Compiled native binary | No |
| `.temp/` | Ephemeral runtime scaffolds | No |

## Breaking Changes

None yet (pre-release).

## Notes

- Remove reliance on local path for `@fathym/cli` once published to JSR
- Coordinate version bumps with ref-arch CLI runtime
- Keep `.build` and `.dist` artifacts generated, not committed
