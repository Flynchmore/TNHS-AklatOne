# Security of AklatOne

AklatOne keeps personal data of students and teachers (names, grade and section, emails, borrowing and visit
records), so it is protected under the Data Privacy Act of 2012 (RA 10173).

## Reporting a security problem
Do **not** open a public GitHub issue. Use **Security > Report a vulnerability** on this repository (private
vulnerability reporting; the repository owner must switch it on once in Settings > Code security), or tell the
school's ICT Coordinator directly. Include what you did, what you saw, and the date and time.

## What the system already does
- Role-based access (Administrator, Librarian, Member) checked on the server for every request; tests prove that
  members cannot reach staff endpoints or other members' records (`backend/tests/security.test.ts`).
- Passwords hashed with bcrypt; strong-password rule on the server; two-factor sign-in with a 6-digit email code
  (random, valid 10 minutes, stored only as a hash).
- Sessions end at once when an account is deactivated or its password changes; staff web sessions end after
  30 idle minutes.
- Limits on failed sign-ins, wrong codes and requests, per account; sign-in and password reset never reveal whether
  an account exists.
- Input validation on every request, secure HTTP headers, Content Security Policy (web and desktop), HTTPS with
  HSTS (Caddy), the release phone app refuses plain HTTP.
- The API runs as a non-root user and connects to the database with a rows-only account (no DROP / ALTER).
- Audit log of staff actions, sign-ins and failed sign-ins; daily encrypted backups, off-site copy script.
- GitHub: CodeQL code scanning and Dependabot updates (`.github/`), CI runs every test on each push.

## If you think the system was breached (incident response)
Write down the time of each step; the school may need it for the report.

1. **Contain.** On the server: `docker compose stop proxy` (the site goes offline; data stays). If only one
   account is affected, deactivate it in **Members** instead.
2. **End every session.** Put a new `JWT_SECRET` in `.env` (`openssl rand -hex 32`) and run
   `docker compose up -d api`. Every phone, browser, desktop and kiosk must sign in again.
3. **Change the other secrets** in `.env`: `DB_PASSWORD`, `DB_APP_PASSWORD`, `DB_ROOT_PASSWORD` (also inside
   MariaDB), and the Gmail **app password** (`EMAIL_PASS`: revoke it in the Google account, make a new one).
   Keep the old `BACKUP_ENCRYPTION_KEY` somewhere safe: older backups need it.
4. **Find out what happened.** Check the audit log (database table `AuditLog`; actions `auth.login`,
   `auth.login_failed`, `backup.*`, `user.*`) and `docker compose logs api`. Note which accounts and records
   were touched.
5. **Repair the data.** If records were changed or deleted, restore the last good backup from before the
   incident (**Settings > Backup and Restore**; a safety copy of the current state is saved first).
6. **Fix the cause.** Update dependencies, read the CodeQL and Dependabot alerts on GitHub, change any password
   that may have leaked, and ask affected users to change theirs.
7. **Report.** If personal data may have been exposed, the school's Data Protection Officer must notify the
   National Privacy Commission and the affected students, teachers and parents **within 72 hours** of knowing
   about it (NPC Circular 16-03).
8. **Bring the site back:** `docker compose up -d`, then check sign-in, borrowing and the Visitor's Log.

## GitHub account and repository
The source code and the release builds live on GitHub, so the account that owns the repository protects the whole
system.

- **Owner account:** long unique password, **two-factor authentication** on (Settings > Password and
  authentication), recovery codes saved offline. Never write a password in a chat, an issue, a document or a commit;
  if one was shared, change it at once. `git push` uses a personal access token or SSH key, never the password.
- **Turn on once** in the repository's *Settings*:
  - *Code security*: **Dependabot alerts**, **Dependabot security updates**, **Secret scanning** with **push
    protection** (blocks a commit that contains a password or key), **Private vulnerability reporting**.
  - *Rules > Rulesets > New branch ruleset* for `main`: **Restrict deletions** and **Block force pushes**. Add
    "Require a pull request" and "Require status checks" only when every change goes through pull requests.
- **Dependabot pull requests:** merge them when the CI checks are green. Do not merge Node.js updates to an
  odd-numbered version (e.g. 25): only even versions get long-term support.
- **Code scanning (CodeQL):** review new alerts under *Security > Code scanning*. Two kinds are expected and can be
  dismissed: the password change that asks for the current password only when a new password is set
  (*false positive*), and the `[DEV OTP]` line that prints sign-in codes only on a development computer
  (*used in tests*).
- **Collaborators:** give access only to the people who maintain the system, and remove it when they leave.

## The server (Hostinger VPS)
- Sign in with an **SSH key** instead of the root password, then switch off password logins
  (`PasswordAuthentication no` in `/etc/ssh/sshd_config`, `systemctl restart ssh`).
- Firewall: allow only SSH, HTTP and HTTPS:
  `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable` (Hostinger's panel firewall can do the same).
  The database, Redis and the API are never published outside Docker.
- Security updates: `apt install unattended-upgrades` and keep Docker images current with
  `git pull && bash scripts/docker-setup.sh <domain>`.
- Turn on Hostinger's **VPS backups / snapshots** in addition to AklatOne's encrypted daily backups and the off-site
  copy (`scripts/offsite-backup.sh`).
- Keep the hPanel account itself protected with two-factor authentication.

## Keeping it safe day to day
- Never share or commit `.env`, `~/aklatone-keys/` (Android signing key) or backup files.
- Give the librarian account a long unique password; do not share it with student assistants.
- Merge Dependabot pull requests once CI is green; look at Security > Code scanning now and then.
- Keep `BACKUP_ENCRYPTION_KEY` and `OFFSITE_TARGET` set, and test a restore once each school year.
