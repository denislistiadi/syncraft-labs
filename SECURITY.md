# Security Policy & Incident Disclosure

Syncraft Labs takes the security and integrity of our open-source software, ecosystem, and community with the utmost seriousness. This document outlines our security policies, vulnerability reporting process, and transparent post-mortem disclosures of historical security incidents.

---

## 1. Supported Versions

We actively provide security patches and updates for the versions listed below.

| Package | Version Range | Status | Notes |
| :--- | :--- | :--- | :--- |
| `@syncraft-labs/core` | `>= 0.4.2` | Supported | Actively maintained with security patches |
| `@syncraft-labs/react` | `>= 0.4.2` | Supported | Actively maintained with security patches |
| `@syncraft-labs/vue` | `>= 0.4.2` | Supported | Actively maintained with security patches |
| All packages | `0.4.1` | **COMPROMISED (REVOKED)** | **Do NOT use.** Withdrawn & deprecated on NPM due to supply-chain attack. |
| All packages | `<= 0.4.0` | End of Life (EOL) | Clean, but superseded. Upgrade to `>= 0.4.2`. |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability in any Syncraft Labs package or infrastructure, please report it responsibly so we can remediate the issue before public disclosure.

### How to Report

- **GitHub Security Advisory (Preferred)**: Submit a private advisory report directly via [GitHub Security Advisories](https://github.com/denislistiadi/syncraft-labs/security/advisories/new).
- **Direct Email**: If GitHub Security Advisories is unavailable, contact the lead maintainer directly at **`denislistiadi24@gmail.com`** with the subject line `[SECURITY] Syncraft Labs Vulnerability Report`.

### What to Include in Your Report

To help us investigate and triage quickly, please include:
1. Package name(s) and version(s) affected.
2. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
3. Assessment of potential impact and exploit scenario.
4. Any proposed patches or mitigations (if available).

### Response Timeline & SLAs

- **Initial Acknowledgment**: Within **24–48 hours** of report receipt.
- **Triage & Impact Assessment**: Within **3–5 business days**.
- **Fix & Advisory Release**: Coordinated fix and patch release timeline established based on severity.

### Safe Harbor

We fully support responsible security researchers. We will not take legal action against individuals who discover and report vulnerabilities in good faith, provided that:
- You avoid privacy violations, data destruction, and service interruption.
- You do not exploit a vulnerability beyond what is strictly necessary to demonstrate proof-of-concept.
- You allow a reasonable timeframe for remediation before public disclosure.

---

## 3. Incident Post-Mortem & Security Advisory

### Advisory ID: `SYNCRAFT-SEC-2026-001` (PolinRider Supply Chain Attack)

- **Date of Incident**: August 22, 2026
- **Severity**: **Critical (CVSS 9.8)**
- **Type**: Unauthorized Package Compromise / Supply-Chain Malware Injection
- **Threat Actor Campaign**: *PolinRider* (also tracked under *Contagious Interview* campaign)
- **Status**: **Resolved & Fully Remediated in v0.4.2**

---

### Incident Summary

On August 22, 2026, version **`0.4.1`** of `@syncraft-labs/core`, `@syncraft-labs/react`, and `@syncraft-labs/vue` was released containing unauthorized malicious code injected by an external supply-chain attack campaign known as **PolinRider**. 

No source code within the GitHub git repository branches was altered or compromised; the malicious payload was injected exclusively into the distributed build artifacts (`dist/index.js`) prior to NPM registry publication.

---

### Root Cause & Attack Vector

The compromise occurred as part of a targeted developer social engineering campaign (*Contagious Interview* / *PolinRider*):

1. **Initial Vector**: The maintainer's local development environment was infected after downloading and running a project workspace received during what appeared to be a technical freelance assessment.
2. **Credential Theft**: Background malware (*PolinRider* RAT payload) extracted local developer credentials, including a GitHub Personal Access Token (PAT) and NPM publishing session data.
3. **Unauthorized Release**: Using the harvested credentials, the attacker triggered an automated build-and-publish sequence for version `0.4.1` across all three packages (`@syncraft-labs/core`, `@syncraft-labs/react`, `@syncraft-labs/vue`).

---

### Technical Payload Analysis

The injected payload in version `0.4.1` exhibited the following characteristics:

- **Evasion & Obfuscation**: The malicious JavaScript code was appended inside `dist/index.js` separated by hundreds of empty whitespace lines (padding) to hide the snippet from immediate visual inspection, standard terminal previews, and quick file diffs.
- **Payload Behavior**:
  - Scanned local environment variables (looking for API keys, AWS/GCP/Azure cloud tokens, `.env` entries).
  - Attempted to enumerate developer credentials, SSH keys, git configurations, and cryptocurrency wallet browser extension storage.
  - Attempted to establish outbound command-and-control (C2) communication to exfiltrate collected data.

---

### Chronological Response Timeline (2026-08-22)

| Timeframe | Action Taken |
| :--- | :--- |
| **T+0:00 (Report Received)** | External security alert received notifying the maintainer of anomalies in published version `0.4.1`. |
| **T+0:45 (Verification & Deprecation)** | Payload confirmed in `0.4.1` distribution artifacts. Immediate `npm deprecate` executed for all three packages on the NPM registry to flag the release and stop further distribution. |
| **T+1:30 (Credential Revocation)** | All GitHub Personal Access Tokens (PATs), NPM authentication tokens, SSH deploy keys, and API secrets were immediately revoked and invalidated. |
| **T+2:30 (Forensic Sanitization)** | The affected local machine was isolated from the network, wiped, and clean-reinstalled. Full system audit and forensic inspection completed. |
| **T+4:00 (Verified Clean Build & Release)** | Rebuilt all packages from clean Git commit history in a fresh, isolated environment. Published clean version **`0.4.2`** with updated security checksums. |
| **T+5:00 (Public Disclosure)** | Published official incident advisory on the documentation portal ([Security Advisory SYNCRAFT-SEC-2026-001](https://syncraft-labs.web.id/security/advisory-2026-001/)) and notified package registries. |

---

### Action Required for Developers & Downstream Users

If your project or CI/CD pipeline installed or used version `0.4.1` of `@syncraft-labs/core`, `@syncraft-labs/react`, or `@syncraft-labs/vue`:

#### 1. Upgrade Immediately to `>= 0.4.2`
Ensure your `package.json` and lockfiles are updated to version `0.4.2` or later:
```bash
npm install @syncraft-labs/core@latest @syncraft-labs/react@latest @syncraft-labs/vue@latest
# or with yarn:
yarn upgrade @syncraft-labs/core @syncraft-labs/react @syncraft-labs/vue
# or with pnpm:
pnpm update @syncraft-labs/core @syncraft-labs/react @syncraft-labs/vue
```

#### 2. Purge Local and CI Package Caches
```bash
# Clear NPM cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 3. Rotate Sensitive Credentials
If version `0.4.1` was executed on a machine containing sensitive data or environment secrets:
- **Rotate all API keys and environment variables** (e.g., database credentials, service tokens, cloud provider keys) present on that machine.
- **Rotate SSH keys, GitHub tokens, and NPM tokens**.
- Check developer system configuration files (`~/.bashrc`, `~/.zshrc`, `~/.profile`) for unauthorized persistent entries.

---

### Permanent Hardening & Preventative Countermeasures

To guarantee supply-chain integrity and prevent recurrence, the following infrastructure measures have been permanently implemented:

1. **Mandatory Multi-Factor Authentication (2FA)**:
   - Enforced hardware WebAuthn / TOTP Two-Factor Authentication across all NPM maintainer accounts for every publish command (`publishConfig.access` with 2FA enforcement).
2. **Automated CI/CD Provenance & Trusted Publishing**:
   - Replaced static personal publish tokens with short-lived OIDC-based GitHub Actions Trusted Publishing, generating verifiable NPM build provenance attestations.
3. **Build Artifact Integrity Diffing**:
   - Added automated pre-publish verification pipelines that compare compiled output strictly against TypeScript source files, rejecting any uncommitted or extraneous code.
4. **Environment Isolation Protocol**:
   - Strict adherence to containerized/sandboxed virtual environments when testing or evaluating any third-party or untrusted external codebases.

---

## 4. Transparency Statement

Syncraft Labs is committed to complete transparency regarding security issues. We believe open communication and detailed post-mortems build a safer ecosystem for everyone.

For inquiries or follow-up regarding this advisory or our security posture, please reach out to **`denislistiadi24@gmail.com`** or open a [GitHub Discussion](https://github.com/denislistiadi/syncraft-labs/discussions).

