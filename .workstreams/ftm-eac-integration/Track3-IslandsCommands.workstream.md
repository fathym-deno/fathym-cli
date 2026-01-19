---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 3: Islands Commands'
Summary: 'ftm eac islands init/build/dev/describe commands'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 3
Priority: HIGH
Status: NOT_STARTED
DependsOn:
  - Track 1 (Plugin Composition)
  - ftm-eac-islands workstream
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: ftm-eac-islands
    Path: ../../../../eac-app-runtime/eac-preact/.workstreams/ftm-eac-islands/
---

# Track 3: Islands Commands

Implement the `ftm eac islands` command group.

---

## Deliverables

| #   | Deliverable              | File Path                          | Priority | Status      |
| --- | ------------------------ | ---------------------------------- | -------- | ----------- |
| 3.1 | ftm eac islands init     | `commands/eac/islands/init.ts`     | HIGH     | NOT_STARTED |
| 3.2 | ftm eac islands build    | `commands/eac/islands/build.ts`    | HIGH     | NOT_STARTED |
| 3.3 | ftm eac islands dev      | `commands/eac/islands/dev.ts`      | HIGH     | NOT_STARTED |
| 3.4 | ftm eac islands describe | `commands/eac/islands/describe.ts` | MEDIUM   | NOT_STARTED |

---

## Command Specifications

### 3.1 ftm eac islands init

```bash
ftm eac islands init [project-name]
  --template=<basic|dashboard|blog>
  --tailwind/--no-tailwind
```

### 3.2 ftm eac islands build

```bash
ftm eac islands build
  --output=<dir>
  --minify
  --sourcemaps
```

### 3.3 ftm eac islands dev

```bash
ftm eac islands dev
  --port=<number>
  --host=<host>
  --open
```

### 3.4 ftm eac islands describe

```bash
ftm eac islands describe
  --format=<json|yaml>
```

Outputs discovered islands, hydration strategies, and component tree.

---

## Success Criteria

1. **Init creates working project** - Scaffolded project runs immediately
2. **Build produces bundles** - Island JS bundles created
3. **Dev server works** - Hot reload functional
4. **Describe shows islands** - All discovered islands listed
