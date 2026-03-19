# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please **do not** open a public GitHub issue.

Instead, report it privately by:
1. Opening a [GitHub Security Advisory](https://github.com/arnav-ray/visitgermany-backend/security/advisories/new) on this repository, **or**
2. Emailing the maintainer directly (see the GitHub profile for contact details).

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested remediation if you have one

We aim to acknowledge reports within **48 hours** and provide a fix or mitigation within **14 days** for critical issues.

## Security Controls in Place

| Control | Implementation |
|---------|---------------|
| Secrets management | All credentials via environment variables; never committed to source |
| CORS | Restricted to the configured `ALLOWED_ORIGIN` |
| Authentication | `X-API-Key` shared-secret header on all non-health endpoints |
| Input validation | Allowlist for `targetLang`; max 500-char `text` |
| Rate limiting | 30 requests/min per IP via `express-rate-limit` |
| Security headers | `helmet` middleware (CSP, HSTS, X-Frame-Options, etc.) |
| Container security | Non-root user (`appuser`); `.dockerignore` excludes secrets |
| Dependency auditing | `npm audit` runs in CI on every push/PR |
| Automated updates | Dependabot monitors npm dependencies weekly |

## Known Limitations / Out of Scope

- The Google Sheets API key (`SHEETS_API_KEY`) is a server-side secret. Ensure it has **HTTP referrer restrictions** applied in Google Cloud Console so it cannot be abused if ever leaked.
- The `SHEET_ID` is not a secret, but limiting the Google Sheet's sharing settings to "Restricted" provides defence-in-depth.
- The `API_SECRET` should be rotated periodically and stored in a secrets manager (e.g., Google Cloud Secret Manager) rather than plain environment variables in production.
