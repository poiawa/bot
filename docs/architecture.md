# System Architecture

## Overview

The platform consists of five deployable components sharing one PostgreSQL database and Redis:

```
                    ┌─────────────────┐
                    │     Nginx       │  :80/:443 (TLS)
                    └───────┬─────────┘
          ┌─────────────────┼────────────────────┐
          ▼                 ▼                    ▼
   ┌────────────┐   ┌─────────────┐    ┌───────────────┐
   │  Frontend   │   │  Backend    │    │ Telegram Bot  │
   │ (React SPA) │   │ (Fastify)   │◄───┤ (webhook/     │
   └────────────┘   └──────┬──────┘    │  polling)      │
                           │           └───────────────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │PostgreSQL│ │  Redis   │ │  Worker  │
        │(data)    │ │(queues)  │ │(jobs)    │
        └──────────┘ └──────────┘ └──────────┘
```

## Modules

| Module | Responsibility |
|---|---|
| identity / users | Authentication, sessions, roles |
| catalog | Products, categories, prices |
| orders | Order lifecycle, pricing (server-side only) |
| payments | Provider adapters, verification, idempotent confirmation |
| wallet | Balances, atomic ledger transactions, transfers |
| subscriptions | Fulfillment workflow, expiry, renewal |
| panel-adapters | VPN panel integration (capability-tracked) |
| resellers | Reseller isolation, settlements |
| telegram | Customer bot + Mini App auth |

## Key invariants

1. **Payments**: A payment is `completed` only after server-side verification against the provider. Duplicate webhooks are harmless (row lock + status check).
2. **Ledger**: Wallet balances change only through ledger transactions with `SELECT ... FOR UPDATE` row locking. Finalized transactions are immutable; corrections are compensating transactions.
3. **Fulfillment**: Idempotent. An order is fulfilled exactly once. Panel failure moves the order to `requires_review` while preserving payment success.
4. **Panel capabilities**: Adapters explicitly declare supported operations; unsupported operations raise `UNSUPPORTED_OPERATION` instead of simulating success.
5. **Pricing**: Computed from DB product prices only — never from client input.
6. **RBAC**: Enforced server-side per request; resellers are isolated by scope.

## Current implementation status

Implemented and compiling (Phase 1–2 partial):
- Database schema (35+ entities)
- Core infra: DB pool, Redis, queues (BullMQ), AES-256-GCM crypto, structured logging
- All API route modules (with some handler bodies still stubbed)
- Marzban adapter (real API implementation; requires live panel for integration testing)
- Zarinpal provider (real API; requires merchant ID)
- Card-to-card (manual workflow)
- Wallet ledger with locking and atomic transfers
- Subscription fulfillment with requires_review flow
- Telegram bot (menu flows; purchase flow pending payment-method wiring)
- Deployment: Dockerfile, compose, nginx, install/backup/restore/update scripts

Not yet implemented (see README feature matrix):
- Frontend SPA (admin + customer)
- Migrations as versioned SQL files (schema is defined; `drizzle-kit generate` must be run)
- Tests
- Reseller bots, inventory, notifications delivery
