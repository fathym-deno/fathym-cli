---
FrontmatterVersion: 1
DocumentType: Guide
Title: Fathym CLI Agents Guide
Summary: Guardrails for collaborating on the open-source Fathym CLI project.
Created: 2025-11-20
Updated: 2025-11-29
Owners:
  - fathym
References:
  - Label: Project README
    Path: ./README.md
  - Label: Project Guide
    Path: ./GUIDE.md
  - Label: Documentation
    Path: ./docs/README.mdx
  - Label: Open-Source Agents Guide
    Path: ../AGENTS.md
  - Label: Open-Source Guide
    Path: ../GUIDE.md
  - Label: Workspace Agents Guide
    Path: ../../AGENTS.md
  - Label: Workspace Guide
    Path: ../../WORKSPACE_GUIDE.md
---

# AGENTS: Fathym CLI

Guardrails for humans and AI collaborating on the Fathym CLI project.

## Core Guardrails

1. **Stay scoped.** Keep CLI work inside `projects/open-source/fathym-cli/`.
2. **Public-friendly.** No secrets, tokens, or internal-only links in sources.
3. **Frontmatter required.** Every Markdown/MDX doc uses workspace frontmatter standard.
4. **Document source first.** Add JSDoc to commands before writing external docs.
5. **Preserve compatibility.** Note breaking changes explicitly in UPSTREAM.md.
6. **Pin dependencies.** Align with `@fathym/cli` version; update import map when changing.

## Documentation Standards

- **Source files**: JSDoc with execution flow, examples, and parameter docs
- **Docs folder**: MDX files with frontmatter in api/concepts/guides structure
- **Root files**: README, GUIDE, AGENTS, UPSTREAM with frontmatter

## Command Patterns

When adding or modifying commands:

```typescript
// Required: Module-level JSDoc
/**
 * Command description with execution flow diagram.
 * @module
 */

// Required: Schema documentation
export const ArgsSchema = z.tuple([...]);
export const FlagsSchema = z.object({...});

// Required: Params class with documented getters
class MyParams extends CommandParams<...> {
  /** Getter description */
  get Value(): Type { return this.Arg(0); }
}
```

## Communication

- Declare intent before edits and summarize outcomes.
- Cross-link to ref-arch CLI runtime if changes affect shared code.
- Add intent tests for new commands.
- Run `deno task test` before committing.
