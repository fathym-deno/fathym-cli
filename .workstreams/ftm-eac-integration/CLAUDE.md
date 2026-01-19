---
FrontmatterVersion: 1
DocumentType: Log
Title: 'Agent Learnings - ftm-eac-integration'
Summary: 'Accumulated context and learnings for AI agents working on this workstream'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: Sessions Log
    Path: ./SESSIONS.md
---

# Agent Learnings

Accumulated context and learnings from working on the ftm-eac-integration workstream.

---

## Key Insights

### CLI Group Pattern

The CLI uses a Group() factory for command namespaces:

```typescript
export default Group('eac', 'Description')
  .Commands(['./']) // Register commands from this folder
  .OnInit((ioc) => {
    // Register services
  });
```

### Command Pattern

Commands use Command() factory with Zod validation:

```typescript
export default Command('serve', 'Run the runtime')
  .Args(z.tuple([...]))
  .Flags(z.object({...}))
  .Run(async ({ Params, Services }) => {
    // Implementation
  });
```

### Service Injection

Services are registered in .group.ts and accessed via `Services`:

```typescript
// In .group.ts
ioc.Register(EaCService, () => new EaCService());

// In command
const runtime = await Services.eac.LoadRuntime(path);
```

---

## Technical Decisions

### Why Shared Services

Services centralize common functionality:

- **EaCService** - Loading, validation, scaffolding
- **RuntimeService** - Starting, building
- **SchemaService** - Describe output

This avoids duplicating logic across commands.

### Why Templates Over Code Generation

Templates provide:

- Visible, editable project structure
- Easy customization
- Best practice examples
- Working code out of the box

---

## Patterns Discovered

### Template Variables

Templates use `{{ variable }}` syntax:

```typescript
// template.ts.template
const app = EaCRuntime('{{ projectName }}')
  .Build();
```

### Command Result Pattern

```typescript
return {
  Code: 0, // Exit code
  Message: '...', // Success message
};
```

---

## Gotchas and Pitfalls

| Issue                | Solution                        |
| -------------------- | ------------------------------- |
| Group not registered | Check .group.ts exports default |
| Service not found    | Ensure registered in OnInit     |
| Template not copied  | Check template.json metadata    |
| Command missing      | Must export default Command()   |

---

## Learning Log

| Date       | Learning                            | Source    |
| ---------- | ----------------------------------- | --------- |
| 2026-01-14 | Workstream created from single file | Session 1 |

---

## Open Questions

- [ ] How to handle template upgrades?
- [ ] Should init commands be interactive?
- [ ] Best approach for dev server hot reload?

---

## Reference Materials

- [Architecture](./ARCHITECTURE.md) - Technical decisions
- [ftm-eac CLAUDE.md](../../../../everything-as-code/eac/.workstreams/ftm-eac/CLAUDE.md) - Core learnings
- Existing CLI commands in `commands/` folder
