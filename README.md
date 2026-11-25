# AklatOne

**Library Management System for Tagumpay National High School** (School ID 308114).

AklatOne replaces the library's logbooks and paper lists with one central database used through three apps:

| App | Used by | What it does | Code |
|---|---|---|---|
| **Mobile app** (Android, iOS) | Students and teachers; librarian mode for the librarian | Search books, request to borrow, receipts and due dates, alerts, Visit Log (Time In / Out), Suggestion Box. Librarian mode scans Library ID cards and book QR labels to lend and receive books. | `frontend/mobile-capacitor/` |
| **Staff Web Portal** | Librarian, administrator | Catalog and copies, lending and returns, members and Library ID cards, Visitor's Log kiosk, inventory audit, reports, printing, backups | `frontend/web-pwa/` |
| **Staff Desktop App** (Windows, Linux) | Librarian | Everything in the web portal, plus **offline mode** (saved entries are uploaded later) and the Visitor's Log kiosk | `frontend/desktop-tauri/` |
| **Server (API + database)** | (all apps) | Business rules, security, email, scheduled backups and reminders | `backend/` |

All three apps share the same code (`frontend/src/`) and the same server, so a book lent at the desk shows up in
the student's phone at once.

### Members with or without a phone
Every member gets a **Library ID card** (Printing > Library ID cards) with their **Member ID** and a QR code.
Nothing on the card is personal (no name, LRN or address).

| | Without a phone | With the AklatOne app |
|---|---|---|
| Borrow | Librarian scans the card, then the book's QR label | Same, or send a borrow request from the app |
| Return | Librarian scans the book | Same |
| Library visit (Time In / Out) | Scan the card at the Visitor's Log kiosk, or type the Member ID | Scan the kiosk's QR code with the app, or type its 6-digit code |
| Records | Kept in the system; the librarian can print them | Also visible in the app (loans, receipts, history, statistics) |

Loan rules: **7 days per book, up to 8 books per member** (`backend/src/config/loanPolicy.ts`).

---

## 1. Set up a development computer

**Requirements**

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22 or newer (24 used in development) | everything |
| MariaDB | 10.11 | the database |
| Git | any | getting the code |
| Docker | optional | Redis (shared rate limits); the system works without it |
| JDK 21 + Android SDK (Android Studio) | | building the Android app |
| Rust (rustup) + Tauri prerequisites | | building the desktop app ([tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/)) |
| A Mac with Xcode | | building the iPhone app |

**Steps**

```bash
# 1. Get the code
git clone https://github.com/Flynchmore/TNHS-AklatOne.git
cd TNHS-AklatOne

# 2. Install the libraries (backend and frontend)
npm --prefix backend install
npm --prefix frontend install

# 3. Create the database and its user (MariaDB, as root)
sudo mariadb -e "CREATE DATABASE aklatone CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'aklatone'@'localhost' IDENTIFIED BY 'choose-a-password';
  GRANT ALL ON aklatone.* TO 'aklatone'@'localhost';"

# 4. Settings: copy the examples, then open them and fill in the values
cp backend/.env.example backend/.env       # DATABASE_URL, JWT_SECRET (openssl rand -hex 32), EMAIL_USER / EMAIL_PASS
cp frontend/.env.example frontend/.env     # VITE_API_BASE_URL=http://localhost:3000

# 5. Build the tables and the basic records (roles, categories)
cd backend
npx prisma migrate deploy
npm run prisma:seed
ALLOW_CATEGORY_SEED=1 npm run seed:categories
cd ..

# 6. Run it
npm run dev
```

Open **http://localhost:5173**. The first time, the system asks you to create the **librarian account**
(`/setup`). In development the seed also makes a test admin `e2e_admin` / `TestPass123!` (never in production).

**Email (sign-in codes).** Accounts with an email get a 6-digit code at every sign-in. Set `EMAIL_USER` to a Gmail
address and `EMAIL_PASS` to a Gmail **App Password** (Google Account > Security > 2-Step Verification > App
passwords). Without it, in development the code is printed in the backend terminal as `[DEV OTP]`.

## 2. Running the apps

