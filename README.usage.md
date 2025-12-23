---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Usage
Summary: How to run, build, and compile the Fathym CLI in this repo.
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

# Fathym CLI Usage

## Prereqs

- Deno installed.
- Access to the ref-arch CLI runtime (imported via `@fathym/cli` path in
  `deno.jsonc`).

## Commands

- Run CLI locally:
  - `deno task cli:run ./.cli.json --help`
- Build embedded artifacts:
  - `deno task ftm:build`
- Compile to native binary:
  - `deno task ftm:compile -- --output ./.dist/fathym-cli`

## Development

- Format/lint/test: `deno task fmt && deno task lint && deno task test`
- Templates live under `./templates`; commands under `./commands`; root config
  in `.cli.json`.
- Uses telemetry-backed logging from the shared `@fathym/cli` runtime.
