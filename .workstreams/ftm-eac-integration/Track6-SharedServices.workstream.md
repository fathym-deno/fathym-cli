---
FrontmatterVersion: 1
DocumentType: Workstream
Title: 'Track 6: Shared Services'
Summary: 'EaCService, RuntimeService, SchemaService for CLI commands'
Created: 2026-01-14
Updated: 2026-01-14
TrackNumber: 6
Priority: CRITICAL
Status: NOT_STARTED
References:
  - Label: Workstream README
    Path: ./README.md
  - Label: Architecture
    Path: ./ARCHITECTURE.md
---

# Track 6: Shared Services

Implement the service layer used by CLI commands.

---

## Deliverables

| #   | Deliverable    | File Path                   | Priority | Status      |
| --- | -------------- | --------------------------- | -------- | ----------- |
| 6.1 | EaCService     | `src/eac/EaCService.ts`     | CRITICAL | NOT_STARTED |
| 6.2 | RuntimeService | `src/eac/RuntimeService.ts` | CRITICAL | NOT_STARTED |
| 6.3 | SchemaService  | `src/eac/SchemaService.ts`  | HIGH     | NOT_STARTED |

---

## Service Specifications

### 6.1 EaCService

```typescript
export class EaCService {
  // Load runtime from config file
  async LoadRuntime(configPath?: string): Promise<EaCRuntimeModule>;

  // Validate runtime configuration
  async ValidateRuntime(runtime: EaCRuntimeModule): Promise<ValidationResult>;

  // Generate AI-comprehensible schema
  async DescribeRuntime(runtime: EaCRuntimeModule): Promise<AISchema>;

  // Scaffold project from template
  async ScaffoldProject(name: string, template: string): Promise<void>;
}
```

### 6.2 RuntimeService

```typescript
export class RuntimeService {
  // Start runtime server
  async Start(runtime: EaCRuntimeModule, options: StartOptions): Promise<void>;

  // Build/bundle runtime
  async Build(runtime: EaCRuntimeModule, options: BuildOptions): Promise<void>;

  // Watch for changes
  async Watch(runtime: EaCRuntimeModule, onChange: () => void): Promise<void>;
}
```

### 6.3 SchemaService

```typescript
export class SchemaService {
  // Generate JSON/YAML schema
  async Describe(runtime: EaCRuntimeModule, format: 'json' | 'yaml'): Promise<string>;

  // Validate against schema
  async Validate(runtime: EaCRuntimeModule, strict: boolean): Promise<ValidationResult>;
}
```

---

## Success Criteria

1. **Services injectable** - Registered in IoC, commands can resolve
2. **LoadRuntime works** - Loads from eac.config.ts or path
3. **Scaffold works** - Creates project from template
4. **Describe outputs schema** - Valid JSON Schema generated
