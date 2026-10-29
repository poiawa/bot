# Security Documentation

## Implemented

- **Secret management**: All secrets via environment variables; `.env` is gitignored;
  `.env.example` contains only placeholders. Installer generates 256-bit secrets.
- **Encryption at rest**: Panel credentials encrypted with AES-256-GCM (`ENCRYPTION_KEY`).
  Decryption happens only in adapter memory.
- **Auth**: JWT bearer tokens (`@fastify/jwt`), 7-day expiry, role claim embedded.
  Passwords hashed with scrypt + random salt.
- **Rate limiting**: `@fastify/rate-limit` (100 req/min/IP) + nginx zone limits.
- **Security headers**: `@fastify/helmet` + nginx X-Frame-Options/nosniff/XSS headers.
- **Input validation**: Zod schemas on write endpoints; parameterized SQL everywhere (Drizzle + pg placeholders — no string interpolation).
- **Webhook safety**: Payment verification is server-side against the provider; duplicate webhooks are idempotent; amount mismatches are recorded and rejected.
- **Financial integrity**: Row-level locks (`FOR UPDATE`), deterministic lock ordering to avoid deadlocks, negative-balance prevention, immutable finalized transactions.
- **RBAC**: Role checked from DB on every admin route; admin command in the bot verifies role server-side.
- **Secrets in logs**: Pino structured logs; credentials are never passed to log calls. Panel credentials stored encrypted, never rendered.
- **Backups**: Encrypted with AES-256-CBC/PBKDF2 when `BACKUP_ENCRYPTION_KEY` is set; plaintext fallback warns loudly.

## Not yet implemented (tracked)

- [ ] Session revocation list and forced logout
- [ ] Reauthentication for sensitive admin operations
- [ ] CSRF double-submit tokens for cookie-based admin flows (current auth is bearer-token only)
- [ ] Automated dependency vulnerability scanning in CI
- [ ] Backup restoration tests (restore script exists but untested)
- [ ] Key rotation tooling

## Deployment security checklist

1. HTTPS mandatory (nginx TLS block or Caddy) — no HTTP in production.
2. Firewall: expose only 80/443. Do not publish 5432/6379.
3. Panel API accounts: use least-privilege admin accounts on Marzban.
4. Telegram webhook: set a secret token and verify `X-Telegram-Bot-Api-Secret-Token`.
5. Rotate `JWT_SECRET` and `ENCRYPTION_KEY` only with a data-migration plan —
   encrypted values in the DB become unreadable otherwise.
