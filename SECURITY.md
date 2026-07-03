# Security Policy

## Supported Versions

Security updates apply to the latest released version of the extension.

## Reporting a Vulnerability

If you find a security issue, do not open a public issue with exploit details. Report it privately to the maintainers at security@kairo.com or via GitHub Security Advisories with:

- A short description of the issue
- The browser and extension version
- Steps to reproduce
- Any relevant screenshots, logs, or sample data

## Data Handling Notes

- Captured capsules are stored locally in browser storage.
- Settings may use browser sync storage when available.
- Claude API enrichment only occurs when a user supplies an API key.
- Do not store secrets in capsule content unless you intend to keep them in local browser storage.
