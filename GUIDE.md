---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Guide
Summary: Playbook for building, packaging, and maintaining the Fathym CLI project.
Created: 2025-11-20
Updated: 2025-11-20
Owners:
  - fathym
References:
  - Label: Project README
    Path: ./README.md
  - Label: Project Agents Guide
    Path: ./AGENTS.md
  - Label: Open-Source Agents Guide
    Path: ../AGENTS.md
  - Label: Open-Source Guide
    Path: ../GUIDE.md
  - Label: Workspace Guide
    Path: ../../WORKSPACE_GUIDE.md
---

# Fathym CLI Guide

Use this guide to manage the open-source Fathym CLI packaging and releases.

## Current Focus

- Migrate the `ftm-cli` implementation into this repo.
- Wire build/compile tasks to the shared CLI runtime and templates.
- Define distribution channel (Deno task, npm package, or compiled binary).

## Workflow

1. Align scope in `README.md` and note intended release/packaging target.
2. Port commands/templates/docs from the ref-arch CLI and update import paths to the shared runtime.
3. Set up tasks for build/compile/test; keep `.build` outputs generated, not committed, unless required.
4. Add smoke tests for command execution and packaging.
5. Document breaking changes and release notes before publishing.

## Verification

- `deno fmt`, `deno lint`, and `deno test` should succeed.
- Build/compile tasks should produce a runnable binary or Deno entry as defined.
- Links remain relative and frontmatter-complete across docs.
