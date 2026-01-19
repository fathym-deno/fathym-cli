---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 5: MCP Commands'
Summary: 'ftm eac mcp init/serve/describe commands'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 5
Priority: HIGH
Status: NOT_STARTED
DependsOn:
  - Track 1 (Plugin Composition)
  - ftm-eac-mcp workstream
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: ftm-eac-mcp
    Path: ../../../../eac-app-runtime/eac-mcp/.workstreams/ftm-eac-mcp/
---

# Track 5: MCP Commands

Implement the `ftm eac mcp` command group.

---

## Deliverables

| #   | Deliverable          | File Path                      | Priority | Status      |
| --- | -------------------- | ------------------------------ | -------- | ----------- |
| 5.1 | ftm eac mcp init     | `commands/eac/mcp/init.ts`     | HIGH     | NOT_STARTED |
| 5.2 | ftm eac mcp serve    | `commands/eac/mcp/serve.ts`    | HIGH     | NOT_STARTED |
| 5.3 | ftm eac mcp describe | `commands/eac/mcp/describe.ts` | MEDIUM   | NOT_STARTED |

---

## Command Specifications

### 5.1 ftm eac mcp init

```bash
ftm eac mcp init [project-name]
  --template=<basic|data-query|ai-tools>
  --profile=<name>
```

### 5.2 ftm eac mcp serve

```bash
ftm eac mcp serve
  --port=<number>
  --profile=<name>
```

### 5.3 ftm eac mcp describe

```bash
ftm eac mcp describe
  --format=<json|yaml>
```

Outputs AI-comprehensible tool, resource, prompt, and event definitions.

---

## Success Criteria

1. **Init creates working project** - Scaffolded MCP server runs
2. **Serve starts MCP server** - Server responds to MCP protocol
3. **Describe shows capabilities** - All tools/resources/prompts listed