| Command (from the project folder) | Starts |
|---|---|
| `npm run dev` | API + Staff Web Portal (http://localhost:5173) |
| `npm run dev:desktop` | API + Staff Desktop window |
| `npm run dev:all` | API + Staff Web + Staff Desktop |
| `npm run android` | Builds the app and installs it on **one** Android phone plugged in by USB (it uses the laptop's API through the cable) |
| `npm run android:install-all` | Installs the app on **every** phone on a USB hub; the phones then use the laptop's API over Wi-Fi |
| `npm run android:share` | Shows a **QR code** in the terminal; phones on the same Wi-Fi scan it to download and install the app |
| `npm run android:lan` | Only builds that Wi-Fi version (`frontend/release/AklatOne-LAN.apk`) |
| `cd frontend && npx cap open ios` | Opens the iPhone project in Xcode (on a Mac) |

Each part can also run alone: `cd backend && npm run dev` (API on port 3000), `cd frontend && npm run dev`.
On the phone: turn on **Developer options > USB debugging** for USB installs; allow **Install unknown apps** for
the QR download.

**Before the school has a domain (laptop as the server):** run `npm run dev` on the laptop, connect the laptop
and the phones to the same Wi-Fi, open port 3000 in the laptop's firewall once
(`sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload` on Fedora), then use
`android:install-all` (USB hub) or `android:share` (QR over Wi-Fi). The phones work while they are on that Wi-Fi.

**After the school has a domain (HTTPS):** put the signed APK on the server and print the poster from
**Printing > Mobile app QR**; members scan it at home or in school (see section 4).

## 3. Where to change things

| To change | Edit |
|---|---|
| Loan period and book limit | `backend/src/config/loanPolicy.ts` |
| School ID and default signatories on printouts | `frontend/src/features/printing/Printing.tsx` (`SCHOOL_ID`, `DEFAULT_SIGNATORIES`); signatories can also be edited on screen |
| School newspaper links (The Victor, Masid) | `frontend/src/components/SchoolNewspaper.tsx` |
| Logos and photos | `frontend/public/` (`tnhs-logo.png`, `aklatone-icon.png`, `tnhs-background.webp`, `tnhs-facade*.webp`); email logos in `backend/assets/email/` |
| Colors (light and dark theme) | `frontend/src/index.css` (`--color-*` tokens) |
| Privacy Policy and Terms (shown in the app) | `frontend/src/features/mobile/MobileSettings.tsx` (`PrivacyText`, `TermsText`); then raise `CONSENT_VERSION` in `frontend/src/features/mobile/MobileWelcome.tsx` so members accept the new text |
| Email wording | `backend/src/common/email.ts` (preview: `cd backend && npm run email:preview`) |
| Server settings (email, backups, reminders, limits) | `backend/.env` (development) or the root `.env` (Docker); every setting is listed in `backend/src/config/env.ts` |
| Server address used by the apps | `frontend/.env` → `VITE_API_BASE_URL` |
| App name, package id | `frontend/capacitor.config.ts`, `frontend/desktop-tauri/tauri.conf.json` |
| App version | `frontend/mobile-capacitor/android/app/build.gradle` (`versionCode`, `versionName`), `frontend/desktop-tauri/tauri.conf.json` (`version`) |
| Database tables | `backend/prisma/schema.prisma`, then `npx prisma migrate dev --name <change>` (back up first) |
| Library rules (what is allowed) | `docs/aklatone-library-business-rules.md` and the matching module in `backend/src/modules/` |

**Backend modules** (`backend/src/modules/`): `auth` (sign-in, codes), `users` (members, Member ID, cards),
`catalog` (books, Excel import/export), `book-copies`, `circulation` (lend, return), `borrow-requests`,
`notifications` (alerts, daily reminders), `visits` (Visitor's Log), `time` (time spent), `suggestions`,
`inventory`, `reports`, `backup`, `system`, `setup`, `favourites`, `categories`.
**Frontend screens** (`frontend/src/features/`): one folder per screen group; `mobile/` is the phone app.
API documentation: **http://localhost:3000/api-docs** while the API runs.

## 4. Deploying (going live)

Full guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

| Option | What runs where | Files |
|---|---|---|
| **Hostinger VPS** or any Linux server with Docker (recommended) | Everything on one server: MariaDB, Redis, API, Staff Web, Caddy HTTPS | `docker-compose.yml`, `Caddyfile`, `.env.example` |
| **Render** | API (Docker) + private MariaDB with a disk | `render.yaml` (Blueprint) |
| **Vercel** | Staff Web Portal only (with the API on Render or a VPS) | `frontend/vercel.json` |

```bash
# On the server (Docker), short version
cp .env.example .env          # passwords, JWT_SECRET, SITE_ADDRESS=your.domain, EMAIL_USER / EMAIL_PASS
docker compose up -d --build  # HTTPS certificate, migrations and roles happen automatically
```

**Phone app for members after going live:** build the signed APK (push a tag `v1.0.0` and GitHub Actions builds
it, or see DEPLOYMENT.md section 4), copy it to `downloads/AklatOne.apk` on the server, then print
**Printing > Mobile app QR**. iPhone: publish through TestFlight / the App Store (needs an Apple Developer account)
and paste that link in the same screen.

**Desktop app for the library computers:** download the Windows installer from the GitHub Release.

## 5. Security
See **[SECURITY.md](SECURITY.md)**: what the system protects, how to report a problem, and step-by-step what to
do if the system is breached. Never commit `.env` files, backups, or the Android signing key (`~/aklatone-keys/`).

## 6. Tests and checks

```bash
npm test                                     # backend and frontend tests
cd backend && npm run typecheck && npm run lint
cd frontend && npm run lint && npm run build
```
Backend tests need a separate test database `aklatone_e2e` (same server, same user):
`DATABASE_URL=<your URL with /aklatone_e2e> REDIS_URL= npm test` (see `AGENTS.md`). GitHub Actions runs every
test and builds the web, Windows, Linux, Android and iOS apps on each push (`.github/workflows/`).

## 7. Project map

```
backend/                 API: src/modules (one folder per feature), prisma/ (schema + migrations), tests/
frontend/src/            shared React code for all apps (features/ = screens, components/, lib/)
frontend/web-pwa/        Staff Web shell (manifest, service worker)
frontend/desktop-tauri/  Staff Desktop shell (Rust, window, offline credential store)
frontend/mobile-capacitor/android | ios   phone app native projects
docs/                    deployment, architecture, compatibility, business rules, diagrams, manuscript text
downloads/               (server) the APK members download
scripts/                 dev launcher, off-site backup
docker-compose.yml, Caddyfile, render.yaml   deployment
```

Further reading: `docs/ARCHITECTURE.md` (layers), `docs/COMPATIBILITY.md` (devices), `docs/diagrams/`
(flowcharts, DFD, ERD), `docs/manuscript/` (capstone text), `docs/PROJECT_CONTEXT.md` (decisions and history).
