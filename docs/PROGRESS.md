# Implementation Progress — Checkpoint 4 (installer & deployment readiness)

**Date**: 2026-10-29
**Last verified**: installer lib tests **34/34 pass** (incl. bash -n on all 8 scripts) · configure-env smoke **10/10 pass** · backend tsc 0 errors · 20 unit + 5 DB-integration tests unchanged

## Checkpoint 4 — automated installer (this session)

### Fixed before hardening (verified broken state)
1. `docker-compose.yml`: backend/worker/frontend used `context: ./backend` + `dockerfile: ../Dockerfile` — dockerfile outside build context = guaranteed build failure. Fixed to repo-root context; removed nonexistent `./backend/src/migrations` initdb mount; removed host `./frontend/dist` mounts (dist now comes from the image); added `env_file: .env` to backend/worker so JWT_SECRET/ENCRYPTION_KEY/etc. actually reach the app.
2. `Dockerfile`: now COPYs `backend/drizzle` + `drizzle.config.ts` so `npm run migrate` works in-container; `drizzle-kit` + `tsx` moved to runtime dependencies (prod image runs `npm ci --only=production`).
3. `nginx/nginx.conf`: `/` and `/mini-app/` now proxy to the frontend container; `nginx/frontend.conf` gained a `/health` endpoint for its compose healthcheck.
4. `.env.example`: removed duplicate `APP_SECRET=`; `.gitignore`: added `backups/`.

### New installer system (consolidates, does not duplicate)
- `scripts/lib/common.sh` — shared tested helpers (OS classification, resource/port checks, secret generation, idempotent env upsert, placeholder detection)
- `scripts/install.sh` — full preflight (root, Ubuntu 22.04/24.04 hard-stop, disk≥5GB, RAM, ports 80/443, existing containers), Docker install only with confirmation, interactive domain/token config, secure secret generation (never printed, `.env` chmod 600), validation gate BEFORE compose up, health wait, additive drizzle migrations, conservative UFW (only if active, only 22/80/443, verifies DB/Redis not exposed)
- `scripts/configure-env.sh` — env creation/prompts; idempotent (re-run never clobbers real secrets)
- `scripts/update.sh` — backup → stash-check → ff-only pull → build → migrate → restart → health; aborts leave old containers running; NO automatic migration rollback (documented)
- `scripts/status.sh`, `scripts/logs.sh` (new), `scripts/uninstall.sh` (new: double confirmation, typed `DELETE-MY-DATA` phrase for volumes, final backup first)
- `scripts/restore.sh` — now snapshots the CURRENT database before overwriting
- `scripts/tests/run-tests.sh` (34 assertions) + `scripts/tests/configure-env.test.sh` (10 assertions) — run with plain bash, no Docker needed

### Test results (executed on this machine, Git Bash)
| Test | Result |
|---|---|
| `bash scripts/tests/run-tests.sh` | 34 passed, 0 failed |
| `bash scripts/tests/configure-env.test.sh` | 10 passed, 0 failed |
| `bash -n` all 8 scripts | all pass |
| shellcheck | NOT installed here — not run (documented) |
| `docker compose config` / real build | NOT run — no Docker on this machine (documented) |

## Cumulative status
- Checkpoints 1–3: real handlers (auth/catalog/orders/payments/wallet/subscriptions/reseller-scope/audit/admin-stats), migrations 0000+0001 consistent, integration suite (skips without DB)
- Checkpoint 4: installer/deployment readiness as above

---

# Checkpoint 3 — database & E2E readiness (historical)

**Date**: 2026-10-29
**Last verified**: backend tsc = 0 errors · **20/20 unit tests pass** · 5 DB integration tests defined (skip cleanly without PostgreSQL) · frontend build OK

## This checkpoint

1. **Migration consistency verified offline**: `drizzle-kit generate` against current schema reports "No schema changes, nothing to migrate" — migrations 0000 + 0001 exactly match the schema. No migrations invented.
2. **Env audit**: compared every `process.env.*` used in code against `.env.example`; added missing `HOST` and `ZARINPAL_SANDBOX`.
3. **Integration test suite added** (`src/tests/integration/`):
   - `helpers.ts` — SAFETY GUARDS: refuses to run against any database whose name lacks "test"; applies real migration SQL files (validates scenario 19)
   - `db.test.ts` — 5 tests: migrations apply on fresh DB (19), scrypt roundtrip, concurrent ledger transfer balance conservation (8), duplicate `provider_ref` rejected by DB constraint (payment idempotency anchor), reseller scope SQL isolation (9)
   - Skips cleanly when PostgreSQL unreachable — **skipped ≠ passed**
