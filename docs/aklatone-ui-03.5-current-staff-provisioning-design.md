# Current Staff Provisioning Design

## User and role schema
- User: id, username, passwordHash, displayName?, email?, isActive, roleId, timestamps.
- Role: id, name, permissions Json.
- Roles: ADMIN, LIBRARIAN, MEMBER.

## Authentication requirements
- Login: username/password, bcrypt compare, JWT sign.
- Inactive users rejected.

## Password hashing
- bcrypt with BCRYPT_ROUNDS (default 12).

## Required account fields
- username, passwordHash, roleId.

## Account creation rules
- No user-management endpoint except register (MEMBER only).
- Staff accounts must be created via DB or provisioning script.

## Recommended provisioning method
- Create a new guarded script (not legacy) that creates LIBRARIAN account only, with ALLOW_DEV_ACCOUNTS=1 and DB validation.

## Database safeguards
- Validate host localhost, port 3307, db aklatone.
- Reject remote, 3306, aklatone_e2e.

## Audit and cleanup
- Audit log entry on creation.
- Manual deletion after QA.

## Risks
- No user-management API.
- Script must be approved.

## Proposed implementation steps
1. Inspect schema (done).
2. Create guarded provisioning script.
3. Test safety guards (no DB writes).
4. Obtain approval to execute.