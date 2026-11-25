# Dev Account Provisioning Review

## Script location
backend/scripts/provision-dev-accounts.mjs

## Purpose
Create dev accounts for TEACHER and STUDENT roles (legacy AklatOne roles).

## Operations
- Validates ALLOW_DEV_ACCOUNTS=1, NODE_ENV=development.
- Validates DB host localhost, port 3307, db aklatone.
- Prompts for usernames/passwords (hidden).
- Hashes passwords with bcrypt.
- Skips existing usernames.
- Creates accounts in transaction.

## Role assignment
- TEACHER role (not LIBRARIAN).
- STUDENT role (not MEMBER).

## Password handling
- Interactive hidden input or env vars.
- Hashed with bcrypt.

## Risks
- Targets legacy roles (TEACHER/STUDENT), not current AklatOne roles (LIBRARIAN/MEMBER).
- No dry-run.
- If interrupted, transaction prevents partial (but prompts happen before DB).

## Required approval
- Explicit approval needed before execution.

## Cleanup
- Delete created users manually via SQL (not automated).

## Confirmation
- Script was NOT executed.