4. **Docker/PostgreSQL/Redis unavailable on this Windows machine** — exact blocker for executing the integration suite. It runs anywhere PostgreSQL exists:
   ```
   set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vpnbot_test
   cd backend && npm test -- src/tests/integration
   ```

## Setup instructions to execute integration tests (any machine with Docker)
```
docker run -d --name vpnbot-test-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=vpnbot_test -p 5432:5432 postgres:15-alpine
cd backend
# Windows: set TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vpnbot_test
# Linux/mac: export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vpnbot_test
npm test -- src/tests/integration
docker rm -f vpnbot-test-pg
```

## Checkpoint 3 status
- Real handlers: auth (scrypt + Telegram initData HMAC), catalog, orders, payments (initiate/callback/idempotent confirm), wallet (locked ledger), subscriptions (ownership + renew), reseller scope, audit, admin dashboard stats + real health checks
- Migration 0001: additive `users.reseller_owner_id` (FK, duplicate-safe)

## Remaining (honest)
- Execute the 5 integration tests (blocked: no Docker/PG here)
- Live Marzban panel + Zarinpal sandbox credentials → live integration tests
- Inventory reservation, reseller bots/settlements, notifications delivery, discounts, Mini App/customer portal UI, remaining admin handlers
- Telegram bot purchase-flow wiring to /api/payments/initiate

## Test commands & results (this machine)
| Command | Result |
|---|---|
| `npm run typecheck` / tsc --noEmit | 0 errors |
| `npx vitest run` | 20 passed, 5 skipped (integration, no DB) |
| frontend `npx vite build` | built in ~550ms |

## Completed in this checkpoint

### Module A — Authentication (REAL, wired to DB)
- `modules/identity/password.ts`: scrypt hashing, constant-time verify, registerUser, loginWithPassword
- `modules/identity/telegram.ts`: official Telegram WebApp initData HMAC validation (pure, tested)
- `routes/auth.ts`: /register, /login (no account enumeration), /telegram-login (initData validated server-side), /logout — all audited

### Module B — Catalog (REAL handlers)
- `routes/products.ts`: public list with joined prices, product details, admin create (Zod-validated, price from DB only), admin update, categories

### Module C — Payments (REAL flow wired)
- `routes/payments.ts`: GET /methods (only configured providers), POST /initiate (creates payment row + provider invoice + redirect), GET /callback/:provider (server-side verify → confirmPaymentAndFulfill, idempotent, amount-mismatch rejected, audited)

### Module D — Wallet (REAL)
- `routes/wallet.ts`: balance, transaction history (paginated), atomic transfer with row locking; gift redeem deliberately NOT registered (Phase 9)

### Module E — Subscriptions (REAL)
- `routes/subscriptions.ts`: /me list, /:id with ownership check (IDOR prevention), /:id/renew via panel adapter with expiry extension logic

### Module F — Reseller scope (foundation)
- `modules/resellers/scope.ts`: requireActiveReseller, assertCustomerInScope, pure customerBelongsToReseller (tested)
- Schema: `users.reseller_owner_id` column added (migration 0001, additive ALTER TABLE with FK, duplicate-safe)
- **3 new tests** for scope isolation (scenario 9 logic)

### Module G — Orders (REAL)
- `routes/orders.ts`: POST / (server-side pricing from DB), GET /me, GET /:id with ownership check

### Audit service
- `modules/audit/index.ts`: audit() with secret redaction, never throws into caller

## Test status (executed on this machine)
- 4 test files, 20 tests, all passing
- crypto: 7 (roundtrip, unicode, random IV, tamper rejection, malformed)
- marzban: 4 (payload mapping, unlimited-vs-zero distinction, statuses)
- payments: 6 (verify codes 100/101, errors, amount mismatch)
- scope: 3 (isolation decision logic)

## Still NOT implemented (next checkpoints)
1. **DB-dependent tests** (scenarios 1–8, 11–20): need PostgreSQL — write as integration suite, skip-marked when no DB
2. Inventory atomic reservation service (scenario 7)
3. Reseller bots, settlements, commissions (Phase 7)
4. Notifications delivery, discounts application (Phase 9)
5. Admin dashboard real handlers (currently skeletons)
6. Frontend: customer portal + Mini App pages
7. Live-panel and sandbox payment integration tests (need credentials)
8. Telegram bot purchase flow wiring (initiate payment from chat)

## Environment notes
- git found at `C:\Program Files\Git\bin\git.exe` (not in PATH)
- No Docker, no PostgreSQL on this Windows machine
- Migration 0001 generated by drizzle-kit (additive, safe)
