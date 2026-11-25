# AklatOne: paste-ready manuscript text (system parts)

Updated 2026-11-25 from the built system (source code, not plans). Everything below Part 1 can be pasted
into the manuscript as is. Keep this file current: when a feature changes, update the matching paragraph.

**Part 1. Notes for the team (do not paste)**
- Not built, so not mentioned below: book type (textbook, teacher's manual, worksheet), grade level of a book,
  date received and copy location in the screens. Add them here only if they are built.
- Loan policy in the text: 7 days per book, up to 8 books per member (developer decision 2026-11-25).
- Privacy Policy and Terms in the app are still drafts.
- Real-device testing (Android phone, iPhone, Windows school computer) is still pending; do not claim it in Chapter 4 until done.
- Diagrams for the same features: docs/diagrams/png (Flowcharts 1-5, DFD Level 0-2, ERD).

---

## Part 2. Project Description (system overview)

AklatOne is a library management system developed for the library of Tagumpay National High School (School ID
308114). It replaces manual logbooks and lists with one central database that is used through three
applications: a mobile application for students and teachers, a staff web portal, and a staff desktop
application for the librarian. The three applications are built from one shared code base and connect to the same
central server, so a book borrowed at the library desk, a request approved on the web portal and a record viewed
on a student's phone always refer to the same data.

Students and teachers use the AklatOne mobile application (Android and iOS) to search the library catalog, see
which books are available, send borrow requests, keep their receipts and borrowing history, receive due-date
reminders and overdue notices, record their library visits, and send book suggestions or feedback. The librarian
manages the catalog, the physical copies of each book, members, lending and returns, reports, printouts, the
library Visitor's Log and database backups through the staff web portal or the desktop application. The desktop
application can keep working without internet and uploads the saved entries when the connection returns. When a
librarian signs in to the mobile application, it switches to a librarian mode that uses the phone camera to scan
Library ID cards and book QR labels for lending and returns.

## Part 3. General Features of the System

| Feature | Purpose |
|---|---|
| Catalog and copy management | Record each title's details (title, author, ISBN, publisher, publication year, serial number, subject, genre or Wattpad category, description and cover) and each physical copy, identified by a copy code printed as a QR label. |
| Member and Library ID management | Create student and teacher accounts, give each member a unique Member ID, and print Library ID cards that carry only the Member ID, a QR code and the grade and section (or department). |
| Search and availability | Let students and teachers search and filter the catalog and see how many copies are available, without showing who borrowed them. |
| Circulation | Handle borrow requests, librarian approval or decline, lending at the desk by scanning the Library ID card and the book's QR label, digital receipts, due dates (7 days, up to 8 books per member), reminders, overdue notices and returns with the book's condition. |
| Visitor's Log | Record each member's Time In and Time Out in the library through a kiosk screen, by scanning the Library ID card, typing the Member ID, or scanning the kiosk's QR code with the mobile application. |
| Inventory verification | Verify the copies on the shelves through a QR-based inventory audit and list the copies that were not found or whose records need checking. |
| Reports and monitoring | Provide dashboard statistics, books used this week, borrowing reports and statistics, time spent in the library and in the application, overdue lists, Excel exports and printable lists with the school header and signatories. |
| Feedback and school publications | Collect book suggestions and feedback from members through a Suggestion Box and link the school's student publications. |
| Offline operation | Let the desktop application work without internet and upload saved entries later, and let the mobile application show the saved catalog, loans and receipts while offline. |
| Access and record protection | Protect records through role-based access, encrypted passwords, a second sign-in factor by email code, session control, input validation, audit logs, encrypted backups and restore. |

## Part 4. Core Features of the System

**Mobile Application for students and teachers (Android and iOS)**
1. Account access with username or email and password, a 6-digit email verification code as the second factor, and password reset by email code. Accounts are created by the librarian.
2. First-launch walkthrough and acceptance of the Terms and Conditions, Privacy Policy and essential on-device storage.
3. Catalog search with subject, genre and Wattpad categories, filters (available now, sort), book covers, details, ratings and available copies.
4. Borrow requests within the borrowing limit, request status, digital receipts and due dates.
5. My Books: borrowed books, pending requests, favourites in folders and borrowing history.
6. Alerts for approved or declined requests, books lent at the desk, recorded returns, due-soon reminders, overdue notices and answered suggestions.
7. Visit Log: Time In and Time Out by scanning the QR code on the library's Visitor's Log screen or typing its 6-digit code.
8. Suggestion Box for book suggestions and feedback, and links to the school publications The Victor and Masid.
9. Profile with Member ID, role-specific details, statistics (time in the application, time in the library, books borrowed and days kept), light and dark theme, and settings.
10. Offline viewing of the saved catalog, loans and receipts when there is no connection.

**Librarian mode of the mobile application**
1. Lending: scan the member's Library ID card with the phone camera, then the book's QR label; the system checks the borrowing limit and issues the receipt.
2. Returns: scan the book's QR label and record its condition (good, damaged or torn, missing).

**Staff Web Portal for the librarian and administrator**
1. Dashboard with total books, members, borrowed books, books due this week, books used this week (Monday to Friday), recent activities and quick actions.
2. Catalog management of titles and copies, with copy status, covers, Excel import and export, and hiding titles from members.
3. Borrowing: lending at the desk by scanning or searching, approval or decline of member requests, tracking of borrowed books, return recording with condition, and overdue notices and reminders by app alert and email.
4. Members: adding, editing, deactivating and viewing students and teachers, their Member IDs, borrowing tallies and time spent.
5. Visitor's Log: starts a full-screen kiosk that records Time In and Time Out; leaving the kiosk requires the librarian's password.
6. Inventory audit with printable QR labels and scanning by camera or barcode scanner.
7. Suggestions from members, answered with a status and reply.
8. Reports and statistics for a date range, including time spent, with Excel export.
9. Printing of inventory, borrowed-book, overdue and member lists, copy QR labels and Library ID cards with the school header and editable signatories.
10. Settings for the librarian's profile, password, theme, system status, and database backup and restore; automatic sign-out after 30 idle minutes.

**Staff Desktop Application (Windows and Linux)**
1. After sign-in, the librarian chooses between the Visitor's Log kiosk and the AklatOne library system for that computer.
2. The same functions as the Staff Web Portal in an installable application with its own window controls.
3. Offline operation: books, copies, members, lending, returns and notices entered without internet are saved on the computer and uploaded later in order; entries changed by someone else or rejected by the server are kept with the reason.
4. Kiosk scans made offline are saved and sent automatically when the connection returns.
5. A System Online / System Offline indicator; the sign-in token and saved passwords are kept in the computer's protected credential store.

**Central Server and Database**
1. One backend and MariaDB database shared by all applications, so every record stays consistent.
2. Role-based permissions checked against the database on every request, audit records of staff actions and sign-ins, and automated tests of access restrictions.
3. Email delivery of verification codes, welcome messages, password-change alerts, borrow approvals, desk loans, returns and library notices.
4. Scheduled jobs: daily encrypted database backup and due-soon reminders the day before a book is due.

## Part 5. Scope and Limitations (system part)

AklatOne covers the cataloging of books and their physical copies, member accounts and Library ID cards, borrowing
by request or at the library desk, returns with the condition of the book, reminders and overdue notices, the
library Visitor's Log, inventory verification, reports, printouts, member suggestions, and database backup and
restore. Students and teachers use the mobile application; the librarian uses the staff web portal, the desktop
application or the librarian mode of the mobile application. All applications share one central server and
database.

The system has the following limitations. Each member may borrow up to eight (8) books at a time for seven (7) days
per book; renewals, reservations and fines are not included. Members cannot create their own accounts; the
librarian creates them. The 6-digit sign-in and password-reset codes require the member to have an email address
and the server to have a working email account. Book covers are retrieved from Open Library only for books with an
ISBN; DepEd textbooks without an ISBN show a title card instead. Borrowing, requests and other changes from the
mobile application require an internet connection; offline, it only shows saved records. The desktop application
works offline, but signing in and starting the Visitor's Log require a connection to the server. Camera scanning
on Linux computers may be unavailable, in which case a barcode scanner or typing is used. The iOS version must be
built and signed on a Mac with an Apple Developer account.

## Part 6. Technologies Used

**Frontend (one code base for the web, desktop and mobile applications)**
- TypeScript 6 and React 19, built with Vite 8 and styled with Tailwind CSS 4.
- React Router 7 for navigation and TanStack Query 5 for server data and caching; Lucide icons.
- Staff Web Portal: Progressive Web App served by nginx.
- Desktop application: Tauri 2 (Rust and the system WebView: Microsoft Edge WebView2 on Windows, WebKitGTK on Linux); keyring for the operating system's credential store.
- Mobile application: Capacitor 8 for Android and iOS, with secure storage in the Android Keystore and iOS Keychain.
- qrcode and jsQR for generating and reading QR codes; the device camera through the browser's media API.

**Backend**
- Node.js 24 with TypeScript and Express 5, organized as a modular monolith (one module per library function).
- Prisma 7 ORM with MariaDB 10.11; Redis 7 for shared rate-limit counters (optional).
- Zod for input validation, JSON Web Tokens for sessions, bcrypt for password hashing, Helmet for secure HTTP headers and express-rate-limit for request limits.
- Nodemailer for email, ExcelJS for Excel import and export, pino for logging, and OpenAPI (Swagger UI) for the API documentation.

**Deployment and development tools**
- Docker and Docker Compose (MariaDB, Redis, API, nginx web server and the Caddy HTTPS proxy with automatic Let's Encrypt certificates).
- GitHub Actions for continuous integration (tests and builds for the backend, web, Windows and Linux desktop, Android and iOS) and for signed release builds.
- Vitest and Supertest for automated tests; ESLint for code quality; draw.io for the diagrams.

## Part 7. Security Features

1. Role-based access control for Administrator, Librarian and Member, checked on the server for every request.
2. Passwords hashed with bcrypt and a strong-password rule enforced by the server.
3. Two-factor sign-in: password plus a 6-digit code sent by email; codes are random, valid for 10 minutes and stored only as a hash.
4. Session control: sessions end immediately when an account is deactivated or its password changes; staff web sessions end after 30 idle minutes. Every user can see the devices signed in to their account and sign one out after confirming their password and an emailed code, and receives an email when a new device signs in.
5. Limits on failed sign-ins, wrong codes and request rates, counted per account so students on the same school Wi-Fi do not block each other.
6. Sign-in screens and password reset do not reveal whether an account exists.
7. Input validation on every request, secure HTTP headers and a Content Security Policy on the web and desktop applications.
8. Encrypted connections (HTTPS) between the applications and the server; the released mobile application refuses unencrypted connections.
9. Least-privilege database account for the running server (it can read and write records but cannot change or drop tables).
10. Audit log of staff actions and sign-ins.
11. Daily encrypted database backups kept on the server, which can be copied automatically to another machine, and a restore that first saves a safety copy.
12. Library ID cards and the Visitor's Log show only the Member ID, not the member's name or other personal details, in line with the Data Privacy Act of 2012 (RA 10173).

## Part 8. Platforms and Requirements

| Application | Users | Runs on |
|---|---|---|
| Mobile application | Students, teachers (and the librarian in librarian mode) | Android 8.0 or newer (2 GB RAM, rear camera); iOS / iPadOS 16.4 or newer |
| Staff Web Portal | Librarian, administrator | Chrome or Edge 111+, Firefox 128+, Safari 16.4+ |
| Staff Desktop Application | Librarian (also the Visitor's Log kiosk) | Windows 10 or 11, Linux 64-bit; dual-core CPU, 4 GB RAM (recommended: Core i3 11th gen, 8 GB RAM, SSD) |
| Central server | (hosts the system) | One Linux server or VPS with Docker: 2 vCPU / 4 GB RAM / 40 GB SSD minimum, 4 vCPU / 8 GB / 80 GB recommended; a domain name for HTTPS |
