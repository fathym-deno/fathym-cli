---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Agents Guide
Summary: Guardrails for collaborating on the open-source Fathym CLI project.
Created: 2025-11-20
Updated: 2025-11-20
Owners:
  - fathym
References:
  - Label: Project README
    Path: ./README.md
  - Label: Project Guide
    Path: ./GUIDE.md
  - Label: Open-Source Agents Guide
    Path: ../AGENTS.md
  - Label: Open-Source Guide
    Path: ../GUIDE.md
  - Label: Workspace Agents Guide
    Path: ../../AGENTS.md
  - Label: Workspace Guide
    Path: ../../WORKSPACE_GUIDE.md
---

# AGENTS: Fathym CLI

Guardrails for the standalone, open-source Fathym CLI repo.

## Core Guardrails

1. Keep sources public-friendly: no secrets, tokens, or internal-only links.
2. Frontmatter required for docs; keep references relative to parent guides.
3. Track upstream provenance and packaging (npm/deno/binary) once defined.
4. Preserve CLI flag/command compatibility; note breaking changes explicitly.
5. Align with the shared CLI runtime version (`@fathym/cli` or local path) and pin dependencies.

## Communication

- Declare intent before edits and summarize outcomes in the README or a short log.
- Cross-link back to ref-arch CLI runtime if changes affect shared code.
- Capture prompts/scripts used for scaffolding or packaging steps.
