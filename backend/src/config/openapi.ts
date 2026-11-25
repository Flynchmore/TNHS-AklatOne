/**
 * OpenAPI description served at /api-docs. tests/openapi.test.ts fails when a route in src/modules is not listed here.
 * Paths are relative to the server URL /api/v1.
 */
type Op = { summary: string; tags: string[]; security?: { bearerAuth: [] }[]; responses: Record<string, { description: string }>; requestBody?: unknown };
const R = (codes: Record<string, string>) => Object.fromEntries(Object.entries(codes).map(([k, v]) => [k, { description: v }]));
const tagOf = (path: string) => path.split("/")[1] ?? "system";

/** Public endpoint (no token). */
const pub = (path: string, summary: string, codes: Record<string, string> = {}): Op =>
  ({ summary, tags: [tagOf(path)], responses: R({ "200": "OK", "400": "Validation failed", ...codes }) });
/** Any signed-in user, or a staff permission when `perm` is given. */
const auth = (path: string, summary: string, perm?: string, codes: Record<string, string> = {}): Op => ({
  summary: perm ? `${summary} (${perm})` : summary,
  tags: [tagOf(path)],
  security: [{ bearerAuth: [] }],
  responses: R({ "200": "OK", "400": "Validation failed", "401": "Unauthenticated", ...(perm ? { "403": "Forbidden" } : {}), ...codes }),
});
const binary = { content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } };

