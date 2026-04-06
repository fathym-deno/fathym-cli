---
FrontmatterVersion: 1
DocumentType: Context
Title: 'Opportunity Registry - ftm-eac-integration'
Summary: 'Strategic opportunities identified for the integration workstream'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: Workstream README
    Path: ./README.md
---

# Opportunity Registry

Strategic opportunities identified during workstream execution.

---

## Active Opportunities

### O1: AI-Driven Project Generation

| Attribute  | Value      |
| ---------- | ---------- |
| **ID**     | O1         |
| **Status** | IDENTIFIED |
| **Value**  | HIGH       |
| **Effort** | MEDIUM     |

**Description:** AI agents could use `ftm eac init` commands to scaffold
projects based on natural language descriptions.

**Opportunity:**

- "Create an islands app with NATS messaging"
- AI selects and composes appropriate templates
- Customizes based on requirements

---

### O2: Interactive Init Commands

| Attribute  | Value      |
| ---------- | ---------- |
| **ID**     | O2         |
| **Status** | IDENTIFIED |
| **Value**  | MEDIUM     |
| **Effort** | LOW        |

**Description:** Make `init` commands interactive, prompting for configuration
options.

**Opportunity:**

- Better user experience
- Guided setup
- Fewer required flags

---

### O3: Cloud Deployment Commands

| Attribute  | Value    |
| ---------- | -------- |
| **ID**     | O3       |
| **Status** | WATCHING |
| **Value**  | HIGH     |
| **Effort** | HIGH     |

**Description:** Add `ftm eac deploy` commands for deploying to cloud platforms.

**Opportunity:**

- Deno Deploy integration
- Azure integration
- AWS Lambda support

---

### O4: Multi-Framework Project Templates

| Attribute  | Value      |
| ---------- | ---------- |
| **ID**     | O4         |
| **Status** | IDENTIFIED |
| **Value**  | MEDIUM     |
| **Effort** | MEDIUM     |

**Description:** Templates that combine multiple frameworks (Islands + MCP,
NATS + API).

**Opportunity:**

- Real-world project structures
- Best practices for composition
- Faster complex setup

---

### O5: Command Autocomplete

| Attribute  | Value      |
| ---------- | ---------- |
| **ID**     | O5         |
| **Status** | IDENTIFIED |
| **Value**  | LOW        |
| **Effort** | LOW        |

**Description:** Shell autocomplete for `ftm eac` commands.

**Opportunity:**

- Better developer experience
- Faster command entry
- Discoverable options

---

## Opportunity Summary

| Opportunity                   | Value  | Effort | Status     |
| ----------------------------- | ------ | ------ | ---------- |
| O1: AI Project Generation     | HIGH   | MEDIUM | IDENTIFIED |
| O2: Interactive Init          | MEDIUM | LOW    | IDENTIFIED |
| O3: Cloud Deployment          | HIGH   | HIGH   | WATCHING   |
| O4: Multi-Framework Templates | MEDIUM | MEDIUM | IDENTIFIED |
| O5: Autocomplete              | LOW    | LOW    | IDENTIFIED |
