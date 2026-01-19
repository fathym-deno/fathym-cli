---
FrontmatterVersion: 1
DocumentType: Context
Title: 'Risk Registry - ftm-eac-integration'
Summary: 'Active risks and mitigations for the integration workstream'
Created: 2026-01-14
Updated: 2026-01-14
References:
  - Label: Workstream README
    Path: ./README.md
---

# Risk Registry

Active risks and mitigations for the ftm-eac-integration workstream.

---

## Active Risks

### R1: Dependency on All Other Workstreams

| Attribute      | Value  |
| -------------- | ------ |
| **ID**         | R1     |
| **Severity**   | HIGH   |
| **Likelihood** | MEDIUM |
| **Status**     | ACTIVE |

**Description:**
This workstream depends on ftm-eac, ftm-eac-islands, ftm-eac-nats, and ftm-eac-mcp completing first. Delays in any propagate here.

**Impact:**

- Blocked work
- Schedule delays

**Mitigation:**

- Track dependency progress
- Start template design early
- Implement core commands first (less dependency)

---

### R2: Template Maintenance Burden

| Attribute      | Value  |
| -------------- | ------ |
| **ID**         | R2     |
| **Severity**   | MEDIUM |
| **Likelihood** | MEDIUM |
| **Status**     | ACTIVE |

**Description:**
Templates may become outdated as frameworks evolve. Keeping them synchronized requires ongoing effort.

**Impact:**

- Templates produce broken code
- Developer frustration

**Mitigation:**

- Test templates in CI
- Minimize template complexity
- Document update process

---

### R3: Command Surface Area

| Attribute      | Value    |
| -------------- | -------- |
| **ID**         | R3       |
| **Severity**   | LOW      |
| **Likelihood** | LOW      |
| **Status**     | WATCHING |

**Description:**
Many commands across multiple subgroups. Risk of inconsistency or overlap.

**Impact:**

- Confusing UX
- Redundant functionality

**Mitigation:**

- Consistent naming conventions
- Document all commands
- Review for overlap

---

### R4: Service Layer Complexity

| Attribute      | Value    |
| -------------- | -------- |
| **ID**         | R4       |
| **Severity**   | MEDIUM   |
| **Likelihood** | LOW      |
| **Status**     | WATCHING |

**Description:**
Service layer abstractions may not fit all use cases. Commands might need escape hatches.

**Impact:**

- Commands bypass services
- Inconsistent behavior

**Mitigation:**

- Design services for common cases
- Allow direct framework access when needed
- Document service capabilities

---

## Risk Summary

| Risk                     | Severity | Likelihood | Status   |
| ------------------------ | -------- | ---------- | -------- |
| R1: Dependencies         | HIGH     | MEDIUM     | ACTIVE   |
| R2: Template Maintenance | MEDIUM   | MEDIUM     | ACTIVE   |
| R3: Command Surface Area | LOW      | LOW        | WATCHING |
| R4: Service Complexity   | MEDIUM   | LOW        | WATCHING |