export const openApiSpec = {
  openapi: "3.0.3",
  info: { title: "AklatOne API", version: "1.0.0", description: "AklatOne Library Management System, Tagumpay National High School. Responses use { success, message, data }." },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
  },
  paths: {
    "/auth/login": { post: pub("/auth", "Sign in; accounts with an email get a 6-digit code first", { "401": "Invalid credentials", "429": "Too many failed attempts" }) },
    "/auth/verify-login-otp": { post: pub("/auth", "Finish sign-in with the emailed code", { "401": "Wrong or expired code", "429": "Too many failed attempts" }) },
    "/auth/email/send": { post: pub("/auth", "Account without an email: send a code to the email it adds (emailToken from sign-in)", { "401": "Step expired", "409": "Email used by another account" }) },
    "/auth/email/verify": { post: pub("/auth", "Confirm the added email with its code; saves it and signs in", { "400": "Wrong or expired code", "401": "Step expired" }) },
    "/auth/register": { post: pub("/auth", "Member self-registration (Personal information + email); emails an activation code, the account stays inactive until activated", { "409": "Username or email already used" }) },
    "/auth/activate": { post: pub("/auth", "Enter the emailed activation code (username + code); activates and signs in", { "400": "Wrong or expired code" }) },
    "/auth/password-code": { post: auth("/auth", "Email the code that confirms a password change (accounts with an email)", undefined, { "429": "Sent less than a minute ago" }) },
    "/auth/forgot-password": { post: pub("/auth", "Email a password reset code") },
    "/auth/verify-otp": { post: pub("/auth", "Check a password reset code", { "401": "Wrong or expired code" }) },
    "/auth/reset-password": { post: pub("/auth", "Set a new password with the reset code", { "401": "Wrong or expired code" }) },
    "/auth/me": { get: auth("/auth", "Current user profile") },
    "/auth/profile": { patch: auth("/auth", "Update own profile or password (password change needs currentPassword)") },
    "/auth/sessions": { get: auth("/auth", "Own signed-in devices (device, network, first and last activity; current marks this device)") },
    "/auth/sessions/code": { post: auth("/auth", "Email the 6-digit code that confirms signing a device out (accounts with an email)") },
    "/auth/sessions/revoke": { post: auth("/auth", "Sign out one device (sessionId) or all other devices (others: true); needs password and, with an email, the code") },

    "/setup/status": { get: pub("/setup", "Whether the first librarian account still has to be created") },
    "/setup/librarian": { post: pub("/setup", "Create the first librarian (only while none is active); answers with the emergency recovery key once", { "201": "Created", "409": "A librarian already exists" }) },
    "/setup/recover": { post: pub("/setup", "Emergency: the recovery key creates a new librarian (active librarians are turned off) and a new key", { "201": "Created", "400": "Invalid recovery key" }) },
    "/setup/recovery-key": {
      get: auth("/setup", "When the current recovery key was made (librarian / admin)"),
      post: auth("/setup", "Make a new recovery key (asks for the password again; the old key stops working)", undefined, { "400": "Wrong password" }),
    },

    "/users": {
      get: auth("/users", "List members (q, memberType, status, limit, offset)", "users:read"),
      post: auth("/users", "Add a member", "users:write", { "201": "Created", "409": "Username or email taken" }),
    },
    "/users/cards": { get: auth("/users", "Library ID cards waiting to be printed (Member ID, grade/section or department)", "users:read") },
    "/users/cards/printed": { post: auth("/users", "Mark cards as printed { ids }", "users:write") },
    "/users/{id}": {
      get: auth("/users", "Member details", "users:read", { "404": "Not found" }),
      patch: auth("/users", "Edit a member", "users:write", { "404": "Not found", "409": "Username or email taken" }),
    },
    "/users/{id}/status": { patch: auth("/users", "Activate or deactivate a member", "users:write", { "404": "Not found" }) },

    "/categories": {
      get: pub("/categories", "List categories (kind: SUBJECT, WATTPAD, GENRE)"),
      post: auth("/categories", "Create category", "categories:write", { "201": "Created", "409": "Duplicate" }),
    },
    "/categories/{id}": {
      get: pub("/categories", "Get category", { "404": "Not found" }),
      patch: auth("/categories", "Update category", "categories:write", { "404": "Not found" }),
      delete: auth("/categories", "Delete category", "categories:write", { "404": "Not found", "409": "In use" }),
    },

    "/catalog": {
      get: pub("/catalog", "List/search books: q, categoryId, available=1, sortBy, sortOrder, limit, offset (hidden books only for staff; hidden=1 lists hidden ones)"),
      post: auth("/catalog", "Add a book (optionally with copies)", "catalog:write", { "201": "Created", "409": "Duplicate ISBN or serial number" }),
    },
    "/catalog/this-week": { get: auth("/catalog", "Books borrowed this school week (Mon-Fri, PH time), top 10 titles with how many times; no borrower details") },
    "/catalog/{id}": {
      get: pub("/catalog", "Book details with availability and rating", { "404": "Not found (or hidden)" }),
      patch: auth("/catalog", "Edit a book, including isHidden", "catalog:write", { "404": "Not found", "409": "Duplicate ISBN or serial number" }),
      delete: auth("/catalog", "Delete a book", "catalog:write", { "404": "Not found", "409": "Has borrowing history" }),
    },
    "/covers/{kind}/{file}": { get: pub("/covers", "Book cover image kept by the school server (kind id|isbn, file <key>-S|M|L.jpg); downloaded once from Open Library, only for books in the catalog", { "404": "No cover" }) },
    "/catalog/{id}/rating": { put: auth("/catalog", "Rate a book 1-5 with an optional written review (member; the review waits for librarian approval)", undefined, { "404": "Not found" }) },
    "/catalog/{id}/reviews": { get: auth("/catalog", "Approved written reviews of a book (first name only)") },
    "/catalog/{id}/watch": {
      put: auth("/catalog", "Notify me when a copy is available (member)", undefined, { "409": "A copy is on the shelf now" }),
      delete: auth("/catalog", "Cancel the availability notification"),
    },
    "/catalog/by-copy/{code}": { get: auth("/catalog", "Find the book of a copy QR label code", undefined, { "404": "Not found" }) },
    "/catalog/wishlist": { get: auth("/catalog", "The member's Wishlist (books waiting for a copy, with availability)") },
    "/catalog/reviews": { get: auth("/catalog", "Written reviews by status (default PENDING) and the pending count", "catalog:write") },
    "/catalog/reviews/{id}": { patch: auth("/catalog", "Approve (APPROVED) or hide (HIDDEN) a written review", "catalog:write", { "404": "Not found" }) },
    "/catalog/{id}/view": { post: auth("/catalog", "Count a member's view of a book") },
    "/catalog/export.xlsx": { get: auth("/catalog", "Download the catalog as Excel", "catalog:write") },
    "/catalog/import-template.xlsx": { get: auth("/catalog", "Download the Excel import template", "catalog:write") },
    "/catalog/import/preview": { post: { ...auth("/catalog", "Upload an .xlsx (raw body, 10 MB) and preview new / changed / not-in-file / error rows", "catalog:write"), requestBody: binary } },
    "/catalog/import/apply": { post: auth("/catalog", "Apply a preview in one transaction { token, hideMissing }", "catalog:write", { "410": "Preview expired or used" }) },

    "/book-copies": {
      get: auth("/book-copies", "List copies", "copies:read"),
      post: auth("/book-copies", "Add a copy (copy code generated when no barcode)", "copies:write", { "201": "Created", "404": "Book not found", "409": "Duplicate barcode" }),
    },
    "/book-copies/summary": { get: auth("/book-copies", "Copy counts by status", "copies:read") },
    "/book-copies/{id}": {
      get: auth("/book-copies", "Copy details", "copies:read", { "404": "Not found" }),
      delete: auth("/book-copies", "Delete a copy", "copies:write", { "404": "Not found", "409": "Has borrowing history" }),
    },
    "/book-copies/{id}/status": { patch: auth("/book-copies", "Change copy status", "copies:write", { "404": "Not found" }) },

    "/circulation/borrow": { post: auth("/circulation", "Lend at the desk: member by borrowerId or memberCode (Member ID), book by bookCopyId, copyCode (QR label) or bookId (first copy on the shelf); 7-day due date, receipt, alert; limit 3", "circulation:write", { "201": "Created", "404": "Copy or borrower not found", "409": "Copy not available" }) },
    "/circulation/return": { post: auth("/circulation", "Record a return (on time, late, damaged, missing) by transactionId or by the scanned copyCode", "circulation:write", { "404": "Not found", "409": "Not active" }) },
    "/circulation/transactions": { get: auth("/circulation", "Borrowing records (members only see their own)") },
    "/circulation/transactions/{id}": { get: auth("/circulation", "Borrowing record details (members only their own)", undefined, { "404": "Not found" }) },

    "/borrow-requests": {
      get: auth("/borrow-requests", "List requests (status filter)", "circulation:read"),
      post: auth("/borrow-requests", "Request to borrow a book (member)", undefined, { "201": "Created", "403": "Members only", "404": "Book not found", "409": "Limit reached, duplicate or no copy available" }),
    },
    "/borrow-requests/mine": { get: auth("/borrow-requests", "My requests (member)") },
    "/borrow-requests/{id}/cancel": { post: auth("/borrow-requests", "Cancel my pending request", undefined, { "404": "Not found", "409": "Already reviewed" }) },
    "/borrow-requests/{id}/hide": { post: auth("/borrow-requests", "Hide a finished request from my history", undefined, { "404": "Not found" }) },
    "/borrow-requests/{id}/approve": { post: auth("/borrow-requests", "Approve: lends a copy and creates the receipt", "circulation:write", { "404": "Not found", "409": "Already reviewed or no copy" }) },
    "/borrow-requests/{id}/reject": { post: auth("/borrow-requests", "Decline with an optional reason", "circulation:write", { "404": "Not found", "409": "Already reviewed" }) },

    "/notifications/mine": { get: auth("/notifications", "My alerts") },
    "/notifications/read-all": { post: auth("/notifications", "Mark all my alerts read") },
    "/notifications/{id}/read": { post: auth("/notifications", "Mark one alert read", undefined, { "404": "Not found" }) },
    "/notifications/{id}": { delete: auth("/notifications", "Delete one of my update alerts", undefined, { "404": "Not found" }) },
    "/notifications/overdue": { post: auth("/notifications", "Send an overdue notice (in-app + email)", "circulation:write", { "201": "Sent", "404": "Not found", "409": "Already returned" }) },
    "/notifications/reminder": { post: auth("/notifications", "Send a return reminder (in-app + email)", "circulation:write", { "201": "Sent", "404": "Not found", "409": "Already returned" }) },

    "/favourites/mine": { get: auth("/favourites", "My favourite books and folders") },
    "/favourites": { post: auth("/favourites", "Add a favourite", undefined, { "201": "Added", "404": "Book not found" }) },
    "/favourites/{bookId}": {
      patch: auth("/favourites", "Move a favourite to a folder", undefined, { "404": "Not found" }),
      delete: auth("/favourites", "Remove a favourite", undefined, { "404": "Not found" }),
    },
    "/favourites/folders": { post: auth("/favourites", "Create a folder", undefined, { "201": "Created", "409": "Duplicate name" }) },
    "/favourites/folders/{id}": { delete: auth("/favourites", "Delete a folder (keeps its books)", undefined, { "404": "Not found" }) },

    "/reports/summary": { get: auth("/reports", "Dashboard totals", "reports:read") },
    "/reports/statistics": { get: auth("/reports", "12-month statistics by role and outcome", "reports:read") },
    "/reports/recent-activity": { get: auth("/reports", "Recent audit log entries", "reports:read") },
    "/reports/copies-by-status": { get: auth("/reports", "Copies by status", "reports:read") },
    "/reports/inventory": { get: auth("/reports", "Inventory list", "reports:read") },
    "/reports/circulation": { get: auth("/reports", "Borrowing records in a date range", "reports:read") },
    "/reports/popular-books": { get: auth("/reports", "Most borrowed books", "reports:read") },
    "/reports/overdue": { get: auth("/reports", "Overdue borrowed books", "reports:read") },
    "/reports/this-week": { get: auth("/reports", "Books used this school week (Monday-Friday, PH time; ?day= any day of the week): borrowed/returned/visits per day, titles", "reports:read") },
    "/reports/export.xlsx": { get: auth("/reports", "All report lists as one Excel file (from, to)", "reports:read") },

    "/backup/download": { post: auth("/backup", "Download a full database backup (.sql.gz, optional password -> .sql.gz.enc); body { currentPassword, password? }", "backup:manage") },
    "/inventory/audits": {
      get: auth("/inventory", "Recent inventory audits", "copies:read"),
      post: auth("/inventory", "Start an inventory audit (one at a time)", "copies:write", { "201": "Started", "409": "One is already in progress" }),
    },
    "/inventory/audits/{id}": { get: auth("/inventory", "Audit report: scanned, not found, records to check", "copies:read", { "404": "Not found" }) },
    "/inventory/audits/{id}/scan": { post: auth("/inventory", "Record a scanned copy code { code }", "copies:write", { "404": "Audit or copy not found", "409": "Audit closed" }) },
    "/inventory/audits/{id}/close": { post: auth("/inventory", "Close the audit", "copies:write", { "404": "Not found", "409": "Already closed" }) },
    "/inventory/audits/{id}/export.xlsx": { get: auth("/inventory", "Audit report as Excel", "copies:read", { "404": "Not found" }) },
    "/visits/kiosk/start": { post: auth("/visits", "Start the Visitor's Log kiosk: returns a token that can only record visits (12 h)", "circulation:write") },
    "/visits/kiosk/exit": { post: auth("/visits", "Leave the kiosk with the librarian's password { password }; returns a normal token", "visits:kiosk") },
    "/visits/scan": { post: auth("/visits", "Kiosk scan { memberCode, at? }: first scan of the PH day = Time In, next = Time Out; repeats within 1 min ignored", "visits:kiosk", { "404": "Unknown Member ID", "409": "Deactivated" }) },
    "/visits/today": { get: auth("/visits", "Today's visits for the kiosk screen (Member ID and times only)", "visits:kiosk") },
    "/visits/kiosk/qr": { get: auth("/visits", "QR code for phone check-in; changes every 30 s and expires after 60 s", "visits:kiosk") },
    "/visits/phone": { post: auth("/visits", "Member app check-in by scanning the kiosk QR { code }", undefined, { "403": "Members only" }) },
    "/time/usage": { post: auth("/time", "Add app time { platform: mobile|web|desktop, days: [{ day, seconds }] } (today and the 7 days before; at most 24 h a day)") },
    "/time/me": { get: auth("/time", "My Time Spent: app time (7 days, total), library visits (from the Visitor's Log), how long borrowed books were kept") },
    "/time/members/{id}": { get: auth("/time", "A member's Time Spent", "users:read") },
    "/time/summary": { get: auth("/time", "Time Spent report for from/to (YYYY-MM-DD): app time of members and librarians, library visits, average loan length", "reports:read") },
    "/suggestions": {
      get: auth("/suggestions", "Suggestion Box for the librarian (status, kind filters; waiting = still NEW)", "circulation:read"),
      post: auth("/suggestions", "Member sends a book suggestion or feedback { kind: BOOK|FEEDBACK, title, author?, message? } (5 a day)", undefined, { "201": "Sent", "403": "Members only", "429": "Daily limit reached" }),
    },
    "/suggestions/mine": { get: auth("/suggestions", "My suggestions with the librarian's answers") },
    "/suggestions/{id}": { patch: auth("/suggestions", "Answer { status: NEW|PLANNED|DONE|DECLINED, reply? }; the member gets an alert", "circulation:write", { "404": "Not found" }) },
    "/system/status": { get: auth("/system", "Database, Redis, email and backup status (no secrets)", "backup:manage") },
    "/backup/files": { get: auth("/backup", "Backups saved on the server", "backup:manage") },
    "/backup/files/{name}/download": { post: auth("/backup", "Download a server backup; body { currentPassword }", "backup:manage", { "404": "Not found" }) },
    "/backup/files/{name}/restore": { post: auth("/backup", "Restore a server backup; body { currentPassword, confirm: RESTORE, backupPassword? }", "backup:manage", { "404": "Not found", "409": "Restore already running" }) },
    "/backup/restore": { post: { ...auth("/backup", "Restore an uploaded backup (raw body, 200 MB); headers X-Current-Password, X-Confirm: RESTORE, X-Backup-Password", "backup:manage", { "409": "Restore already running" }), requestBody: binary } },
  },
};
