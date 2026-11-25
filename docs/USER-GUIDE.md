# AklatOne user guide

Short step-by-step guides for the librarian and for members. Setup and installation are in the
[README](../README.md); going live is in [DEPLOYMENT.md](DEPLOYMENT.md).

## For the librarian

### First day
1. **Create the librarian account.** Open the Staff Web Portal (or the Desktop app). The first visit shows
   *Set up the librarian account*: name, position, department, email and a strong password. From then on you sign
   in with that email, the password and the 6-digit code sent to the email.
2. **Add the books.**
   - One by one: **Catalog > Add book** (title, author, ISBN or serial number, subject / genre / Wattpad category,
     number of copies). Each copy gets its own code automatically.
   - Many at once: **Catalog > Import Excel** > download the template, fill it in, upload, check the preview
     (New / Changed / Errors), then **Apply**.
3. **Label the copies.** **Printing > Copy QR labels** > Print, then stick each label on its book.
4. **Add the members.** **Members > Add**: role (Student or Teacher), name, grade and section (students) or
   department (teachers), an email if they have one, and a first password. Each member gets a Member ID.
5. **Print the Library ID cards.** **Printing > Library ID cards** > Print > confirm *Yes, mark as printed*.
   Cards show only the Member ID, its QR code and the grade and section: no name or personal details.
6. **Invite members to the app.** **Printing > Mobile app QR** prints a poster; members scan it to install the app.

### Every day
| Task | Where |
|---|---|
| Lend a book at the desk | **Borrowing > Lend a book**: scan the member's card, then the book's QR label (or search the catalog). The receipt and due date (7 days) appear; the member gets an alert and email. Limit: 8 books per member. |
| Approve or decline app requests | **Borrowing > Borrow Requests** (the red number on the menu shows how many are waiting) |
| Receive a returned book | **Borrowing > Borrowed Books** > Return, and choose its condition (on time / late is decided by the due date; or damaged / missing) |
| Remind or warn a member | **Borrowing > Borrowed Books** > Reminder / Overdue notice (app alert + email). A reminder is also sent automatically the day before the due date. |
| Lend or receive with your phone | Sign in to the AklatOne app with the librarian account: it opens **librarian mode** (scan card + book, or scan the returned book) |
| Library attendance | **Visitor's Log > Start**: the screen becomes a kiosk. Members scan their card, type their Member ID, or scan the screen with their app. To leave the kiosk, enter your password. |
| Answer suggestions | **Suggestions** (red number = new) |
| Check the shelves | **Catalog > Inventory audit** > Start, scan every copy on the shelves, then read *Not found* and *Records to check* |
| Reports and printouts | **Reports** (date range, time spent, Excel export) and **Printing** (inventory, borrowed, overdue, member lists with signatories) |

### Desktop app without internet
The Desktop app keeps working offline: new books, copies, members, lending, returns and notices are saved on the
computer (the sidebar shows *System Offline*). When the internet is back, open **Upload** and send them. Items that
someone else changed in the meantime are skipped and show the reason, so nothing is overwritten by mistake.

### Safety
- **Settings > Backup and Restore**: download a backup now and then (optionally with a password). The server also
  makes one every night. Restoring replaces all data; a safety copy is saved first.
- **Settings > System status** shows whether the database, email and automatic backups are working.
- Never share the librarian password. If something looks wrong, follow [SECURITY.md](../SECURITY.md).

## For students and teachers

### With the AklatOne app
1. **Install:** scan the *Get the AklatOne library app* poster, or ask the librarian. On Android, allow
   *Install unknown apps* if asked.
2. **Sign in** with the username (or email) and password the librarian gave you. If your account has an email,
   enter the 6-digit code sent there. Then change your password: **Profile > Settings > Change password**.
3. **Find a book:** **Catalog** (search, filters, *Available now only*), then **Request to borrow**. You may have up
   to 8 books (borrowed + requested) for 7 days each.
4. **My Books:** borrowed books with due dates, requests, favourites and history; tap a loan for its receipt.
5. **Alerts:** approvals, reminders, overdue notices and answers to your suggestions.
6. **Visit Log:** at the library door, tap **Visit Log** and scan the QR code on the kiosk screen (or type its
   6-digit code). First scan of the day = Time In, the next = Time Out.
7. **Suggestion Box:** suggest a book or send feedback (Home > Suggest).
8. **No connection?** The app still shows your saved catalog, loans and receipts; borrowing needs the internet.

### Without a phone
Your **Library ID card** is enough: show it at the desk to borrow and return books, and scan it at the Visitor's
Log kiosk (or type the Member ID on the card). Everything is recorded in the system the same way. Forgot your
password? Use **Forgot password** in the app (needs your email) or ask the librarian.
