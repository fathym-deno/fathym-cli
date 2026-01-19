---
FrontmatterVersion: 1
DocumentType: Context
Title: 'Architecture - ftm-eac-integration'
Summary: 'Plugin composition pattern, command structure, service layer'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: ftm-eac Architecture
    Path: ../../../../everything-as-code/eac/.workstreams/ftm-eac/ARCHITECTURE.md
---

# Architecture

This document details the technical architecture for the ftm-eac-integration workstream.

---

## Core Design Principle

**The CLI uses fathym-cli's plugin/group system to compose EaC commands.**

Each micro framework contributes commands via a `.group.ts` file that registers with the CLI infrastructure.

---

## Command Group Structure

```
commands/eac/
├── .group.ts              ← Root EaC group registration
├── init.ts                ← ftm eac init
├── serve.ts               ← ftm eac serve
├── build.ts               ← ftm eac build
├── describe.ts            ← ftm eac describe
├── validate.ts            ← ftm eac validate
│
├── islands/               ← Islands subgroup
│   ├── .group.ts
│   ├── init.ts
│   ├── build.ts
│   ├── dev.ts
│   └── describe.ts
│
├── nats/                  ← NATS subgroup
│   ├── .group.ts
│   ├── init.ts
│   ├── connect.ts
│   └── describe.ts
│
└── mcp/                   ← MCP subgroup
    ├── .group.ts
    ├── init.ts
    ├── serve.ts
    └── describe.ts
```

---

## Group Registration Pattern

### Root EaC Group

```typescript
// commands/eac/.group.ts
import { Group } from '@fathym/cli';
import { EaCService, RuntimeService } from '@fathym/eac';

export default Group('eac', 'Everything as Code runtime commands')
  .Commands(['./']) // Core commands in this folder
  .OnInit((ioc) => {
    // Register EaC-specific services
    ioc.Register(EaCService, () => new EaCService());
    ioc.Register(RuntimeService, () => new RuntimeService());
  });
```

### Subgroup Pattern

```typescript
// commands/eac/islands/.group.ts
import { Group } from '@fathym/cli';
import { IslandsService } from '@fathym/eac-preact';

export default Group('islands', 'Islands framework commands')
  .Commands(['./'])
  .OnInit((ioc) => {
    ioc.Register(IslandsService, () => new IslandsService());
  });
```

---

## Command Pattern

### Standard Command Structure

```typescript
// commands/eac/serve.ts
import { Command } from '@fathym/cli';
import { z } from 'zod';
import { EaCRuntimeRunner, ServerStart } from '@fathym/eac';

export default Command('serve', 'Run the EaC runtime')
  .Args(z.tuple([z.string().optional().describe('Runtime config path')]))
  .Flags(z.object({
    port: z.number().default(8000).describe('Server port'),
    watch: z.boolean().default(false).describe('Enable file watching'),
  }))
  .Run(async ({ Params, Services }) => {
    const [configPath] = Params.Args();
    const { port, watch } = Params.Flags();

    const runtime = await Services.eac.LoadRuntime(configPath);
    await EaCRuntimeRunner(runtime).Run(ServerStart({ port, watch }));

    return { Code: 0 };
  });
```

### Init Command Pattern

```typescript
// commands/eac/init.ts
import { Command } from '@fathym/cli';
import { z } from 'zod';

export default Command('init', 'Initialize a new EaC project')
  .Args(z.tuple([z.string().optional().describe('Project name')]))
  .Flags(z.object({
    template: z.enum(['basic', 'api', 'full']).default('basic'),
  }))
  .Run(async ({ Params, Services }) => {
    const [projectName] = Params.Args();
    const { template } = Params.Flags();

    await Services.eac.ScaffoldProject(projectName ?? '.', template);

    return { Code: 0, Message: `Project initialized with ${template} template` };
  });
```

---

## Service Layer

### EaCService

Core EaC operations:

