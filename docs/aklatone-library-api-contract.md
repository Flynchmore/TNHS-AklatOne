# AklatOne Library API Contract (Planned)

Base: /api/v1

## Public
- GET /catalog?q&categoryId&sortBy&sortOrder&limit&offset -> { items, total, limit, offset } (availability summary)
- GET /catalog/:id -> book + availability summary
- GET /categories?limit&offset -> { items, total, limit, offset }

## Staff (auth required)
- POST /catalog (catalog:write)
- PATCH /catalog/:id (catalog:write)
- DELETE /catalog/:id (catalog:write)
- POST /categories (categories:write)
- PATCH /categories/:id (categories:write)
- DELETE /categories/:id (categories:write)
- GET/POST /book-copies (copies:read / copies:write)
- PATCH /book-copies/:id/status (copies:write)
- POST /circulation/borrow (circulation:write)
- POST /circulation/return (circulation:write)
- GET /circulation/transactions (circulation:read or own)
- GET /circulation/transactions/:id (circulation:read or own)
- GET /reports/summary (reports:read)
- GET /reports/copies-by-status (reports:read)
- GET /users (users:read)

## Auth
- POST /auth/register (MEMBER only, if enabled)
- POST /auth/login
- GET /auth/me

All mutations are transactional with audit logging.