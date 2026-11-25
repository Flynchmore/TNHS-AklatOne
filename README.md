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

## Quick start with Docker (one command)

The easiest way to run the whole system (database, API, Staff Web Portal and HTTPS) on any computer or server.
You only need **Docker** and **Git**; Docker downloads and sets up everything else (Node.js, MariaDB, nginx, Caddy),
so the system runs the same way on every machine.

1. Install **Docker Desktop** (Windows 10/11 or macOS) or **Docker Engine + Compose plugin** (Linux):
   <https://docs.docker.com/get-docker/>. On Windows, also install **Git for Windows** (it includes Git Bash).
2. Open a terminal (Git Bash on Windows) and run:

```bash
git clone https://github.com/Flynchmore/TNHS-AklatOne.git && cd TNHS-AklatOne
bash scripts/docker-setup.sh                       # this computer / school network: http://localhost
# or, on a server with a domain:
bash scripts/docker-setup.sh library.example.com   # https://library.example.com (free certificate)
```

The script checks Docker, creates `.env` with **random passwords**, builds and starts everything, and waits until
the system answers. Then open the address it prints: the first visit asks you to **create the librarian account**.

| Afterwards | Command |
|---|---|
| Stop / start again | `docker compose stop` / `docker compose up -d` |
| Update to the newest version | `git pull && bash scripts/docker-setup.sh` |
| See what is happening | `docker compose ps`, `docker compose logs -f api` |
| Sign-in codes by email | put `EMAIL_USER` and `EMAIL_PASS` (Gmail App Password) in `.env`, run the setup again |

Keep `.env` private and copy its `BACKUP_ENCRYPTION_KEY` to a safe place. The Docker setup runs the server side;
the phone app and the desktop app are installed on the devices (sections 2 and 4).

## Requirements

### Who needs what

| Device | How many | Used for |
|---|---|---|
| Server (or one always-on computer) | **1** | Runs the database and API for everyone. A cloud VPS (e.g. Hostinger) or a school PC. |
| Librarian computer(s) | 1 or more | Staff Web Portal in a browser, or the Staff Desktop app (works offline) |
| Visitor's Log kiosk | 1 (optional) | A computer near the door running the Desktop app in kiosk mode, with a webcam or USB barcode scanner |
| Students' and teachers' phones | any | The AklatOne app (optional: members without a phone use their Library ID card) |
| Backup machine | 1 (recommended) | Another computer, NAS or cloud folder that receives a copy of the daily backup |

### Phones (AklatOne mobile app)

| | Minimum | Recommended |
|---|---|---|
| Android | **Android 8.0 (Oreo)** or newer, with *Android System WebView* updated from the Play Store | Android 10 or newer |
| iPhone / iPad | **iOS / iPadOS 16.4** or newer (iPhone 8 / iPhone X and newer) | iOS 17 or newer |
| Memory (RAM) | 2 GB | 3 GB or more |
| Free storage | 150 MB | 300 MB |
| Camera | Rear camera, for scanning the Visitor's Log QR code (librarian mode: Library ID cards and book labels) | Rear camera with autofocus |
| Connection | Wi-Fi or mobile data to reach the school server (saved catalog, loans and receipts stay readable offline) | |

### Web browsers (Staff Web Portal, and the app's web view)

| Browser | Minimum version |
|---|---|
| Google Chrome / Microsoft Edge | 111 |
| Mozilla Firefox | 128 |
| Safari (macOS, iOS) | 16.4 |

Camera scanning in the browser needs HTTPS (or `localhost`). Internet Explorer and very old browsers are not supported.

### Computers (librarian, kiosk, development)

| | Minimum (librarian / kiosk) | Recommended (= the development laptop) |
|---|---|---|
| Operating system | Windows 10 (64-bit, 1803 or newer) or Windows 11; Linux 64-bit (Ubuntu 22.04+, Fedora 38+) | Windows 11 or Fedora / Ubuntu |
| Processor | Dual-core 2 GHz (Intel Core i3 / AMD Ryzen 3 or similar) | Intel Core i3-1115G4 (11th gen, 2 cores / 4 threads, 3.0 GHz) or better |
| Memory (RAM) | 4 GB | 8 GB (16 GB for building the Android and desktop apps comfortably) |
| Storage | 500 MB free for the Desktop app | 256 GB SSD (NVMe); 20 GB free for development tools |
| Screen | 1280 × 800 | 1366 × 768 or larger |
| Other | Microsoft Edge WebView2 (built into Windows 11; the installer adds it on Windows 10) | USB barcode scanner or webcam (inventory, kiosk), A4 printer (ID cards, labels, reports) |

### Server

