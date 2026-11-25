# AklatOne Frontend Integration Guide

## Base URL
- Development: `http://localhost:3000`
- API base: `/api/v1`
- Health: `GET /health`
- Swagger UI: `/api-docs`

## Authentication
1. `POST /api/v1/auth/login` with `{ username, password }`
2. Receive `{ data: { token } }`
3. Send `Authorization: Bearer <token>` on protected routes.

## Pagination
- `limit` (1-100, default 50), `offset` (default 0)
- Response: `{ success, message, data: { items, total, limit, offset } }`

## Filtering examples
- Catalog search: `GET /api/v1/catalog?q=noli&categoryId=<id>&sortBy=title&sortOrder=asc`
- Transactions: `GET /api/v1/circulation/transactions?status=ACTIVE&from=2026-01-01T00:00:00Z`

## Error format
```json
{ "success": false, "message": "Validation failed", "requestId": "..." }
```

## Example workflow
```bash
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"librarian","password":"password123"}'
```

## Permissions
- `catalog:write`, `categories:write`, `copies:write`, `circulation:write`, `users:read`, `reports:read`
- ADMIN has wildcard `*`.

## Notes
- Public registration may be disabled; default false.
- Do not store tokens in insecure locations.
## Authentication Security Note
Tokens are currently stored in localStorage for SPA simplicity. This is susceptible to XSS. For production, consider HttpOnly cookies with CSRF protection. Logout clears localStorage.
