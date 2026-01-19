---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 4: NATS Commands'
Summary: 'ftm eac nats init/connect/describe commands'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 4
Priority: HIGH
Status: NOT_STARTED
DependsOn:
  - Track 1 (Plugin Composition)
  - ftm-eac-nats workstream
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: ftm-eac-nats
    Path: ../../../../eac-app-runtime/eac-nats/.workstreams/ftm-eac-nats/
---

# Track 4: NATS Commands

Implement the `ftm eac nats` command group.

---

## Deliverables

| #   | Deliverable           | File Path                       | Priority | Status      |
| --- | --------------------- | ------------------------------- | -------- | ----------- |
| 4.1 | ftm eac nats init     | `commands/eac/nats/init.ts`     | HIGH     | NOT_STARTED |
| 4.2 | ftm eac nats connect  | `commands/eac/nats/connect.ts`  | HIGH     | NOT_STARTED |
| 4.3 | ftm eac nats describe | `commands/eac/nats/describe.ts` | MEDIUM   | NOT_STARTED |

---

## Command Specifications

### 4.1 ftm eac nats init

```bash
ftm eac nats init [project-name]
  --url=<nats-url>
  --jetstream
  --template=<basic|jetstream|request-reply>
```

### 4.2 ftm eac nats connect

```bash
ftm eac nats connect
  --url=<nats-url>
  --user=<user>
  --token=<token>
```

Tests NATS connectivity and reports server info.

### 4.3 ftm eac nats describe

```bash
ftm eac nats describe
  --format=<json|yaml>
```

Outputs subscriptions, JetStream streams, and request/reply endpoints.

---

## Success Criteria

1. **Init creates working project** - Scaffolded project connects to NATS
2. **Connect tests connectivity** - Reports server info
3. **Describe shows configuration** - All subscriptions and streams listed
