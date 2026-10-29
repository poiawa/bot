# VPN Subscription Sales Platform -.bot

## Project Overview

A professional, secure, and scalable platform for selling and managing VPN/proxy subscriptions. The system supports multi-panel integration, resellers, Persian/RTL interface, and Iranian payment gateways.

### Target Market
- **Primary**: Iran (Toman-based pricing, Persian RTL interface)
- **Secondary**: International expansion ready

### Core Features
- Telegram Customer Bot
- Telegram Mini App
- Web Administration Dashboard
- Customer Web Portal
- Multi-Panel Integration (Marzban, Marzneshin, etc.)
- Reseller & White-Label System
- Payment Processing (Zarinpal, Card-to-Card, etc.)
- Financial Ledger & Wallet
- Configuration Inventory
- Customer Support Ticketing
- Analytics & Reporting

### Technology Stack
- **Backend**: Node.js with Fastify
- **Database**: PostgreSQL with Drizzle ORM
- **Cache/Queue**: Redis
- **Bot**: Telegram Bot API (telegraf)
- **Frontend**: TypeScript + React + Vite
- **Deployment**: Docker Compose

---

## Repository Structure

```
bot/
├── backend/                    # Fastify backend API
│   ├── src/
│   │   ├── modules/           # Business logic modules
│   │   │   ├── identity/     # Authentication & users
│   │   │   ├── catalog/      # Products & pricing
│   │   │   ├── orders/       # Order management
│   │   │   ├── payments/     # Payment providers
│   │   │   ├── wallet/       # Wallet & ledger
│   │   │   ├── subscriptions/# VPN subscriptions
│   │   │   ├── panel-adapters/# VPN panel integrations
│   │   │   ├── servers/      # Server management
│   │   │   ├── resellers/   # Reseller system
│   │   │   ├── referrals/   # Referral program
│   │   │   ├── promotions/  # Discounts & gifts
│   │   │   ├── notifications/# Notifications
│   │   │   ├── support/      # Support tickets
│   │   │   ├── inventory/    # Config inventory
│   │   │   └── admin/        # Admin dashboard API
│   │   ├── core/             # Core utilities
│   │   │   ├── database/    # DB connection & migrations
│   │   │   ├── redis/       # Redis client
│   │   │   ├── queue/       # Job queues
│   │   │   ├── crypto/      # Encryption utilities
│   │   │   └── logger/      # Structured logging
│   │   ├── routes/          # API routes
│   │   └── index.ts         # App entry
│   ├── package.json
│   └── tsconfig.json
├── frontend/                  # React frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/           # Page components
│   │   │   ├── admin/       # Admin dashboard pages
│   │   │   ├── customer/    # Customer portal pages
│   │   │   └── mini-app/    # Telegram Mini App
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API clients
│   │   ├── i18n/           # Internationalization
│   │   │   ├── fa.json      # Persian translations
│   │   │   └── en.json      # English translations
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── telegram-bot/             # Telegram bot handlers
│   ├── src/
│   │   ├── commands/        # Bot commands
│   │   ├── handlers/        # Message handlers
│   │   ├── keyboards/       # Inline keyboards
│   │   └── index.ts
│   └── package.json
├── scripts/                 # Deployment scripts
│   ├── install.sh
│   ├── backup.sh
│   └── restore.sh
├── docs/                    # Documentation
│   ├── architecture.md
│   ├── api.md
│   ├── panels.md
│   ├── payments.md
│   └── deployment.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── README.md
├── README.fa.md
└── .gitignore
```

---

## Installation

### Prerequisites
- Ubuntu 22.04 LTS
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
- Node.js 20+ (for local development)

### Quick Install
```bash
sudo bash scripts/install.sh
```

### Manual Install
```bash
# 1. Clone repository
git clone https://github.com/poiawa/bot.git
cd bot

# 2. Configure environment
cp .env.example .env
nano .env  # Fill in credentials

# 3. Start services
docker-compose up -d

# 4. Run migrations
docker-compose exec backend npm run migrate

# 5. Create admin user
docker-compose exec backend npm run create-admin
```

---

## Modules Overview

| Module | Description | Status |
|--------|-------------|--------|
| identity | User authentication, sessions, RBAC | Partial — JWT middleware done, session revocation pending |
| catalog | Products, categories, pricing | Routes defined; DB schema done; handlers stubbed |
| orders | Order processing workflow | Order creation with server-side pricing; payment confirmation (idempotent) |
| payments | Payment gateway adapters | Zarinpal v4 + card-to-card implemented; needs merchant credentials to test |
| wallet | Wallet balance & transactions | Ledger with row locking, atomic transfers |
| subscriptions | VPN subscription lifecycle | Fulfillment with idempotency + requires_review; expiry worker |
| panel-adapters | Multi-panel integration layer | **Marzban implemented** (untested against live panel); others raise UNSUPPORTED |
| servers | Server/node management | Routes defined; allocation logic implemented |
| resellers | Reseller & white-label system | Schema + route skeletons only |
| referrals | Referral program | Schema only |
| promotions | Discounts, gifts, campaigns | Schema only |
| notifications | Multi-channel notifications | Schema + queue infrastructure only |
| support | Support ticketing system | Route skeletons; schema done |
| inventory | Configuration inventory | Schema only |
| admin | Admin dashboard API | Route skeletons |

**This project is in early development (Phase 1–2 of 11 complete).** Many handlers are
skeletons returning structured responses — they are clearly marked and must not be
treated as working features. See `docs/architecture.md` for details.

### What is verified working
- Backend TypeScript compiles cleanly (`tsc --noEmit` → 0 errors)
- 17 unit tests pass (crypto roundtrip/tamper, Marzban payload mapping, Zarinpal verification decisions)
- Frontend builds (tsc + vite production build)
- Generated DB migration SQL (33 tables, drizzle-kit)
- Server starts and fails cleanly with actionable error when DB is unreachable

### What requires external credentials to verify
- Marzban adapter: needs a live Marzban panel (API URL + admin credentials)
- Zarinpal: needs `ZARINPAL_MERCHANT_ID` (sandbox available with sandbox merchant)
- Telegram bot: needs `TELEGRAM_BOT_TOKEN`

---

## License
MIT License