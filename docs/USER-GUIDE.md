# AklatOne user guide

Short step-by-step guides for the librarian and for members. Setup and installation are in the
[README](../README.md); going live is in [DEPLOYMENT.md](DEPLOYMENT.md).

## For the librarian

### First day
1. **Create the librarian account.** Open the Staff Web Portal (or the Desktop app). The first visit shows
   *Set up the librarian account*: name, position, department, email and a strong password. From then on you sign
   in with that email, the password and the 6-digit code sent to the email. Setup then shows the **emergency
   recovery key** once: print it (or write it down) and give it to the principal or the ICT coordinator. You can make
   a new one any time in **Settings > Emergency recovery key** (the old one stops working).
2. **Add the books.**
   - One by one: **Catalog > Add book** (title, author, ISBN or serial number, book type, grade level, date received,
     shelf location, subject / genre / Wattpad category,
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
| Lend, receive or add books with your phone | In the AklatOne app choose **Librarian**, then sign in: **Lend** (scan card + book), **Return** (scan the book), **Add book** (Android: take a photo of the cover / title page and the copyright page; the title, author, publisher, year and ISBN are typed in for you; check them, then Save) |
| Lost the librarian password **and** email | Staff sign-in > **Can't access the librarian account?** > enter the recovery key and the new librarian's details. The old account is turned off and gets an alert email; a new recovery key is shown (print it). No key either? The ICT coordinator runs `docker compose exec api node scripts/reopen-librarian-setup.mjs --yes` on the server, then the first-time setup opens again. |
| Library attendance | **Visitor's Log > Start**: the screen becomes a kiosk. Members scan their card, type their Member ID, or scan the screen with their app. To leave the kiosk, enter your password. |
| Answer suggestions; approve or hide book reviews | **Suggestions** (red number = new suggestions + reviews waiting) |
| Check the shelves | **Catalog > Inventory audit** > Start, scan every copy on the shelves, then read *Not found* and *Records to check* |
| Find anything | **Search AklatOne** at the top of the side menu (or **Ctrl+K**): pages, books, members (by Member ID) and borrowed books in one box; tap a filter (Books, Members, Borrowed) to narrow it. Every list page also has its own search box and filters. |
| Print a receipt or the recovery key | **Print preview** shows the paper first; **Print** then sends only that paper (choose a printer or *Save as PDF*). |
| Reports and printouts | **Reports** (date range, time spent, Excel export) and **Printing** (inventory, borrowed, overdue, member lists with signatories) |

### Desktop app without internet
The Desktop app keeps working offline: new books, copies, members, lending, returns and notices are saved on the
computer (the sidebar shows *System Offline*). When the internet is back, open **Upload** and send them. Items that
someone else changed in the meantime are skipped and show the reason, so nothing is overwritten by mistake.

### Safety
- **Settings > Backup and Restore**: download a backup now and then (optionally with a password). The server also
  makes one every night. Restoring replaces all data; a safety copy is saved first.
- **Settings > System status** shows whether the database, email and automatic backups are working.
- **Settings > Sign-in devices** lists every device signed in to your account; sign out one you do not know
  (your password and an emailed code are asked). You also get an email when your account is used on a new device.
- Forgot only the password? Staff sign-in > **Forgot password?** sends a code to the librarian email.
- Never share the librarian password or the recovery key. If something looks wrong, follow [SECURITY.md](../SECURITY.md).
- Every account needs an email (sign-in codes go there). An older account without one is asked to add and confirm
  an email at its next sign-in. Changing a password also asks for a code sent to the email.

## For students and teachers

### With the AklatOne app
1. **Install:** scan the *Get the AklatOne library app* poster, or ask the librarian. On Android, allow
   *Install unknown apps* if asked.
2. **New here?** Tap **Create an account** (choose a username that is **not** your real name) and fill in your details (full name, username, email, Student or
   Teacher, gender, grade and section or department, hobbies) and a password. Choose Student or Teacher carefully:
   it is set once; to change it later, ask the librarian. Enter the **activation code** sent to your email; your
   account then works and gets its Member ID. (The librarian can also make the account for you.)
3. **Sign in**: choose **Member**, enter your username and password, then the 6-digit code sent to your email. The app asks you to sign
   in **every time it is opened**. To change your password: **Profile > Settings > Change password**; a code is
   emailed to confirm it.
4. **Find a book:** **Catalog** (search, filters, *Available now only*), then **Request to borrow**. You may have up
   to 8 books (borrowed + requested) for 7 days each.
5. **My Books:** borrowed books with due dates, requests, favourites and history; tap a loan for its receipt.
6. **Alerts:** approvals, reminders, overdue notices and answers to your suggestions.
7. **Visit Log:** at the library door, tap **Visit Log** and scan the QR code on the kiosk screen (or type its
   6-digit code). First scan of the day = Time In, the next = Time Out.
8. **Suggestion Box:** suggest a book or send feedback (Home > Suggest).
9. **Is someone else using my account?** **Profile > Settings > Sign-in devices** shows every device signed in;
   sign out one you do not know and change your password. You get an email when a new device signs in.
10. **Connection lost?** While you are signed in, the app still shows your saved catalog, books and receipts;
    signing in and borrowing need the internet.
11. **All copies borrowed?** Tap **Notify me when available** on the book, or **press and hold the heart** and choose
    **Add to Wishlist**; you get an alert (and an email) when a copy is back. It is not a reservation: whoever
    requests first gets it. Holding the heart also saves a book straight to one of your folders.
    Your Wishlist is in **My Books > Favourites > Wishlist**.
12. **Reviews:** after borrowing a book, rate it and write a short review. Others see it after the librarian approves it.
13. **Reading goal:** **Profile > Activity > Reading goal** sets how many books you want to borrow this month.
14. **Scan book QR:** in the library, **Catalog > Scan book QR** and scan the label on a book to see its details.

### Without a phone
Your **Library ID card** is enough: show it at the desk to borrow and return books, and scan it at the Visitor's
Log kiosk (or type the Member ID on the card). Everything is recorded in the system the same way. Forgot your
password? Use **Forgot password** in the app (needs your email) or ask the librarian.
