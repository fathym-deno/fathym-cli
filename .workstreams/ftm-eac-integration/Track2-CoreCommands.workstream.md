---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 2: Core EaC Commands'
Summary: 'ftm eac init/serve/build/describe/validate commands'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 2
Priority: CRITICAL
Status: NOT_STARTED
DependsOn:
  - Track 1 (Plugin Composition)
  - Track 6 (Shared Services)
References:
  - Label: Workstream README
    Path: ./README.md
---

# Track 2: Core EaC Commands

Implement the core `ftm eac` commands.

---

## Deliverables

| #   | Deliverable      | File Path                  | Priority | Status      |
| --- | ---------------- | -------------------------- | -------- | ----------- |
| 2.1 | ftm eac init     | `commands/eac/init.ts`     | CRITICAL | NOT_STARTED |
| 2.2 | ftm eac serve    | `commands/eac/serve.ts`    | CRITICAL | NOT_STARTED |
| 2.3 | ftm eac build    | `commands/eac/build.ts`    | HIGH     | NOT_STARTED |
| 2.4 | ftm eac describe | `commands/eac/describe.ts` | HIGH     | NOT_STARTED |
| 2.5 | ftm eac validate | `commands/eac/validate.ts` | HIGH     | NOT_STARTED |

---

## Command Specifications

### 2.1 ftm eac init

```bash
ftm eac init [project-name]
  --template=<basic|api|full>  # Default: basic
```

### 2.2 ftm eac serve

```bash
ftm eac serve [config-path]
  --port=<number>    # Default: 8000
  --watch            # Enable file watching
```

### 2.3 ftm eac build

```bash
ftm eac build [config-path]
  --output=<dir>     # Default: dist
  --minify           # Default: true
```

### 2.4 ftm eac describe

```bash
ftm eac describe [config-path]
  --format=<json|yaml>  # Default: json
```

### 2.5 ftm eac validate

```bash
ftm eac validate [config-path]
  --strict           # Fail on warnings
```

---

## Success Criteria

1. **Commands work** - Each command executes successfully
2. **Flags parsed** - All flags work as documented
3. **Services used** - Commands use EaCService/RuntimeService
4. **Output correct** - Describe outputs valid JSON Schema
