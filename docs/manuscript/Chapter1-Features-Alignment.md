# AklatOne: Chapter 1 Features vs. the Built System

Checked on 2026-11-20 against the source code (Prisma schema, backend routes, web/desktop/mobile screens); updated 2026-11-25 (book type, grade level, date received, copy location built) and 2026-11-24 after backup/restore, Excel import, QR inventory audit and the security hardening were built.
Chapter 1 has a "General Features of the System" table only; there is no "Core Features" section yet.
Part B below proposes both, written to match what the system actually does.

## A. Alignment check (for the team, not for pasting)

| Chapter 1 General Feature | Status | What the system does today |
|---|---|---|
| Catalog and copy management | Aligned | Title, author, ISBN, publisher, publication year, serial number, **book type** (Textbook, Teacher's Manual, Worksheet, Other), **grade level** (Grade 7 to 12 or all), description, categories (Subject / Wattpad / Genre) and individual copies (auto copy code, shown as "Copy 1, 2…" under the ISBN) with their **date received** and **shelf location**, editable per copy. "Learning area" is covered by the Subject category. Members filter the catalog by grade level and book type. |
| Inventory verification | Aligned | Inventory audit: printable QR label per copy, scanning by USB scanner, camera or typed code, report of copies not found and of scanned copies whose record disagrees, Excel export. Each copy shows "Verified <date>" or "Not verified" (`BookCopy.lastVerifiedAt`). Condition: copy status (Available, Borrowed, Lost, Damaged, Retired) and return outcome. Each copy's shelf location is kept and editable (Catalog > Copies). |
| Search and availability | Aligned | Mobile catalog search and filters (category, available now, sort), book covers, available / total copies, ratings; borrower details are never shown in the catalog. |
| Circulation | Aligned | Member borrow request → librarian approve / decline → receipt and due date → due-soon / overdue notices (app + email) → return with outcome. Eligibility = an available copy and at most 8 books (active loans + pending requests); loan = 7 days (developer decision 2026-11-25; the historical policy was 3 or 5 days). |
| Reports and history | Aligned | Dashboard statistics, Reports (date range, monthly statistics, borrowers by role, return outcomes, popular books, copies by status, overdue list), member and staff transaction history, printable lists (inventory, borrowed, overdue, members, copy QR labels) with School ID 308114 and signatories, Excel export of reports and of the catalog, Excel import of old catalog records with a preview. |
| Access and record protection | Aligned | Role-based access (Admin, Librarian, Member), JWT sessions checked against the database on every request (deactivated accounts and changed passwords end all sessions at once), 30-minute idle sign-out on the staff web portal, bcrypt password hashing, email one-time code at sign-in, sign-in lockout and rate limiting, input validation, audit log incl. sign-ins, in-app **backup and restore** (optionally password-encrypted, daily automatic copy, safety copy before each restore), rows-only database account for the server in production, automated tests (118 backend tests incl. unauthorized-access checks). |

Other Chapter 1 / Chapter 3 statements that no longer match:

1. **Scope** says the responsive web interface is the primary access point and Desktop / Android are "subject to verification". Now: students and teachers use the **Android app**; the librarian uses the **staff web portal** or the **desktop app**. All three are built and share one server and database.
2. **Scope** lists reservations and reminders as optional. Both are built: borrow requests (librarian approval), automatic due-soon reminders and librarian overdue notices. QR labels and scanning are built for the inventory audit.
3. **3.10 Software Requirements**: password hashing is **bcrypt** (confirmed in code, Argon2id is not used). Desktop offline saving and upload **is** built (outbox on the computer; rejected items are skipped and shown). Playwright is **not installed**; testing uses Vitest and Supertest.
4. Built but not mentioned anywhere: email one-time code at sign-in, password reset by email, member management by the librarian, favourites and ratings, in-app alerts and branded emails, first-launch walkthrough with Terms / Privacy consent, light and dark theme. Email codes still need school confirmation. Google sign-in and member self-registration were removed on 2026-11-24 (accounts are made by the librarian).

**Done 2026-11-25:** option (a): book type, grade level, date received and copy location are now built, so the manuscript's General Features stand as written. Square brackets in Part B no longer need deleting.

## B. Paste-ready text

### General Features of the System

| Feature | Purpose |
|---|---|
| Catalog and copy management | Aligned | Title, author, ISBN, publisher, publication year, serial number, **book type** (Textbook, Teacher's Manual, Worksheet, Other), **grade level** (Grade 7 to 12 or all), description, categories (Subject / Wattpad / Genre) and individual copies (auto copy code, shown as "Copy 1, 2…" under the ISBN) with their **date received** and **shelf location**, editable per copy. "Learning area" is covered by the Subject category. Members filter the catalog by grade level and book type. |
| Copy condition and status monitoring | Track whether each copy is available, borrowed, lost, damaged or retired, record the condition of returned books (returned on time, returned late, torn or damaged, or missing), and verify the copies on the shelves through a QR-based inventory audit. |
| Search and availability | Let students and teachers search and filter the approved catalog and see how many copies are available, without exposing borrower details. |
| Circulation | Handle borrow requests, librarian approval or decline, digital receipts, due dates, due-soon and overdue notices, and returns, under borrowing limits and loan periods set by the school. |
| Reports and history | Provide dashboard statistics, filtered borrowing reports, monthly statistics, overdue lists, transaction histories and printable inventory, borrowing, overdue and member lists. |
| Access and record protection | Protect records through role-based access for administrators, librarians and members, encrypted passwords, email verification codes at sign-in, automatic sign-out, input validation, an audit log of staff actions and sign-ins, tested access restrictions, and in-system backup and restore of the database. |

### Core Features of the System

**Member Mobile Application (Android) for students and teachers**
1. Account access: sign-in with username or email and password, email verification code, password reset by email. Accounts are created by the librarian.
2. First-launch walkthrough and acceptance of the Terms and Conditions, Privacy Policy and essential storage.
3. Catalog search with subject, Wattpad and genre categories, book details and available copies.
4. Borrow requests with a borrowing limit, request status, digital receipt and due date.
5. My Books: borrowed books, pending requests, favourites in folders and borrowing history.
6. Alerts for approved or declined requests, recorded returns, due-soon reminders and overdue notices.
7. Profile with role-specific details (grade and section for students; department and position for teachers), borrowing statistics, light and dark theme, and settings.

**Staff Web Portal for the librarian and administrator**
1. Dashboard with total books, total members, currently borrowed books, books due this week, recent activities and quick actions.
2. Catalog management of titles and their physical copies, including copy status, Excel import and export, and hiding titles from members.
3. Inventory audit with printable QR labels and scanning by barcode scanner or camera, listing the copies that were not found.
4. Borrowing management: approval or decline of requests, tracking of borrowed books, return recording with condition, and overdue notices and reminders sent in the app and by email.
5. Member management: adding, editing, deactivating and viewing student and teacher accounts and their borrowing records.
6. Reports and statistics for a selected date range, with Excel export.
7. Printing of inventory, borrowed-book, overdue and member lists and copy QR labels with the school header and editable signatories.
8. Settings for the librarian's profile, password, theme, system status, and database backup and restore.

**Staff Desktop Application**
1. The same functions as the Staff Web Portal in an installable application with its own window controls.
2. Offline operation: catalog, copy, member, return and notice entries made without internet are saved on the computer.
3. Upload of saved entries once the connection returns; entries the server rejects are kept with the reason for correction.
4. A System Online / System Offline indicator.

**Central Server and Database**
1. One backend and MariaDB database shared by the three applications, so all records stay consistent.
2. Role-based permissions checked on every request, audit records of staff actions and automated tests of access restrictions.
3. Email delivery of verification codes, welcome messages, password-change alerts, borrow approvals, returns and library notices.
4. Daily automatic database backup and due-soon reminders.

### Suggested replacement sentences

- **Scope and Limitations (first paragraph, last two sentences):** "Students and teachers access the approved catalog and their borrowing records through the AklatOne Android application, while authorized personnel manage records through the staff web portal or the desktop application. The three applications share one central server and database."
- **Scope and Limitations (optional features):** "Borrow requests with librarian approval and automatic due-date reminders are included. QR codes are used for copy labels and the inventory audit; borrowing itself does not require scanning."
- **3.10 Security:** "Passwords are hashed with bcrypt; authenticated requests use JSON Web Tokens and role-based access control."
- **3.10 Additional clients:** "The desktop application keeps entries made without internet on the computer and uploads them when the connection returns; entries the server rejects are kept with the reason for correction."
- **3.10 Development tools:** remove Playwright, or state that browser workflow testing with Playwright is planned.
