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

Open-source CLI framework for building, scaffolding, and distributing
command-line interfaces. Built on Deno with the `@fathym/cli` runtime.

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

| Command             | Description                         |
| ------------------- | ----------------------------------- |
| `ftm init [name]`   | Scaffold a new CLI project          |
| `ftm build`         | Prepare static build artifacts      |
| `ftm compile`       | Compile to native binary            |
| `ftm run <command>` | Execute command in development mode |
| `ftm test [file]`   | Run intent tests                    |
| `ftm install`       | Install compiled binary to PATH     |

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

## Project Resolution

The CLI supports flexible project reference resolution for commands that operate
on workspace projects.

### Reference Types

| Input               | Resolution                    |
| ------------------- | ----------------------------- |
| `@scope/pkg`        | Resolve by package name       |
| `./path/deno.jsonc` | Direct config file path       |
| `./packages/app`    | Directory with deno.json(c)   |
| `@pkg/a,@pkg/b`     | Multiple comma-separated refs |

### Multi-Project Operations

Use comma-separated refs to operate on multiple projects:

```bash
# Build multiple packages
ftm projects @pkg/core,@pkg/utils build --all

# Test specific projects
ftm projects @fathym/cli,@fathym/common test --all

# Use --first to run on first match only
ftm projects ./packages/ build --first
```

### Resolution Options

Commands using the `DFSProjectResolver` support these options:

| Option       | Description                            |
| ------------ | -------------------------------------- |
| `--all`      | Run on all matched projects            |
| `--first`    | Run on first matched project only      |
| `singleOnly` | (API) Throw if multiple projects found |
| `useFirst`   | (API) Return only first match          |

### API Usage

```typescript
import { DFSProjectResolver, parseRefs } from '@fathym/ftm/projects';

const resolver = new DFSProjectResolver(dfsHandler);

// Resolve multiple refs
const projects = await resolver.Resolve('@pkg/a,@pkg/b');

// Ensure single project (throws if multiple)
const [single] = await resolver.Resolve('@pkg', { singleOnly: true });

// Get first match only
const [first] = await resolver.Resolve('./packages/', { useFirst: true });

// Parse refs manually
const refs = parseRefs('@a, @b, @c'); // ['@a', '@b', '@c']
```

## Status

- **Version**: 0.0.0 (pre-release)
- **Runtime**: `@fathym/cli@0.0.65-integration`
- **Distribution**: Pending (Deno task, npm, or compiled binary)

## How to Work Here

1. Review project guardrails in [`AGENTS.md`](./AGENTS.md) and the playbook in
   [`GUIDE.md`](./GUIDE.md).
2. Keep docs frontmatter-complete; link back to parent guides.
3. See [`docs/`](./docs/) for detailed documentation.
4. Run `deno task test` to verify changes.
