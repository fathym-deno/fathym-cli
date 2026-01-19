---
FrontmatterVersion: 1
DocumentType: Guide
Title: 'Agent Onboarding - ftm-eac-integration'
Summary: 'How AI agents should work on this workstream'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: ftm-eac AGENTS
    Path: ../../../../everything-as-code/eac/.workstreams/ftm-eac/AGENTS.md
---

# Agent Onboarding

How AI agents should work on the ftm-eac-integration workstream.

---

## Quick Start

1. **Read the README** - [README.md](./README.md) for overview
2. **Review architecture** - [ARCHITECTURE.md](./ARCHITECTURE.md) for command structure
3. **Check dependencies** - ALL other EaC workstreams must complete first
4. **Understand CLI patterns** - Review existing fathym-cli commands

---

## Working on This Workstream

### Before You Start

1. **Check all dependencies** - ftm-eac, islands, nats, mcp must be complete
2. **Review existing CLI commands** - Understand `commands/` folder patterns
3. **Understand service layer** - How commands use services

### Key Constraints

| Constraint                   | Why                               |
| ---------------------------- | --------------------------------- |
| Follow CLI Group pattern     | Consistent with existing commands |
| Use IoC for services         | Standard CLI infrastructure       |
| Match existing command style | User experience consistency       |
| Templates must work          | Users expect working scaffolds    |

### What to Build

```
Track 1: Plugin composition (.group.ts files)
Track 2: Core commands (init, serve, build, describe, validate)
Track 3: Islands commands (init, build, dev, describe)
Track 4: NATS commands (init, connect, describe)
Track 5: MCP commands (init, serve, describe)
Track 6: Shared services (EaCService, RuntimeService, SchemaService)
Track 7: Templates (scaffolding for each framework)
Track 8: Documentation (usage guides)
```

---

## Code Location

| Component      | Location                                             |
| -------------- | ---------------------------------------------------- |
| Command groups | `projects/open-source/fathym-cli/commands/eac/`      |
| Services       | `projects/open-source/fathym-cli/src/eac/`           |
| Templates      | `projects/open-source/fathym-cli/templates/eac-*/`   |
| Tests          | `projects/open-source/fathym-cli/tests/intents/eac/` |

---

## Do's and Don'ts

### Do

- Follow existing CLI command patterns
- Register services in IoC
- Use Zod for argument/flag validation
- Create working templates
- Write intent tests for commands

### Don't

- Implement framework logic here (use other workstreams)
- Skip service layer (commands should use services)
- Create commands without --help documentation
- Leave templates with broken code

---

## Testing Your Work

```bash
# Test command registration
ftm eac --help

# Test scaffolding
ftm eac init test-project

# Test runtime
cd test-project && ftm eac serve

# Run intent tests
ftm cli test tests/intents/eac/
```

---

## Verification Checklist

Before marking a deliverable complete:

- [ ] Command registered and shows in --help
- [ ] All flags work correctly
- [ ] Services injected and used
- [ ] Templates scaffold working projects
- [ ] Intent tests pass
