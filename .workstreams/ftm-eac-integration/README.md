---
FrontmatterVersion: 1
DocumentType: Guide
Title: 'ftm-eac-integration - Workstream Suite'
Summary: 'Compose all EaC frameworks into fathym-cli under ftm eac command namespace'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: fathym-cli Project
    Path: ../../README.md
  - Label: ftm-eac Core
    Path: ../../../../everything-as-code/eac/.workstreams/ftm-eac/
  - Label: Master Plan
    Path: ../../../../../../.claude/plans/snug-prancing-melody.md
---

# ftm-eac-integration

> **Compose all EaC frameworks into fathym-cli under `ftm eac ...` namespace.**

This workstream integrates all EaC micro frameworks into the Fathym CLI, providing a unified developer experience for EaC runtime development.

---

## Quick Navigation

### For Implementers

- [Track 1: Plugin Composition](./Track1-PluginComposition.workstream.md) - Group registration
- [Track 2: Core Commands](./Track2-CoreCommands.workstream.md) - ftm eac init/serve/build/describe/validate
- [Track 3: Islands Commands](./Track3-IslandsCommands.workstream.md) - ftm eac islands
- [Track 4: NATS Commands](./Track4-NATSCommands.workstream.md) - ftm eac nats
- [Track 5: MCP Commands](./Track5-MCPCommands.workstream.md) - ftm eac mcp
- [Track 6: Shared Services](./Track6-SharedServices.workstream.md) - EaCService, RuntimeService
- [Track 7: Templates](./Track7-Templates.workstream.md) - Scaffold templates
- [Track 8: Documentation](./Track8-Documentation.workstream.md) - Usage docs

### Context & Reference

- [Strategic Context](./STRATEGIC-CONTEXT.md) - Composition strategy
- [Architecture](./ARCHITECTURE.md) - Plugin composition pattern

### Tracking

- [Risk Registry](./RISKS.md) - Active risks and mitigations
- [Opportunity Registry](./OPPORTUNITIES.md) - Strategic opportunities
- [Agent Learnings](./CLAUDE.md) - Accumulated context for AI agents
- [Sessions Log](./SESSIONS.md) - Execution session tracking
- [Agent Onboarding](./AGENTS.md) - How to work on this workstream

---

## Command Hierarchy

```
ftm eac                     ← Core EaC commands
  ├── init                  ← Initialize EaC project
  ├── serve                 ← Run the runtime
  ├── build                 ← Build/compile
  ├── describe              ← Output AI-comprehensible schema
  ├── validate              ← Validate configuration
  │
  ├── islands               ← Islands framework commands
  │     ├── init            ← Scaffold islands project
  │     ├── build           ← Build island bundles
  │     ├── dev             ← Dev server with HMR
  │     └── describe        ← Output island schema
  │
  ├── nats                  ← NATS messaging commands
  │     ├── init            ← Scaffold NATS project
  │     ├── connect         ← Test connectivity
  │     └── describe        ← Output NATS schema
  │
  └── mcp                   ← MCP server commands
        ├── init            ← Scaffold MCP project
        ├── serve           ← Run MCP server
        └── describe        ← Output tool schema
```

---

## Track Overview

| Track                           | Objective            | Deliverables                              | Priority |
| ------------------------------- | -------------------- | ----------------------------------------- | -------- |
| **Track 1: Plugin Composition** | Group registration   | .group.ts files for each namespace        | CRITICAL |
| **Track 2: Core Commands**      | EaC runtime commands | init, serve, build, describe, validate    | CRITICAL |
| **Track 3: Islands Commands**   | Islands framework    | init, build, dev, describe                | HIGH     |
| **Track 4: NATS Commands**      | NATS messaging       | init, connect, describe                   | HIGH     |
| **Track 5: MCP Commands**       | MCP server           | init, serve, describe                     | HIGH     |
| **Track 6: Shared Services**    | Service layer        | EaCService, RuntimeService, SchemaService | CRITICAL |
| **Track 7: Templates**          | Project scaffolds    | Templates for each framework              | HIGH     |
| **Track 8: Documentation**      | Usage guides         | README, composition docs                  | MEDIUM   |

---

## Dependency Chain

```
ftm-eac (Core) ─────────────────────────┐
ftm-eac-islands ─────────────────────────┼──→ ftm-eac-integration
ftm-eac-nats ───────────────────────────┤    (THIS WORKSTREAM)
ftm-eac-mcp ────────────────────────────┘
```

**This workstream depends on ALL other EaC workstreams completing first.**

---

## Success Metrics

| Metric              | Target           | Why It Matters               |
| ------------------- | ---------------- | ---------------------------- |
| Commands registered | All work         | User can access all commands |
| Subgroups work      | All work         | Organized command structure  |
| Services available  | In IoC           | Commands can use services    |
| Templates scaffold  | Working projects | Fast developer onboarding    |

---

## Related Workstreams

| Workstream          | Relationship          | Location                                                               |
| ------------------- | --------------------- | ---------------------------------------------------------------------- |
| **ftm-eac**         | Composes (DEPENDENCY) | `../../../../everything-as-code/eac/.workstreams/ftm-eac/`             |
| **ftm-eac-islands** | Composes (DEPENDENCY) | `../../../../eac-app-runtime/eac-preact/.workstreams/ftm-eac-islands/` |
| **ftm-eac-nats**    | Composes (DEPENDENCY) | `../../../../eac-app-runtime/eac-nats/.workstreams/ftm-eac-nats/`      |
| **ftm-eac-mcp**     | Composes (DEPENDENCY) | `../../../../eac-app-runtime/eac-mcp/.workstreams/ftm-eac-mcp/`        |
