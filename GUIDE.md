---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Guide
Summary: Operating playbook for developing and maintaining the Fathym CLI.
Created: 2025-11-20
Updated: 2025-11-29
Owners:
  - fathym
References:
  - Label: Project README
    Path: ./README.md
  - Label: Project Agents Guide
    Path: ./AGENTS.md
  - Label: Documentation
    Path: ./docs/README.mdx
  - Label: Open-Source Agents Guide
    Path: ../AGENTS.md
  - Label: Open-Source Guide
    Path: ../GUIDE.md
  - Label: Workspace Guide
    Path: ../../WORKSPACE_GUIDE.md
---

# Fathym CLI Guide

Operating playbook for developing and maintaining the Fathym CLI.

## Development Workflow

### 1. Understand Before Changing

```bash
# Type check
deno task build

# Run tests
deno task test

# Format and lint
deno fmt && deno lint
```

Key files to understand:
- `commands/*.ts` - Command implementations with JSDoc
- `.cli.json` - CLI identity configuration
- `templates/` - Scaffolding templates

### 2. Make Changes

Follow these patterns:
- Commands use fluent `Command()` API or class-based `CommandRuntime`
- Params classes extend `CommandParams<ArgsType, FlagsType>`
- Use `this.Arg(n)` and `this.Flag('name')` only in Params getters
- Services resolved via IoC: `ioc.Resolve(ServiceClass)`

### 3. Test Thoroughly

```bash
# Run all intent tests
deno task test

# Run specific test file
ftm test ./intents/hello.intents.ts --config=./.cli.json

# Run with filter
ftm test --filter=hello --config=./.cli.json
```

### 4. Document

- Add JSDoc to all public APIs
- Update relevant docs in `docs/` folder
- Include examples from intent tests

## Common Tasks

### Adding a Command

1. Create `commands/my-command.ts` with JSDoc
2. Define `ArgsSchema` and `FlagsSchema` with Zod
3. Create `MyCommandParams` class with getters
4. Build command with fluent API
5. Add intent tests in `intents/my-command.intents.ts`

### Building and Compiling

```bash
# Build static artifacts to .build/
deno task ftm-cli:build

# Compile to native binary in .dist/
deno task ftm-cli:compile

# Run from source
deno task ftm-cli:run <command>
```

### Running Intent Tests

```bash
# Full test suite
deno task test

# Release preparation (builds, compiles, installs, tests)
deno task ftm-cli:release
```

## Verification Checklist

- [ ] `deno fmt` and `deno lint` pass
- [ ] `deno task test` passes
- [ ] Build/compile produce working artifacts
- [ ] All docs have proper frontmatter
- [ ] JSDoc added to new/modified code
- [ ] Links remain relative
