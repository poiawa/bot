# Production Deployment Guide (Ubuntu 22.04 / 24.04 LTS)

> نسخه فارسی: پایین همین فایل، بخش «راهنمای نصب فارسی» را ببینید.

## 1. Prerequisites

Ubuntu **22.04 LTS** or **24.04 LTS** (the installer hard-stops on other OSes).

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
# Docker (official method) — or let scripts/install.sh install it with your confirmation
curl -fsSL https://get.docker.com | sh
```

Minimum resources: 2 vCPU, 2GB RAM, 5GB free disk.

## 2. Clone and install

```bash
git clone https://github.com/poiawa/bot.git
cd bot
sudo bash scripts/install.sh
```

The installer (`scripts/install.sh` + `scripts/lib/common.sh` + `scripts/configure-env.sh`):

1. Verifies privileges and OS (Ubuntu 22.04/24.04 only; `--os-override` to bypass with a warning).
2. Checks free disk (≥5GB), RAM (warns <1GB), and that ports 80/443 are free — stops safely otherwise.
3. Detects existing `vpnbot_*` containers and refuses to clobber an existing installation (use `update.sh` instead).
4. Offers to install Docker with explicit confirmation; never installs silently.
5. Interactively asks for your domain and (optionally) the Telegram bot token.
6. Generates 64-hex-char secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, DB/Redis passwords) with `openssl rand -hex 32` — **values are never printed**. `.env` gets `chmod 600`.
7. Validates that all critical variables are real (placeholders abort BEFORE starting anything).
8. Starts services with the repository's own `docker-compose.yml` and waits for `/health`.
9. Applies database migrations with the project's actual mechanism: `docker compose exec backend npm run migrate` (drizzle — additive only, never destructive).
10. If UFW is ACTIVE: allows only 22/80/443 and verifies PostgreSQL/Redis are not published. No other firewall rules are touched.

Fresh-clone mode: if `docker-compose.yml` is missing in the current directory, the installer clones `https://github.com/poiawa/bot.git` first.

## 4. After installation

```bash
# Create the first administrator
sudo docker compose exec backend npm run create-admin

# Telegram bot token later? Edit .env then:
sudo docker compose up -d backend
```

Telegram webhook (after HTTPS works): point BotFather's /setwebhook to `https://your-domain/telegram/webhook`.

## 5. HTTPS

HTTPS is NOT auto-configured (no assumption about your certificate provider).
Options:
- **Certbot + nginx**: obtain certs for your domain, place `cert.pem`/`key.pem` in `nginx/ssl/`, uncomment the HTTPS server block in `nginx/nginx.conf`, restart nginx.
- Any external reverse proxy in front of port 80 also works.

## 6. Operations

| Task | Command |
|---|---|
| Status (read-only) | `bash scripts/status.sh` |
| Logs | `bash scripts/logs.sh [service] [lines]` |
| Update | `sudo bash scripts/update.sh` |
| Backup | `bash scripts/backup.sh` |
| Restore | `bash scripts/restore.sh <archive>` (auto-snapshots current DB first) |
| Uninstall | `sudo bash scripts/uninstall.sh` (double-confirmed; volumes deleted only after typing `DELETE-MY-DATA`) |
| Tests | `bash scripts/tests/run-tests.sh` (installer logic, no Docker needed) |

Update order: backup → `git pull --ff-only` (never force) → build → migrate → restart → health check. If the build fails, old containers keep running. If a migration fails, the database is untouched; no automatic migration rollback exists — restore the pre-update backup with `scripts/restore.sh`.

## Firewall

The installer only touches UFW when it is already active, and only adds
22/80/443. PostgreSQL (5432) and Redis (6379) have **no published host ports**
in `docker-compose.yml` and stay on the internal Docker network.

## Limitations (honest disclosure)

- Docker builds of the stack were NOT executed on the development machine
  (no Docker available there); `docker-compose.yml` and Dockerfiles were fixed
  for correctness (build contexts, migration files in image) but a real
  `docker compose up --build` has not been observed end-to-end.
- Restore/backup scripts are syntax-checked and unit-tested for logic, but have
  not been exercised against a live Docker deployment.
- shellcheck was not available on the development machine; scripts pass
  `bash -n` and the lib has 30+ unit tests.

---

# راهنمای نصب فارسی (Ubuntu 22.04 / 24.04 LTS)

## پیش‌نیازها
سیستم‌عامل Ubuntu نسخه 22.04 یا 24.04 (نصب‌کننده روی بقیه سیستم‌عامل‌ها متوقف می‌شود).

```bash
sudo apt update && sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sh   # یا اجازه دهید نصب‌کننده با تأیید شما داکر را نصب کند
```

حداقل منابع: 2 هسته CPU، 2 گیگ رم، 5 گیگ فضای خالی.

## نصب

```bash
git clone https://github.com/poiawa/bot.git
cd bot
sudo bash scripts/install.sh
```

نصب‌کننده به‌ترتیب: بررسی دسترسی روت و نسخه سیستم‌عامل، بررسی دیسک/رم/پورت‌های 80 و 443،
تشخیص نصب قبلی (جلوگیری از بازنویسی)، نصب داکر فقط با تأیید شما، پرسش دامنه و اختیاری توکن
ربات، تولید مخفی‌های امنیتی قوی (بدون نمایش در خروجی)، اعتبارسنجی کامل تنظیمات **قبل از**
اجرای سرویس‌ها، ساخت و اجرای سرویس‌ها با docker-compose خود پروژه، اجرای مایگریشن‌های
افزایشی (بدون هرگز حذف یا ریست دیتابیس)، و تنظیم محافظه‌کارانه فایروال (فقط اگر UFW فعال
باشد؛ فقط پورت‌های 22/80/443).

## عملیات روزمره

| کار | دستور |
|---|---|
| وضعیت سرویس‌ها | `bash scripts/status.sh` |
| لاگ‌ها | `bash scripts/logs.sh [سرویس] [تعداد خطوط]` |
| به‌روزرسانی | `sudo bash scripts/update.sh` |
| بکاپ | `bash scripts/backup.sh` |
| بازگردانی | `bash scripts/restore.sh <فایل بکاپ>` (قبل از بازگردانی از دیتابیس فعلی بکاپ می‌گیرد) |
| حذف کامل | `sudo bash scripts/uninstall.sh` (دو مرحله تأیید؛ داده‌ها فقط با تایپ `DELETE-MY-DATA` حذف می‌شوند) |
| تست منطق نصب‌کننده | `bash scripts/tests/run-tests.sh` |

## HTTPS
نصب‌کننده HTTPS را خودکار تنظیم نمی‌کند. گواهی را با certbot بگیرید، فایل‌ها را در
`nginx/ssl/` قرار دهید و بلوک HTTPS در `nginx/nginx.conf` را فعال کنید.

## محدودیت‌ها
- ساخت Docker روی ماشین توسعه اجرا نشده (داکر موجود نبود)؛ تنظیمات اصلاح شدند اما ساخت کامل end-to-end مشاهده نشده است.
- rollback خودکار مایگریشن دیتابیس وجود ندارد؛ در صورت بروز مشکل از `scripts/restore.sh` با بکاپ قبل از به‌روزرسانی استفاده کنید.
