---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 7: Templates'
Summary: 'Project scaffold templates for each framework'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 7
Priority: HIGH
Status: NOT_STARTED
DependsOn:
  - All other EaC workstreams (templates use their APIs)
References:
  - Label: Workstream README
    Path: ./README.md
---

# Track 7: Templates

Create project scaffold templates for `ftm eac init` commands.

---

## Deliverables

| #   | Deliverable              | File Path                     | Priority | Status      |
| --- | ------------------------ | ----------------------------- | -------- | ----------- |
| 7.1 | EaC runtime template     | `templates/eac-init/`         | HIGH     | NOT_STARTED |
| 7.2 | Islands project template | `templates/eac-islands-init/` | HIGH     | NOT_STARTED |
| 7.3 | NATS project template    | `templates/eac-nats-init/`    | MEDIUM   | NOT_STARTED |
| 7.4 | MCP server template      | `templates/eac-mcp-init/`     | MEDIUM   | NOT_STARTED |

---

## Template Structure

### 7.1 EaC Runtime Template

```
templates/eac-init/
├── template.json           # Metadata
├── main.ts.template
├── eac.config.ts.template
├── deno.json.template
└── README.md.template
```

### 7.2 Islands Template

```
templates/eac-islands-init/
├── template.json
├── main.ts.template
├── eac.config.ts.template
├── apps/
│   └── main/
│       └── routes/
│           └── index.tsx.template
├── components/
│   └── Counter.tsx.template
└── deno.json.template
```

### 7.3 NATS Template

```
templates/eac-nats-init/
├── template.json
├── main.ts.template
├── eac.config.ts.template
├── apps/
│   └── nats/
│       └── orders/
│           └── created.ts.template
└── deno.json.template
```

### 7.4 MCP Template

```
templates/eac-mcp-init/
├── template.json
├── main.ts.template
├── eac.config.ts.template
├── apps/
│   └── mcp/
│       ├── tools/
│       │   └── query.tool.ts.template
│       └── resources/
│           └── catalog.resource.ts.template
└── deno.json.template
```

---

## Template Variables

```json
{
  "projectName": "{{ projectName }}",
  "port": "{{ port }}",
  "author": "{{ author }}"
}
```

---

## Success Criteria

1. **Templates scaffold working projects** - Projects run immediately
2. **Variables substituted** - Placeholders replaced correctly
3. **Best practices** - Templates demonstrate idiomatic usage
