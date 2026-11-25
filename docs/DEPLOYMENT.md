# Deploying AklatOne

The repository is ready for GitHub and for Docker Compose on any Linux server with Docker, such as a **Hostinger VPS**.
Hostinger *shared* web hosting cannot run the Node.js API together with MariaDB and Redis, so use a VPS plan.

## 1. Put the code on GitHub

```bash
git init
git add .
git commit -m "AklatOne"
git branch -M main
git remote add origin https://github.com/<your-account>/aklatone.git
git push -u origin main
```

`.gitignore` keeps out every `.env`, `node_modules`, build output, APKs and signing keys. Check `git status` before the
first commit: no `.env` file may appear in it. The GitHub Actions workflow (`.github/workflows/ci.yml`) then runs the
backend tests on a temporary MariaDB and the frontend lint, tests and build on every push.

## 2. Start the server (Hostinger VPS or any Docker host)

1. Create the VPS with Ubuntu and install Docker (Hostinger offers an "Ubuntu with Docker" template).
2. Point your domain (e.g. `library.example.com`) to the VPS IP address with an **A record**.
3. On the VPS:

```bash
git clone https://github.com/<your-account>/aklatone.git && cd aklatone
cp .env.example .env
nano .env        # set DB_PASSWORD, DB_ROOT_PASSWORD, DB_APP_PASSWORD, JWT_SECRET (openssl rand -hex 32), EMAIL_*, CORS_ORIGINS
docker compose up -d --build
docker compose logs -f api   # wait for "AklatOne startup checks" with database true
```

The Staff Web is now on `http://<server>/`. On first visit it opens **First-time setup** to create the librarian account.

What starts: `db` (MariaDB 10.11, data in the `db-data` volume), `redis`, `api` (applies database migrations and
creates the roles on every start; never resets data, never creates test accounts in production) and `web`
(nginx serving the Staff Web and forwarding `/api` to the API, with security headers and a Content-Security-Policy).

**Two database users (least privilege).** On first start, `backend/db-init/01-app-user.sh` creates `aklatone_app`,
which can only read and write rows. The API answers every request as `aklatone_app`; only migrations, backups and
restores use the full user `aklatone` (`DATABASE_ADMIN_URL`). If the `db-data` volume already existed before this
change, create the user once by hand:

```bash
docker compose exec db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "CREATE USER IF NOT EXISTS \`aklatone_app\`@\`%\` IDENTIFIED BY \"$DB_APP_PASSWORD\"; GRANT SELECT, INSERT, UPDATE, DELETE ON aklatone.* TO \`aklatone_app\`@\`%\`;"'
```

## 3. HTTPS (built in)

`docker-compose.yml` has a `proxy` service (Caddy, see `Caddyfile`) in front of the Staff Web and API.

1. Point the domain (e.g. `library.example.com`) to the server with an **A record**; open ports 80 and 443.
2. In `.env`: `SITE_ADDRESS=library.example.com` and `CORS_ORIGINS=https://library.example.com`.
3. `docker compose up -d --build`. Caddy gets a free Let's Encrypt certificate, renews it, and sends HTTP to HTTPS.

`SITE_ADDRESS=:80` (the default) serves plain HTTP, only for a test on the school LAN: release phone apps refuse
plain HTTP. Keep the `caddy-data` volume (it holds the certificates). The API trusts two proxies (`TRUST_PROXY: 2`)
so per-IP limits still see each visitor's real address.

## 4. Release builds and signing

Both apps call the server address they were built with (`VITE_API_BASE_URL`, must be `https://`).

**Automatic (recommended):** push a tag, e.g. `git tag v1.0.0 && git push origin v1.0.0`. The `Release` workflow
(`.github/workflows/release.yml`) builds the signed Android APK + App Bundle and the Windows / Linux Desktop
installers and attaches them to a GitHub Release. Set these once in GitHub (Settings > Secrets and variables > Actions):

| Name | Kind | Value |
|---|---|---|
| `API_BASE_URL` | Variable | `https://library.example.com` |
| `ANDROID_KEYSTORE_BASE64` | Secret | `base64 -w0 ~/aklatone-keys/aklatone-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD` | Secret | `storePassword` / `keyPassword` from `~/aklatone-keys/keystore.properties` |
| `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD` | Secret (optional) | Code-signing certificate; without it the Windows installer is unsigned (SmartScreen warns once) |

**On this computer:**

```bash
cd frontend
echo "VITE_API_BASE_URL=https://library.example.com" > .env.production
npm run build && npx cap sync
(cd mobile-capacitor/android && ./gradlew assembleRelease bundleRelease)   # signed with ~/aklatone-keys
npx tauri build                                                            # Desktop installers for this OS
```

**Android signing key:** `~/aklatone-keys/aklatone-release.jks` + `keystore.properties` (made 2026-11-25, alias
`aklatone`, valid ~27 years). It is never in the project (`.gitignore` blocks `*.jks`, `keystore.properties`).
**Copy that folder to two safe places** (USB in the school office, a password manager): without it, installed phones
can never receive an update of the app. **iOS** needs an Apple Developer account; sign and archive in Xcode on a Mac
(`docs/COMPATIBILITY.md`).

## 5. Updates, backups and monitoring

In the app: **Settings > Backup and Restore** downloads a backup (optionally password-encrypted) and restores one;
the server also keeps a daily automatic copy (2 AM PH time, newest 14, in the `backups` volume; set
`BACKUP_ENCRYPTION_KEY` in `.env` to encrypt them).

```bash
git pull && docker compose up -d --build                 # update to the latest version
```

