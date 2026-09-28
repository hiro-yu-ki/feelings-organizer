# Security

## Implemented controls

- Passwords use Node `scrypt` with a unique 128-bit salt and timing-safe verification.
- Authentication cookies are HMAC-signed, `HttpOnly`, `SameSite=Strict`; production adds `Secure`.
- Every state-changing authenticated request requires a per-login CSRF token.
- Server-side participant/owner checks protect every private preparation, share approval, turn edit, historical reference and session delete operation.
- A session accepts at most two distinct participants. Only its creator sees the invite code and may delete it.
- Input length/type/enum/confidence validation, 1 MiB body limit and per-IP authentication/API rate limits are applied.
- Browser output escapes user content. CSP, no-sniff and referrer headers are set. AI keys remain server-only and are never stored in the database.
- AI request logs contain metadata, not raw conversation text. Invalid or policy-breaking moderator output falls back safely.

## Production checklist

Use a persistent session store and strong `SESSION_SECRET`; TLS; reverse-proxy IP configuration; encrypted PostgreSQL and backups; key rotation; retention/deletion policy; monitoring without message bodies; dependency/container scanning; and independent penetration/privacy review. Process-local sessions and rate limits are appropriate for one-instance MVP only. Set `TRUST_PROXY` only after configuring a trusted proxy implementation.

Report vulnerabilities privately to the repository owner. Do not include real conversation data in a report.