| | Minimum | Recommended (about 2,600 students) |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| Memory | 4 GB | 8 GB |
| Storage | 40 GB SSD | 80 GB SSD (database, 14 daily backups, phone app download) |
| System | Linux 64-bit (Ubuntu 22.04 / 24.04 LTS) with Docker Engine 24+ and Docker Compose v2 | same |
| Network | Ports 80 and 443 open; a **domain name** pointing to the server for HTTPS | |

Measured on the 4-thread development laptop: 300 members browsing at the same time answered in under 0.1 s;
1,000 at the same time in about 1–1.5 s, with no errors (`backend/scripts/load-test.mjs`).

### Software used by the system

| Part | Software |
|---|---|
| Server | Node.js 22+ (in Docker: Node 24 LTS), MariaDB 10.11, Redis 7 (optional), nginx, Caddy 2 (HTTPS), Docker |
| Staff Web Portal | Any supported browser (above); can be installed as a web app (PWA) |
| Staff Desktop App | Tauri 2 with Microsoft Edge WebView2 (Windows) or WebKitGTK 4.1 (Linux) |
| Mobile app | Capacitor 8 (Android WebView / iOS WKWebView) |
| Email | A Gmail account with an App Password (sends sign-in codes and notices) |

### Tools for setting up and building

| Tool | Needed for | Get it |
|---|---|---|
| Git | getting and updating the code | <https://git-scm.com> |
| Docker Desktop / Docker Engine + Compose | running the system with one command | <https://docs.docker.com/get-docker/> |
| Node.js 22+ (includes npm) | development without Docker, building the apps | <https://nodejs.org> |
| MariaDB 10.11 | development without Docker | <https://mariadb.org/download/> |
| Android Studio (Android SDK 36, platform tools / `adb`) + JDK 21 | building and installing the Android app | <https://developer.android.com/studio> |
| Rust (rustup) + Tauri prerequisites (Windows: Visual Studio C++ Build Tools; Linux: webkit2gtk-4.1) | building the Desktop app | <https://tauri.app/start/prerequisites/> |
| A Mac with Xcode 16+ and an Apple Developer account | building and publishing the iPhone app | <https://developer.apple.com/xcode/> |
| A code editor (e.g. Visual Studio Code) | changing settings and code | <https://code.visualstudio.com> |
| draw.io (optional) | editing the diagrams in `docs/diagrams/` | <https://www.drawio.com> |

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

## 4. Deploying (going live) on a Hostinger VPS

Full guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. One VPS runs the whole system (MariaDB, Redis, API,
Staff Web Portal and HTTPS) with Docker; the phone and desktop apps connect to it.

1. **Buy a Hostinger *VPS* plan** (not "Web Hosting": shared hosting cannot run Docker, Node.js or MariaDB).
   **KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe) fits the server requirements above for about 2,600 students;
   KVM 1 (1 vCPU) is below the minimum. Choose the **12-month** billing period for a one-year deployment
   (24 months is cheaper per month). The renewal price is higher than the first-term promo: check the cart.
2. **Operating system:** in hPanel, *VPS > OS & Panel > Operating System*, pick the template
   **Ubuntu 24.04 with Docker**. It is Ubuntu with Docker and Docker Compose already installed, so the setup script
   can run at once. (Changing the template later erases the VPS; do it before putting data on it.)
3. **Domain:** Hostinger's VPS plans advertise a **free domain for the first year** (selected extensions;
   claim it in hPanel > Domains). Otherwise buy one separately (e.g. `.com`, `.ph`, or ask the Division / school for
   a subdomain). Add an **A record** for the domain (e.g. `library.example.com`) pointing to the VPS IP. Renew the
   domain each year, or the address and HTTPS stop working.
4. Connect and run the setup (replace the domain):

```bash
ssh root@<VPS IP>
git clone https://github.com/Flynchmore/TNHS-AklatOne.git /opt/aklatone && cd /opt/aklatone
bash scripts/docker-setup.sh library.example.com
nano .env      # add EMAIL_USER and EMAIL_PASS (Gmail App Password), then run the setup line again
```

5. Open `https://library.example.com`, create the librarian account, and follow
   [docs/USER-GUIDE.md](docs/USER-GUIDE.md). Then set up the daily off-site backup copy (DEPLOYMENT.md, section 5)
   and turn on Hostinger's VPS backups/snapshots as a second safety net.

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
docker-compose.yml, Caddyfile   deployment (Hostinger VPS or any Docker server)
```

How to use the system day to day: **[docs/USER-GUIDE.md](docs/USER-GUIDE.md)** (librarian and members).
Further reading: `docs/ARCHITECTURE.md` (layers), `docs/COMPATIBILITY.md` (devices), `docs/diagrams/`
(flowcharts, DFD, ERD), `docs/manuscript/` (capstone text), `docs/PROJECT_CONTEXT.md` (decisions and history).