**Off-site copy (do this):** set `OFFSITE_TARGET=user@host:/path` in `.env`, set up SSH key login to that machine
once, then run `scripts/offsite-backup.sh` daily from cron (example inside the script). It copies only new backup
files. Test a restore at least once each school year (Settings > Backup and Restore, on a test copy).

**Uptime:** add a free monitor (e.g. UptimeRobot) for `https://library.example.com/health`; it should answer
`{"status":"ok"}`. Settings > System status shows the database, email, backups and disk space.

## 6. Phone app download for members

- **Before a domain (LAN):** the laptop is the server. `npm run android:install-all` (phones on a USB hub) or
  `npm run android:share` (QR in the terminal, download over the same Wi-Fi). These builds point to the laptop's
  Wi-Fi address and only work on that Wi-Fi.
- **With a domain (HTTPS):** copy the signed release APK to `downloads/AklatOne.apk` on the server
  (`docker-compose.yml` mounts it into the web container), then print **Printing > Mobile app QR**; its default
  link is `https://<domain>/download/AklatOne.apk`. Add the App Store / TestFlight link there for iPhones.
- Members without a phone are not left out: their Library ID card works for borrowing, returns and the Visitor's Log.

## 7. Other hosts: Render (API + database) and Vercel (Staff Web)

Use this when you cannot run your own server. The VPS setup above stays the simplest and cheapest for one school.

1. **Render**: Dashboard > New > Blueprint > choose this repository. `render.yaml` creates `aklatone-api`
   (Docker, from `backend/`) and `aklatone-db` (MariaDB 10.11 with a 5 GB disk). Both need a paid instance type:
   free instances sleep and have no persistent disk. After the first deploy set `DATABASE_URL`, `CORS_ORIGINS`,
   `EMAIL_USER` and `EMAIL_PASS` on `aklatone-api` (steps at the top of `render.yaml`). Copy the generated
   `BACKUP_ENCRYPTION_KEY` somewhere safe.
2. **Vercel**: New Project > import this repository > **Root Directory `frontend`**. Add the environment variable
   `VITE_API_BASE_URL=https://<aklatone-api>.onrender.com`. `frontend/vercel.json` sets the build, the single-page
   routing and the security headers.
3. Put the Vercel address in `CORS_ORIGINS` on Render, and build the phone and desktop apps with the Render API
   address (`API_BASE_URL` in GitHub).
4. Differences from the VPS setup: the API connects to the database with the full user (no separate rows-only
   user), there is no Redis (sign-in limits are kept in memory), the phone app download is not served by Vercel
   (use the GitHub Release link in **Printing > Mobile app QR**), and scheduled backups and reminders run only while the
   Render service is running (paid instances do not sleep).

## Settings reference (`.env` in the project root)

| Variable | Purpose |
|---|---|
| `DB_PASSWORD`, `DB_ROOT_PASSWORD` | MariaDB passwords (choose long random values) |
| `JWT_SECRET` | Signs sessions; at least 32 random characters (the API refuses weak values in production) |
| `EMAIL_USER`, `EMAIL_PASS` | Gmail address and app password for sign-in codes and notices |
| `CORS_ORIGINS` | Public HTTPS address of the Staff Web; mobile and desktop apps are always allowed |
| `SITE_ADDRESS` | Domain for HTTPS (e.g. `library.example.com`); `:80` = plain HTTP LAN test |
| `OFFSITE_TARGET` | rsync target for `scripts/offsite-backup.sh` (e.g. `backup@nas:/backups/aklatone`) |
| `GLOBAL_RATE_LIMIT_MAX`, `STAFF_RATE_LIMIT_MAX`, `ANON_RATE_LIMIT_MAX` | Requests per 15 minutes per member account (300), per librarian account (3000), and per IP without sign-in (3000; a school Wi-Fi is one IP) |
| `DB_APP_PASSWORD` | Password of the rows-only API user `aklatone_app` (letters and numbers only) |
| `BACKUP_ENCRYPTION_KEY`, `BACKUP_KEEP` | Encrypts the daily automatic backups; how many to keep (default 14) |
| `REMINDER_AUTO`, `REMINDER_HOUR`, `REMINDER_DAYS_BEFORE` | Automatic due-soon reminder (default on, 7 AM PH, loans due by the end of tomorrow) |

## Load test (before a big testing day)

Against a server that uses the **E2E** database (the script signs in as `e2e_admin`, which never exists in production):

```bash
cd backend && API=http://localhost:3000 USERS=300 SECONDS=60 node scripts/load-test.mjs
```

It creates fictional members `loadtest_001...`, makes them all sign in at once, then lets them browse for a minute and
prints the response times. On the 4-core development PC: 300 members browsing answered in under 61 ms (95% of
requests) with no errors; 300 sign-ins at the same moment took up to 7 seconds because password checking (bcrypt) is
deliberately slow. Adding `?connectionLimit=20` to `DATABASE_URL` gives the API a few more database connections.

## Growing to 5,000 students or more

The number of accounts is not the limit (MariaDB handles tens of thousands of members); the number of people using the
apps **at the same moment** is. With 5,000 students, expect roughly 250-500 at the busiest time. In order:

1. A VPS with more CPU cores and memory, and `?connectionLimit=20` (or more) on `DATABASE_URL`.
2. If one API process is still too slow, run 2-4 API processes behind nginx. Before that, move the two things that
   still live in one process's memory into Redis or the database: the restore lock (`modules/backup`) and the Excel
   import preview tokens (`modules/catalog/catalog.import.ts`). Rate limits already use Redis.
3. Re-run `scripts/load-test.mjs` with the new number of users.
