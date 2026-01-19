---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 1: Plugin Composition'
Summary: 'Group registration for EaC command namespaces'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 1
Priority: CRITICAL
Status: NOT_STARTED
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: Architecture
    Path: ./ARCHITECTURE.md
---

# Track 1: Plugin Composition

Register EaC command groups with the fathym-cli plugin system.

---

## Deliverables

| #   | Deliverable       | File Path                        | Priority | Status      |
| --- | ----------------- | -------------------------------- | -------- | ----------- |
| 1.1 | EaC command group | `commands/eac/.group.ts`         | CRITICAL | NOT_STARTED |
| 1.2 | Islands subgroup  | `commands/eac/islands/.group.ts` | HIGH     | NOT_STARTED |
| 1.3 | NATS subgroup     | `commands/eac/nats/.group.ts`    | HIGH     | NOT_STARTED |
| 1.4 | MCP subgroup      | `commands/eac/mcp/.group.ts`     | HIGH     | NOT_STARTED |

---

## Implementation

### 1.1 EaC Command Group

```typescript
// commands/eac/.group.ts
import { Group } from '@fathym/cli';
import { EaCService, RuntimeService } from '@fathym/eac';

export default Group('eac', 'Everything as Code runtime commands')
  .Commands(['./'])
  .OnInit((ioc) => {
    ioc.Register(EaCService, () => new EaCService());
    ioc.Register(RuntimeService, () => new RuntimeService());
  });
```

### 1.2-1.4 Subgroups

Follow the same pattern with framework-specific services.

---

## Success Criteria

1. **Groups registered** - `ftm eac --help` shows all commands
2. **Subgroups work** - `ftm eac islands --help` shows islands commands
3. **Services available** - Commands can resolve services from IoC
