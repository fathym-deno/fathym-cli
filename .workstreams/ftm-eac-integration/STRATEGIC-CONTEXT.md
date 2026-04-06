---
FrontmatterVersion: 1
DocumentType: Context
Title: 'Strategic Context - ftm-eac-integration'
Summary: 'Composition strategy for EaC CLI commands'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: ftm-eac Strategic Context
    Path: ../../../../everything-as-code/eac/.workstreams/ftm-eac/STRATEGIC-CONTEXT.md
  - Label: Master Plan
    Path: ../../../../../../.claude/plans/snug-prancing-melody.md
---

# Strategic Context

This document captures the strategic rationale for the ftm-eac-integration
workstream.

---

## The Key Insight

> **CLI is the developer's primary interface to EaC.** **Unified commands across
> all micro frameworks creates a cohesive DX.** **The CLI enables AI agents to
> work with EaC projects programmatically.**

---

## Strategic Vision

Compose all EaC frameworks into fathym-cli:

- **Unified namespace** - All EaC commands under `ftm eac`
- **Consistent patterns** - Same command structure across frameworks
- **Shared services** - Common functionality in service layer
- **AI-accessible** - Commands that AI agents can invoke

---

## Composition Strategy

### Why Compose Rather Than Separate CLIs

| Separate CLIs      | Unified CLI           |
| ------------------ | --------------------- |
| Multiple installs  | Single install        |
| Different patterns | Consistent UX         |
| No shared services | Shared infrastructure |
| Harder for AI      | AI-friendly structure |

### The Plugin Model

Each framework contributes a **command group** that plugs into the CLI:

```typescript
// fathym-cli discovers and registers these automatically
commands/
├── eac/           ← Core EaC group
├── eac/islands/   ← Islands subgroup
├── eac/nats/      ← NATS subgroup
└── eac/mcp/       ← MCP subgroup
```

---

## Developer Experience Goals

### 1. Discoverability

```bash
ftm eac --help          # Shows all EaC commands
ftm eac islands --help  # Shows islands subcommands
```

### 2. Consistency

Every `describe` command outputs AI-comprehensible schema:

- `ftm eac describe`
- `ftm eac islands describe`
- `ftm eac nats describe`
- `ftm eac mcp describe`

### 3. Project Scaffolding

```bash
ftm eac init                    # Basic EaC project
ftm eac islands init my-app     # Islands project
ftm eac nats init my-messaging  # NATS project
ftm eac mcp init my-server      # MCP project
```

### 4. Unified Serve

```bash
ftm eac serve          # Runs whatever runtime is configured
# Works for islands, NATS, MCP, or any combination
```

---

## AI Integration

### Commands AI Agents Use

1. **`ftm eac describe`** - AI reads project structure
2. **`ftm eac validate`** - AI checks configuration validity
3. **`ftm eac init`** - AI scaffolds new projects
4. **`ftm eac serve`** - AI runs local servers for testing

### Example AI Workflow

```bash
# AI creates a new project
ftm eac islands init dashboard

# AI reads the configuration
ftm eac describe --format json

# AI validates changes
ftm eac validate

# AI runs the dev server
ftm eac islands dev
```

---

## What ftm-eac-integration Does NOT Do

1. **Does NOT implement frameworks** - Just CLI commands
2. **Does NOT define fluent APIs** - Uses APIs from other workstreams
3. **Does NOT replace existing CLI commands** - Adds to fathym-cli
4. **Does NOT work without dependencies** - Requires all other EaC workstreams

---

## Success Criteria Alignment

| Strategic Goal        | How ftm-eac-integration Achieves It       |
| --------------------- | ----------------------------------------- |
| Unified DX            | All commands under `ftm eac`              |
| AI accessibility      | `describe` commands output JSON Schema    |
| Fast onboarding       | `init` commands scaffold working projects |
| Framework composition | Multiple frameworks in one CLI            |
