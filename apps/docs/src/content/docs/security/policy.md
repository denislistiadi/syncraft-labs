---
title: Security Policy
description: Syncraft Labs Security Policy — supported versions, responsible vulnerability disclosure instructions, and response SLAs.
head:
  - tag: meta
    attrs:
      name: keywords
      content: syncraft security policy, vulnerability reporting, responsible disclosure, bug bounty, safe harbor
---

Syncraft Labs takes the security of our libraries, developer tooling, and downstream users seriously. This document details our version support lifecycle, responsible vulnerability disclosure process, and response service-level agreements (SLAs).

---

## Supported Versions

We actively maintain and provide security patches for the following versions:

| Package | Version Range | Security Support Status |
| :--- | :--- | :--- |
| `@syncraft-labs/core` | `>= 0.4.2` | Supported (Active) |
| `@syncraft-labs/react` | `>= 0.4.2` | Supported (Active) |
| `@syncraft-labs/vue` | `>= 0.4.2` | Supported (Active) |
| All packages | `0.4.1` | **Revoked & Deprecated** (See [Advisory SYNCRAFT-SEC-2026-001](/security/advisory-2026-001/)) |
| All packages | `<= 0.4.0` | End of Life (EOL) — Please upgrade to latest |

---

## Reporting a Vulnerability

If you discover a potential vulnerability, please report it privately rather than creating a public GitHub issue.

### Preferred Reporting Method

Submit a private advisory through [GitHub Security Advisories](https://github.com/denislistiadi/syncraft-labs/security/advisories/new). This provides a secure, encrypted workspace where we can collaborate on a fix and coordinate a synchronized release.

### Direct Email Contact

If you cannot access GitHub Security Advisories, send an email directly to:

- **Primary Maintainer**: `denislistiadi24@gmail.com`
- **Subject**: `[SECURITY] Syncraft Labs Vulnerability Report`

### What to Include in Your Report

1. Description of the vulnerability and its potential impact.
2. Affected package(s) and version(s).
3. Detailed reproduction steps or a minimal Proof of Concept (PoC).
4. Any potential mitigations or suggested patches.

---

## Response Timeline & SLAs

| Phase | Target SLA | Description |
| :--- | :--- | :--- |
| **Initial Acknowledgment** | 24–48 hours | Confirm receipt of report and open internal tracking |
| **Triage & Validation** | 3–5 business days | Reproduce and assess severity/scope |
| **Remediation & Patch** | Based on severity | Develop fix, run full test suites, and coordinate release |
| **Public Advisory** | Upon release | Publish CVE / GitHub Advisory with credits to reporter |

---

## Safe Harbor Policy

We strongly support ethical security research. We will not pursue legal action against researchers who report vulnerabilities in good faith, provided that:
- You give us reasonable time to investigate and resolve the issue before disclosing it publicly.
- You do not compromise user data, disrupt system availability, or cause data destruction.
- You operate within the scope of responsible disclosure.

---

## Historical Advisories

- [**SYNCRAFT-SEC-2026-001** (PolinRider Supply Chain Attack — August 22, 2026)](/security/advisory-2026-001/)