```typescript
// src/eac/EaCService.ts
export class EaCService {
  async LoadRuntime(configPath?: string): Promise<EaCRuntimeModule> {
    const path = configPath ?? './eac.config.ts';
    const module = await import(path);
    return module.default;
  }

  async ValidateRuntime(runtime: EaCRuntimeModule): Promise<ValidationResult> {
    // Validate configuration against types
  }

  async DescribeRuntime(runtime: EaCRuntimeModule): Promise<AISchema> {
    // Generate AI-comprehensible schema
  }

  async ScaffoldProject(name: string, template: string): Promise<void> {
    // Copy template files and configure
  }
}
```

### RuntimeService

Runtime execution:

```typescript
// src/eac/RuntimeService.ts
export class RuntimeService {
  async Start(runtime: EaCRuntimeModule, options: StartOptions): Promise<void> {
    await EaCRuntimeRunner(runtime).Run(ServerStart(options));
  }

  async Build(runtime: EaCRuntimeModule, options: BuildOptions): Promise<void> {
    await EaCRuntimeRunner(runtime).Run(Bundle(options));
  }
}
```

### SchemaService

AI schema generation:

```typescript
// src/eac/SchemaService.ts
export class SchemaService {
  async Describe(runtime: EaCRuntimeModule, format: 'json' | 'yaml'): Promise<string> {
    const schema = await EaCRuntimeRunner(runtime).Run(Describe({ format }));
    return format === 'json' ? JSON.stringify(schema, null, 2) : toYaml(schema);
  }
}
```

---

## Template System

### Template Structure

```
templates/
├── eac-init/
│   ├── template.json        # Template metadata
│   ├── main.ts.template
│   ├── eac.config.ts.template
│   └── deno.json.template
│
├── eac-islands-init/
│   ├── template.json
│   ├── main.ts.template
│   ├── eac.config.ts.template
│   ├── apps/
│   │   └── main/
│   │       └── routes/
│   │           └── index.tsx.template
│   └── components/
│       └── Counter.tsx.template
│
├── eac-nats-init/
│   └── ...
│
└── eac-mcp-init/
    └── ...
```

### Template Processing

```typescript
// Template variables
const vars = {
  projectName: 'my-app',
  port: 3000,
  // ...
};

// Files are processed with variable substitution
// {{ projectName }} → my-app
```

---

## File Structure After Implementation

```
fathym-cli/
├── commands/
│   ├── cli/           # Existing
│   ├── git/           # Existing
│   ├── projects/      # Existing
│   └── eac/           # NEW
│       ├── .group.ts
│       ├── init.ts
│       ├── serve.ts
│       ├── build.ts
│       ├── describe.ts
│       ├── validate.ts
│       ├── islands/
│       │   ├── .group.ts
│       │   ├── init.ts
│       │   ├── build.ts
│       │   ├── dev.ts
│       │   └── describe.ts
│       ├── nats/
│       │   ├── .group.ts
│       │   ├── init.ts
│       │   ├── connect.ts
│       │   └── describe.ts
│       └── mcp/
│           ├── .group.ts
│           ├── init.ts
│           ├── serve.ts
│           └── describe.ts
├── src/
│   └── eac/           # NEW
│       ├── EaCService.ts
│       ├── RuntimeService.ts
│       └── SchemaService.ts
├── templates/
│   ├── eac-init/      # NEW
│   ├── eac-islands-init/
│   ├── eac-nats-init/
│   └── eac-mcp-init/
└── tests/
    └── intents/
        └── eac/       # NEW
```

---

## Verification Commands

```bash
# Check registration
ftm eac --help
ftm eac islands --help
ftm eac nats --help
ftm eac mcp --help

# Test scaffolding
ftm eac init test-project
ftm eac islands init test-islands

# Test runtime
cd test-project
ftm eac serve

# Run tests
ftm cli test tests/intents/eac/
```
