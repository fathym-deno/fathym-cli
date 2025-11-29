---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI
Summary: Open-source CLI tool for scaffolding, building, and distributing command-line interfaces.
Created: 2025-11-20
Updated: 2025-11-29
Owners:
  - fathym
References:
  - Label: Project Agents Guide
    Path: ./AGENTS.md
  - Label: Project Guide
    Path: ./GUIDE.md
  - Label: Documentation
    Path: ./docs/README.mdx
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

Open-source CLI framework for building, scaffolding, and distributing command-line interfaces. Built on Deno with the `@fathym/cli` runtime.

## Features

- **Declarative** - Configure CLI identity, commands, and tokens in `.cli.json`
- **Scaffolding** - Initialize new CLI projects with `ftm init`
- **Compilation** - Build native binaries with `ftm compile`
- **Testing** - Intent-based testing with `CommandIntent` API
- **Cross-Platform** - Windows and Unix support with proper alias handling

## Quick Start

```bash
# Initialize a new CLI project
ftm init my-cli

# Navigate to project
cd my-cli

# Run a command in development mode
ftm run hello

# Build and compile to native binary
ftm build
ftm compile

# Install to PATH
ftm install --useHome
```

## Commands

| Command | Description |
|---------|-------------|
| `ftm init [name]` | Scaffold a new CLI project |
| `ftm build` | Prepare static build artifacts |
| `ftm compile` | Compile to native binary |
| `ftm run <command>` | Execute command in development mode |
| `ftm test [file]` | Run intent tests |
| `ftm install` | Install compiled binary to PATH |

## Project Structure

```
my-cli/
├── .cli.json           # CLI identity (Name, Tokens, Version)
├── .cli.init.ts        # IoC initialization hook
├── deno.jsonc          # Deno configuration
├── commands/           # Command implementations
├── intents/            # Intent test files
└── templates/          # Scaffolding templates (optional)
```

## Status

- **Version**: 0.0.0 (pre-release)
- **Runtime**: `@fathym/cli@0.0.65-integration`
- **Distribution**: Pending (Deno task, npm, or compiled binary)

## How to Work Here

1. Review project guardrails in [`AGENTS.md`](./AGENTS.md) and the playbook in [`GUIDE.md`](./GUIDE.md).
2. Keep docs frontmatter-complete; link back to parent guides.
3. See [`docs/`](./docs/) for detailed documentation.
4. Run `deno task test` to verify changes.
