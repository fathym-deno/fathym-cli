---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI
Summary: Standalone Fathym CLI project (open-source).
Created: 2025-11-20
Updated: 2025-11-20
Owners:
  - fathym
References:
  - Label: Project Agents Guide
    Path: ./AGENTS.md
  - Label: Project Guide
    Path: ./GUIDE.md
  - Label: Open-Source Agents Guide
    Path: ../AGENTS.md
  - Label: Open-Source Guide
    Path: ../GUIDE.md
  - Label: Workspace README
    Path: ../../README.md
  - Label: Workspace Agents Guide
    Path: ../../AGENTS.md
  - Label: Workspace Guide
    Path: ../../WORKSPACE_GUIDE.md
---

# Fathym CLI

Open-source home for the Fathym CLI. This repo will house the CLI commands, templates, docs, and packaging tasks currently living under `projects/ref-arch/command-line-interface/src/cli/ftm-cli/`.

## Status

- Migration planned: port commands/templates/docs and packaging scripts from the ref-arch CLI runtime.
- Depends on the shared CLI runtime (`@fathym/cli` or local ref-arch path) for execution and packaging.

## How to Work Here

1. Review project guardrails in [`AGENTS.md`](./AGENTS.md) and the playbook in [`GUIDE.md`](./GUIDE.md).
2. Keep docs frontmatter-complete; link back to parent guides.
3. Capture provenance and distribution strategy (Deno, npm, binary) when wiring build/compile tasks.
4. Add smoke tests for key commands and packaging flows.
