#!/usr/bin/env python3
"""
Generates the AklatOne manuscript diagrams (draw.io): Flowcharts 1-5 and DFD Level 0, 1 and 2.
The ERD (AklatOne-ERD.drawio) is edited by hand and is not touched here.

Run:   python3 docs/diagrams/generate_diagrams.py
PNG:   see export_png() at the bottom (flatpak draw.io; output must be inside the home folder).
Update the lists below when a flow changes, then run again.
"""
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent

# ---------- shared drawing helpers ----------
STYLE = {
    "terminal": "rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#1E326D;fontColor=#FFFFFF;strokeColor=#1E326D;fontStyle=1;fontSize=12;",
    "process": "rounded=0;whiteSpace=wrap;html=1;fillColor=#EAF0FF;strokeColor=#3354B5;fontSize=12;",
    "io": "shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size=18;whiteSpace=wrap;html=1;fillColor=#EEFBF2;strokeColor=#15803D;fontSize=12;",
    "decision": "rhombus;whiteSpace=wrap;html=1;fillColor=#FFFBEB;strokeColor=#B45309;fontSize=11;",
    "ref": "rounded=1;whiteSpace=wrap;html=1;fillColor=#F1F5F9;strokeColor=#64748B;dashed=1;fontSize=12;fontStyle=2;",
    "note": "text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontSize=11;fontColor=#475569;",
    "title": "text;html=1;align=left;verticalAlign=middle;fontSize=18;fontStyle=1;fontColor=#1E326D;",
    "entity": "rounded=0;whiteSpace=wrap;html=1;fillColor=#1E326D;fontColor=#FFFFFF;strokeColor=#1E326D;fontStyle=1;fontSize=12;shadow=1;",
    "dfdproc": "rounded=1;arcSize=12;whiteSpace=wrap;html=1;fillColor=#EAF0FF;strokeColor=#3354B5;strokeWidth=2;fontSize=12;verticalAlign=top;spacingTop=8;",
    "store": "shape=partialRectangle;right=0;whiteSpace=wrap;html=1;fillColor=#F8FAFF;strokeColor=#1E326D;align=left;spacingLeft=10;fontSize=11;",
    "system": "rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=#EAF0FF;strokeColor=#1E326D;strokeWidth=3;fontSize=16;fontStyle=1;",
    "rowlabel": "rounded=1;whiteSpace=wrap;html=1;fillColor=#1E326D;fontColor=#FFFFFF;strokeColor=#1E326D;fontSize=12;fontStyle=1;",
}
EDGE = "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;endArrow=block;endFill=1;endSize=6;strokeColor=#5B6478;fontSize=10;fontStyle=1;labelBackgroundColor=#FFFFFF;"
DFDEDGE = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;endFill=1;endSize=6;strokeColor=#5B6478;fontSize=10;labelBackgroundColor=#FFFFFF;"


def html(text):
    return escape(text).replace("\n", "<br>")


class Page:
    def __init__(self, name, width, height):
        self.name, self.width, self.height = name, width, height
        self.cells, self.boxes, self.n = [], {}, 1

    def _id(self):
        self.n += 1
        return f"c{self.n}"

    def box(self, key, kind, text, x, y, w, h, raw=False):
        cid = self._id()
        self.boxes[key] = (cid, x, y, w, h)
        value = text if raw else html(text)
        self.cells.append(f'<mxCell id="{cid}" value="{escape(value, quote=True)}" style="{STYLE[kind]}" vertex="1" parent="1"><mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return cid

    def edge(self, a, b, label="", style=EDGE, exit=None, entry=None, points=()):
        s = style
        if exit:
            s += f"exitX={exit[0]};exitY={exit[1]};exitDx=0;exitDy=0;"
        if entry:
            s += f"entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;"
        pts = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in points)
        geo = f'<mxGeometry relative="1" as="geometry">{"<Array as=\"points\">" + pts + "</Array>" if pts else ""}</mxGeometry>'
        self.cells.append(f'<mxCell id="{self._id()}" value="{escape(html(label), quote=True)}" style="{s}" edge="1" parent="1" source="{self.boxes[a][0]}" target="{self.boxes[b][0]}">{geo}</mxCell>')

    def xml(self, pid):
        return (f'<diagram id="{pid}" name="{escape(self.name, quote=True)}"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="{self.width}" pageHeight="{self.height}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>'
                + "".join(self.cells) + "</root></mxGraphModel></diagram>")


def save(filename, pages):
    body = "".join(p.xml(f"p{i}") for i, p in enumerate(pages))
    (HERE / filename).write_text('<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="AklatOne diagram generator" version="24.0.0">' + body + "</mxfile>\n")


# ---------- flowcharts: nodes on a grid (column, row) ----------
COLW, ROWH, W, H, DW, DH = 380, 100, 260, 60, 210, 92
X0, Y0 = 60, 40


class Flow(Page):
    def __init__(self, name, cols, rows):
        super().__init__(name, X0 * 2 + cols * COLW + 260, Y0 + rows * ROWH + 160)
        self.rows = rows

    def cx(self, c): return X0 + c * COLW + COLW / 2
    def cy(self, r): return Y0 + r * ROWH + ROWH / 2

    def node(self, key, kind, text, c, r):
        w, h = (DW, DH) if kind == "decision" else (W, 50 if kind == "terminal" else H)
        return self.box(key, kind, text, self.cx(c) - w / 2, self.cy(r) - h / 2, w, h)

    def lane(self, a, b, x, label="", side_a=None, side_b=None):
        """Route a -> b through a vertical lane at x (keeps long edges clear of other boxes)."""
        _, ax, ay, aw, ah = self.boxes[a]
        _, bx, by, bw, bh = self.boxes[b]
        ea = (0, 0.5) if x < ax else (1, 0.5)
        eb = (0, 0.5) if x < bx else (1, 0.5)
        self.edge(a, b, label, exit=side_a or ea, entry=side_b or eb, points=[(x, ay + ah / 2), (x, by + bh / 2)])

    def footer(self, title, note=""):
        y = Y0 + self.rows * ROWH + 20
        if note:
            self.box(f"note{y}", "note", note, X0 + 40, y, 1200, 30)
        self.box(f"title{y}", "title", title, X0 + 40, y + 40, 1200, 34)


LOAN_NOTE = "* Loan period 7 days, limit 8 books per member (active loans + pending requests)."


def flowchart_member():
    f = Flow("Flowchart 1 - Member Mobile App", 4, 17)
    f.node("start", "terminal", "Start", 1, 0)
    f.node("open", "process", "Open the AklatOne app", 1, 1)
    f.node("first", "decision", "First launch or\nterms changed?", 1, 2)
    f.node("walk", "io", "5 walkthrough slides; accept Terms,\nPrivacy Policy and on-device storage", 2, 2)
    f.node("sess", "decision", "Saved session?", 1, 3)
    f.node("login", "io", "Sign in with username / email and\npassword (account made by the librarian)", 2, 3)
    f.node("code", "io", "Enter 6-digit email code\n(accounts with an email)", 2, 4)
    f.node("ok", "decision", "Signed in?", 2, 5)
    f.node("err", "process", "Show error and\nattempts left", 3, 5)
    f.node("role", "decision", "Role?", 1, 6)
    f.node("lib", "ref", "Librarian mode on the phone\n(see Flowchart 4)", 0, 6)
    f.node("reach", "decision", "Server reachable?", 1, 7)
    f.node("off", "process", "Offline banner: show saved catalog,\nloans and receipts (read-only)", 0, 7)
    f.node("home", "process", "Home: featured books, due dates,\nquick menu", 1, 8)
    f.node("menu", "decision", "Choose", 1, 9)
    f.node("cat", "process", "Catalog: search, filters,\nbook details, favourite", 0, 9)
    f.node("req", "io", "Request to borrow\n(max 8 books*)", 0, 10)
    f.node("pend", "process", "Librarian approves or declines;\napp alert + email with receipt", 0, 11)
    f.node("books", "process", "My Books: borrowed, requests,\nfavourites, history, receipts", 1, 10)
    f.node("visit", "io", "Visit Log: scan the kiosk QR or\ntype its 6-digit code", 2, 10)
    f.node("tin", "process", "First scan today = Time In,\nnext scan = Time Out", 2, 11)
    f.node("other", "process", "Alerts, Suggestion Box, School\nNewspaper, Profile and Settings", 3, 9)
    f.node("more", "decision", "More to do?", 1, 13)
    f.node("out", "process", "Sign out (saved data on the\nphone is cleared)", 1, 14)
    f.node("end", "terminal", "End", 1, 15)
    e = f.edge
    e("start", "open"); e("open", "first")
    e("first", "walk", "Yes"); e("first", "sess", "No")
    # First launch: no saved session yet, so the walkthrough leads straight to sign-in.
    e("walk", "login")
    e("sess", "login", "No"); e("login", "code"); e("code", "ok")
    e("ok", "err", "No"); e("err", "login", exit=(0.5, 0), entry=(1, 0.5), points=[(f.cx(3), f.cy(3))])
    e("ok", "role", "Yes", exit=(0, 0.5), entry=(1, 0.5), points=[(f.cx(1) + 160, f.cy(5)), (f.cx(1) + 160, f.cy(6))])
    e("sess", "role", "Yes", exit=(0.5, 1), entry=(0.5, 0))
    e("role", "lib", "Librarian / Admin"); e("role", "reach", "Member")
    e("reach", "off", "No"); e("reach", "home", "Yes")
    e("off", "home", exit=(0.5, 1), entry=(0, 0.5), points=[(f.cx(0), f.cy(8))])
    e("home", "menu")
    e("menu", "cat", "Catalog"); e("menu", "books", "My Books"); e("menu", "other", "Others")
    e("menu", "visit", "Visit Log", exit=(0.75, 0.75), entry=(0.5, 0), points=[(f.cx(2), f.cy(9) + 23)])
    e("cat", "req"); e("req", "pend"); e("visit", "tin")
    f.lane("pend", "more", f.cx(0) - 160)
    e("books", "more")
    e("tin", "more", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2), f.cy(13))])
    e("other", "more", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(3), f.cy(13))])
    e("more", "home", "Yes", exit=(1, 0.5), entry=(1, 0.5), points=[(f.cx(3) + 230, f.cy(13)), (f.cx(3) + 230, f.cy(8))])
    e("more", "out", "No"); e("out", "end")
    f.footer("AklatOne Flowchart 1: Member on the Mobile App", LOAN_NOTE)
    return f


def flowchart_staff():
    f = Flow("Flowchart 2 - Staff Web and Desktop", 5, 21)
    f.node("start", "terminal", "Start", 2, 0)
    f.node("open", "process", "Open the staff portal (Web)\nor the Desktop app", 2, 1)
    f.node("lib", "decision", "Active librarian\naccount exists?", 2, 2)
    f.node("setup", "io", "First-time setup: name, position,\ndepartment, email, password", 3, 2)
    f.node("signin", "io", "Sign in with email and password", 2, 3)
    f.node("code", "io", "Enter 6-digit email code", 2, 4)
    f.node("ok", "decision", "Signed in?", 2, 5)
    f.node("err", "process", "Show error and attempts left\n(5 tries per 15 minutes)", 1, 5)
    f.node("desk", "decision", "Desktop app?", 2, 6)
    f.node("choose", "decision", "Choose app", 3, 6)
    f.node("kiosk", "ref", "Visitor's Log kiosk\n(see Flowchart 5)", 4, 6)
    f.node("dash", "process", "Dashboard: totals, books used this\nweek, recent activity, quick actions", 2, 7)
    f.node("mod", "decision", "Choose module", 2, 8)
    f.node("cat", "process", "Catalog: books, copies, Excel import /\nexport, QR labels, inventory audit", 1, 8)
    f.node("mem", "process", "Members: add / edit / deactivate;\nMember ID and Library ID cards", 3, 8)
    f.node("oth", "process", "Suggestions, Reports (time spent, Excel),\nPrinting, School Newspaper, Settings\n(backup / restore, system status)", 4, 9)
    f.node("how", "decision", "Lend at the desk or\na member's request?", 2, 9)
    f.node("scan", "io", "Scan Library ID card (camera first),\nthen the copy QR label or search", 1, 10)
    f.node("incat", "decision", "Book in AklatOne?", 1, 11)
    f.node("add", "process", "Add the book in\nCatalog first", 0, 11)
    f.node("lend", "process", "Lend for 7 days*: receipt,\napp alert + email", 1, 12)
    f.node("appr", "decision", "Approve?\n(copy available)", 2, 10)
    f.node("decl", "process", "Decline with optional reason;\nmember is alerted", 3, 10)
    f.node("aok", "process", "Approve: lend a copy for 7 days*,\nreceipt, app alert + email", 2, 11)
    f.node("track", "process", "Track borrowed books (automatic\nreminder the day before due)", 2, 13)
    f.node("over", "decision", "Overdue?", 2, 14)
    f.node("notice", "process", "Send overdue notice\n(app alert + email)", 3, 14)
    f.node("ret", "decision", "Book returned?", 2, 15)
    f.node("outc", "io", "Scan the copy QR (or pick the loan);\noutcome: on time, late, torn, missing", 2, 16)
    f.node("upd", "process", "Update copy status, close loan,\nalert member, write audit log", 2, 17)
    f.node("more", "decision", "More work?", 2, 18)
    f.node("out", "process", "Logout (Web: automatic after\n30 idle minutes)", 2, 19)
    f.node("end", "terminal", "End", 2, 20)
    e = f.edge
    e("start", "open"); e("open", "lib")
    e("lib", "setup", "No"); e("lib", "signin", "Yes")
    e("setup", "signin", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(3), f.cy(3))])
    e("signin", "code"); e("code", "ok")
    e("ok", "err", "No"); e("err", "signin", exit=(0.5, 0), entry=(0, 0.5), points=[(f.cx(1), f.cy(3))])
    e("ok", "desk", "Yes")
    e("desk", "choose", "Yes"); e("desk", "dash", "No (Web)")
    e("choose", "kiosk", "Visitor's Log")
    e("choose", "dash", "AklatOne LMS", exit=(0.5, 1), entry=(0.75, 0), points=[(f.cx(3), f.cy(7) - 45), (f.cx(2) + 65, f.cy(7) - 45)])
    e("dash", "mod")
    e("mod", "cat", "Catalog"); e("mod", "mem", "Members"); e("mod", "how", "Borrowing")
    e("mod", "oth", "Others", exit=(0.75, 0.75), entry=(0.5, 0), points=[(f.cx(2) + 53, f.cy(8) + 60), (f.cx(4), f.cy(8) + 60)])
    e("how", "scan", "At the desk"); e("how", "appr", "Request")
    e("scan", "incat")
    e("incat", "add", "No"); e("add", "scan", exit=(0.5, 0), entry=(0, 0.5), points=[(f.cx(0), f.cy(10))])
    e("incat", "lend", "Yes")
    e("lend", "track", exit=(0.5, 1), entry=(0, 0.5), points=[(f.cx(1), f.cy(13))])
    e("appr", "decl", "No"); e("appr", "aok", "Yes"); e("aok", "track")
    e("track", "over")
    e("over", "notice", "Yes"); e("over", "ret", "No")
    e("notice", "ret", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(3), f.cy(15))])
    e("ret", "track", "No", exit=(0, 0.5), entry=(0, 0.75), points=[(f.cx(2) - 160, f.cy(15)), (f.cx(2) - 160, f.cy(13) + 15)])
    e("ret", "outc", "Yes"); e("outc", "upd"); e("upd", "more")
    f.lane("cat", "more", f.cx(0) - 170)
    f.lane("mem", "more", f.cx(4) + 200)
    f.lane("oth", "more", f.cx(4) + 200)
    f.lane("decl", "more", f.cx(4) + 200)
    e("more", "dash", "Yes (back to Dashboard)", exit=(1, 0.5), entry=(1, 0.5), points=[(f.cx(4) + 250, f.cy(18)), (f.cx(4) + 250, f.cy(7))])
    e("more", "out", "No"); e("out", "end")
    f.footer("AklatOne Flowchart 2: Librarian on the Staff Web and Desktop Apps", LOAN_NOTE)
    return f


def flowchart_offline():
    f = Flow("Flowchart 3 - Desktop Offline and Upload", 4, 13)
    f.node("start", "terminal", "Start", 1, 0)
    f.node("open", "process", "Open the Desktop app", 1, 1)
    f.node("reach", "decision", "Server reachable?\n(health check every 15 s)", 1, 2)
    f.node("online", "process", "Online: normal work; every list\nis also saved on this computer", 2, 2)
    f.node("prof", "decision", "Signed in before\non this computer?", 1, 3)
    f.node("need", "process", "Sign-in needs the server;\ntry again when online", 0, 3)
    f.node("offm", "process", "Offline Mode: lists from this\ncomputer, \"System Offline\" shown", 1, 4)
    f.node("chg", "decision", "Make a change?", 1, 5)
    f.node("view", "process", "Read only: browse saved\nlists and printouts", 2, 5)
    f.node("queue", "process", "Save to the Upload outbox: books, copies,\nmembers, lends, returns, notices", 1, 6)
    f.node("secret", "process", "Member passwords go to the OS\ncredential store, not the outbox", 0, 6)
    f.node("back", "decision", "Back online?", 1, 7)
    f.node("upl", "process", "Upload: send items in order, each\nwith its Idempotency-Key", 1, 8)
    f.node("res", "decision", "Server answer?", 1, 9)
    f.node("done", "process", "Accepted: remove item\n(a retry never adds twice)", 1, 10)
    f.node("skip", "process", "409 changed by someone else or\nrejected: skipped, reason shown", 2, 9)
    f.node("stop", "process", "Offline again or session ended:\nstop, keep the rest for later", 0, 9)
    f.node("left", "decision", "Items left?", 1, 11)
    f.node("end", "terminal", "End", 1, 12)
    e = f.edge
    e("start", "open"); e("open", "reach")
    e("reach", "online", "Yes"); e("reach", "prof", "No")
    e("prof", "need", "No"); e("prof", "offm", "Yes")
    f.lane("need", "end", f.cx(0) - 190)
    e("online", "end", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2) + 160, f.cy(2) + 30), (f.cx(2) + 160, f.cy(12))])
    e("offm", "chg")
    e("chg", "view", "No"); e("chg", "queue", "Yes")
    e("queue", "secret", "member with password")
    e("view", "back", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2), f.cy(7))])
    e("queue", "back")
    e("back", "offm", "No", exit=(0, 0.5), entry=(0, 0.5), points=[(f.cx(0) + 190, f.cy(7)), (f.cx(0) + 190, f.cy(4))])
    e("back", "upl", "Yes"); e("upl", "res")
    e("res", "done", "200 / 201"); e("res", "skip", "409 / 400"); e("res", "stop", "no answer / 401")
    e("done", "left")
    e("skip", "left", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2), f.cy(11))])
    f.lane("stop", "end", f.cx(0) - 190)
    e("left", "upl", "Yes", exit=(1, 0.5), entry=(1, 0.5), points=[(f.cx(3), f.cy(11)), (f.cx(3), f.cy(8))])
    e("left", "end", "No")
    f.footer("AklatOne Flowchart 3: Desktop Offline Mode and Upload")
    return f


def flowchart_phone_librarian():
    f = Flow("Flowchart 4 - Librarian on the Phone", 4, 14)
    f.node("start", "terminal", "Start", 1, 0)
    f.node("signin", "io", "Sign in on the AklatOne phone app\n(password + email code)", 1, 1)
    f.node("role", "decision", "Librarian or Admin?", 1, 2)
    f.node("mem", "ref", "Member app\n(see Flowchart 1)", 0, 2)
    f.node("scr", "process", "Librarian screen\n(phone camera is the scanner)", 1, 3)
    f.node("task", "decision", "Lend or Return?", 1, 4)
    f.node("card", "io", "Scan the Library ID card\n(or type the Member ID)", 0, 5)
    f.node("found", "decision", "Active member\nfound?", 0, 6)
    f.node("cerr", "process", "Show why (not a Member ID,\nnot found, deactivated)", 0, 7)
    f.node("show", "process", "Show name, grade / section\nand books borrowed now", 1, 6)
    f.node("copy", "io", "Scan the book's QR label", 1, 7)
    f.node("can", "decision", "Copy on the shelf and\nunder the limit (8*)?", 1, 8)
    f.node("lerr", "process", "Show the reason;\nnothing is lent", 0, 8)
    f.node("lent", "process", "Lent: receipt no., due date\n(7 days*), app alert + email", 1, 9)
    f.node("rcopy", "io", "Scan the returned book's\nQR label", 2, 5)
    f.node("cond", "io", "Choose condition: good,\ndamaged / torn, missing", 2, 6)
    f.node("isb", "decision", "Copy borrowed\nright now?", 2, 7)
    f.node("rerr", "process", "\"Not borrowed right now\"", 3, 7)
    f.node("rec", "process", "Record: on time or late by due date,\ncopy status, alert member", 2, 8)
    f.node("more", "decision", "More to scan?", 1, 11)
    f.node("out", "process", "Sign out", 1, 12)
    f.node("end", "terminal", "End", 1, 13)
    e = f.edge
    e("start", "signin"); e("signin", "role")
    e("role", "mem", "No"); e("role", "scr", "Yes"); e("scr", "task")
    e("task", "card", "Lend", exit=(0, 0.5), entry=(0.5, 0), points=[(f.cx(0), f.cy(4))])
    e("task", "rcopy", "Return", exit=(1, 0.5), entry=(0.5, 0), points=[(f.cx(2), f.cy(4))])
    e("card", "found")
    e("found", "cerr", "No"); e("found", "show", "Yes")
    e("cerr", "card", exit=(0, 0.5), entry=(0, 0.5), points=[(f.cx(0) - 150, f.cy(7)), (f.cx(0) - 150, f.cy(5))])
    e("show", "copy"); e("copy", "can")
    e("can", "lerr", "No"); e("can", "lent", "Yes")
    e("lerr", "more", exit=(0.5, 1), entry=(0, 0.5), points=[(f.cx(0), f.cy(11))])
    e("rcopy", "cond"); e("cond", "isb")
    e("isb", "rerr", "No"); e("isb", "rec", "Yes")
    e("lent", "more")
    e("rec", "more", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2), f.cy(11))])
    e("rerr", "more", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(3), f.cy(11))])
    e("more", "task", "Yes", exit=(0.75, 0.75), entry=(0.75, 0.25), points=[(f.cx(1) + 53, f.cy(11) + 60), (f.cx(3) + 200, f.cy(11) + 60), (f.cx(3) + 200, f.cy(4) - 23)])
    e("more", "out", "No"); e("out", "end")
    f.footer("AklatOne Flowchart 4: Librarian Mode on the Phone App (Lend and Return)", LOAN_NOTE)
    return f


def flowchart_kiosk():
    f = Flow("Flowchart 5 - Visitor's Log Kiosk", 4, 17)
    f.node("start", "terminal", "Start", 1, 0)
    f.node("st", "process", "Librarian starts the Visitor's Log\n(Desktop chooser or side menu)", 1, 1)
    f.node("srv", "decision", "Server reachable?", 1, 2)
    f.node("nost", "process", "Cannot start: starting\nneeds the server", 0, 2)
    f.node("ks", "process", "Kiosk screen: phone QR + 6-digit code\n(new every 30 s) and Member ID field", 1, 3)
    f.node("how", "decision", "How does the\nmember check in?", 1, 4)
    f.node("cardin", "io", "Scan Library ID card or\ntype the Member ID", 0, 5)
    f.node("phone", "io", "Member app: scan the QR or\ntype the 6-digit code", 2, 5)
    f.node("valid", "decision", "Valid Member ID /\nfresh code?", 1, 6)
    f.node("msg", "process", "Show the reason\n(nothing recorded)", 0, 6)
    f.node("net", "decision", "Kiosk online?", 1, 7)
    f.node("q", "process", "Save the scan on this computer;\nsent automatically when online", 0, 7)
    f.node("firstd", "decision", "First scan of the\nPH day?", 1, 8)
    f.node("tin", "process", "Time In", 0, 9)
    f.node("rep", "decision", "Within 60 s of\nthe last scan?", 1, 9)
    f.node("ign", "process", "Ignored (scanned twice)", 2, 9)
    f.node("tout", "process", "Time Out", 1, 10)
    f.node("ban", "process", "Show the big Time In / Time Out\nbanner and update today's list", 1, 11)
    f.node("close", "decision", "Librarian closes\nthe kiosk?", 1, 12)
    f.node("pw", "io", "Enter the librarian password", 1, 13)
    f.node("pwok", "decision", "Correct?", 1, 14)
    f.node("end", "terminal", "End (back to AklatOne)", 1, 15)
    e = f.edge
    e("start", "st"); e("st", "srv")
    e("srv", "nost", "No"); e("srv", "ks", "Yes")
    e("ks", "how")
    e("how", "cardin", "Card / Member ID", exit=(0, 0.5), entry=(0.5, 0), points=[(f.cx(0), f.cy(4))])
    e("how", "phone", "Phone", exit=(1, 0.5), entry=(0.5, 0), points=[(f.cx(2), f.cy(4))])
    e("cardin", "valid", exit=(1, 0.5), entry=(0, 0.25), points=[(f.cx(0) + 150, f.cy(5)), (f.cx(0) + 150, f.cy(6) - 23)])
    e("phone", "valid", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2), f.cy(6))])
    e("valid", "msg", "No"); e("valid", "net", "Yes")
    e("net", "q", "No (card / ID only)"); e("net", "firstd", "Yes")
    e("firstd", "tin", "Yes", exit=(0, 0.5), entry=(0.5, 0), points=[(f.cx(0), f.cy(8))])
    e("firstd", "rep", "No")
    e("rep", "ign", "Yes"); e("rep", "tout", "No")
    e("tin", "ban", exit=(0.5, 1), entry=(0, 0.5), points=[(f.cx(0), f.cy(11))])
    e("ign", "ban", exit=(0.5, 1), entry=(1, 0.5), points=[(f.cx(2), f.cy(11))])
    e("tout", "ban")
    e("q", "ban", exit=(0, 0.5), entry=(0, 0.75), points=[(f.cx(0) - 150, f.cy(7)), (f.cx(0) - 150, f.cy(11) + 15)])
    e("ban", "close")
    e("msg", "close", exit=(0, 0.5), entry=(0, 0.5), points=[(f.cx(0) - 175, f.cy(6)), (f.cx(0) - 175, f.cy(12))])
    e("close", "ks", "No (next visitor)", exit=(1, 0.5), entry=(1, 0.5), points=[(f.cx(3), f.cy(12)), (f.cx(3), f.cy(3))])
    e("close", "pw", "Yes"); e("pw", "pwok")
    e("pwok", "ks", "No (kiosk stays)", exit=(1, 0.5), entry=(1, 0.25), points=[(f.cx(3) + 60, f.cy(14)), (f.cx(3) + 60, f.cy(3) - 12)])
    e("pwok", "end", "Yes")
    e("nost", "end", exit=(0.5, 1), entry=(0, 0.5), points=[(f.cx(0) - 30, f.cy(2) + 30), (f.cx(0) - 200, f.cy(2) + 30), (f.cx(0) - 200, f.cy(15))])
    f.footer("AklatOne Flowchart 5: Visitor's Log Kiosk (Time In / Time Out)",
             "Rules: first scan of the Philippine day = Time In, the next = Time Out; a repeat within 60 s is ignored; an open Time In from an earlier day is never closed by guessing.")
    return f


# ---------- DFDs ----------
FLOW_H = 30
STORES = {
    "D1": "Users and Roles", "D2": "Books and Categories", "D3": "Book Copies", "D4": "Borrow Requests",
    "D5": "Borrowing Transactions", "D6": "Notifications", "D7": "Audit Log", "D8": "Favourites, Ratings and Views",
    "D9": "Library Visits", "D10": "App Usage", "D11": "Suggestions", "D12": "Inventory Audits",
    "D13": "Device Cache and Outbox (local)", "D14": "Idempotency Keys", "D15": "Backup Files",
}
EXTERNAL = {"Email Service", "Open Library (covers)"}


def dfd_rows(page, rows, x_ent=200, x_proc=760, x_store=1240, y=40, ent_w=190, proc_w=280, store_w=300, gap=50, seen=None):
    """Each row: one process; entities on the left and data stores on the right, one straight line per flow.
    Flow = (name, direction, label); the direction is the arrow as drawn: '>' points right, '<' points left
    (left side: '>' into the process; right side: '>' into the data store or external entity)."""
    seen = set() if seen is None else seen
    tops = {}
    for pid, (num, title, left, right) in enumerate(rows):
        n = max(len(left), len(right), 3)
        h = n * FLOW_H + 20
        pk = f"p{pid}"
        value = (f"<b>{escape(num)}</b><hr style=\"border:none;border-top:1px solid #3354B5;width:60%\">{html(title)}" if num else f"<b>{html(title)}</b>")
        page.box(pk, "dfdproc" if num else "system", value, x_proc, y, proc_w, h, raw=True)
        tops[pk] = (y, h)
        for side, flows, x, w in (("L", left, x_ent, ent_w), ("R", right, x_store, store_w)):
            groups = []
            for i, (name, d, label) in enumerate(flows):
                if groups and groups[-1][0] == name:
                    groups[-1][1].append((i, d, label))
                else:
                    groups.append((name, [(i, d, label)]))
            off = (n - len(flows)) * FLOW_H / 2
            for name, items in groups:
                gy = y + 10 + off + items[0][0] * FLOW_H
                gh = len(items) * FLOW_H - 6
                key = f"{pk}{side}{name}"
                repeat = " *" if name in seen else ""
                seen.add(name)
                if side == "L" or name in EXTERNAL:
                    page.box(key, "entity", name + repeat, x, gy, w, gh)
                else:
                    page.box(key, "store", f"<b>{escape(name)}</b>&nbsp;&nbsp;|&nbsp;&nbsp;{escape(STORES[name])}{repeat}", x, gy, w, gh, raw=True)
                for k, (i, d, label) in enumerate(items):
                    fy = gy + (k + 0.5) * (gh / len(items))
                    fe, fp = (fy - gy) / gh, (fy - y) / h
                    if side == "L":
                        a, b, ea, eb = (key, pk, (1, fe), (0, fp)) if d == ">" else (pk, key, (0, fp), (1, fe))
                    else:
                        a, b, ea, eb = (pk, key, (1, fp), (0, fe)) if d == ">" else (key, pk, (0, fe), (1, fp))
                    page.edge(a, b, label, style=DFDEDGE, exit=ea, entry=eb)
        y += h + gap
    return y, tops


def dfd_level0():
    p = Page("DFD Level 0 - Context Diagram", 1700, 900)
    left = [
        ("Member", ">", "Credentials, email code, borrow requests, favourites, ratings"),
        ("Member", ">", "Visit check-in (kiosk QR / code), suggestions, app time"),
        ("Member", "<", "Catalog, loans, receipts, alerts, Time In / Out, statistics"),
        ("Librarian / Admin", ">", "Credentials, books, copies, Excel catalog, members"),
        ("Librarian / Admin", ">", "Desk lending, approvals, returns, notices, kiosk scans"),
        ("Librarian / Admin", ">", "Backup / restore requests, suggestion replies"),
        ("Librarian / Admin", "<", "Dashboard, reports, Excel exports, printouts, ID cards, QR labels"),
        ("Librarian / Admin", "<", "Suggestions, backup files, system status"),
    ]
    right = [
        ("Email Service", ">", "Sign-in codes, receipts, notices, reminders"),
        ("Open Library (covers)", "<", "Book cover images (by ISBN)"),
    ]
    y, _ = dfd_rows(p, [("", "0\nAklatOne Library\nManagement System", left, right)], x_ent=80, x_proc=760, x_store=1300, ent_w=200, proc_w=300, store_w=220)
    p.box("t", "title", "AklatOne: Data Flow Diagram, Level 0 (Context Diagram)", 80, y + 10, 1200, 34)
    p.box("n", "note", "Google sign-in and self-registration were removed (2026-11-24): the librarian creates every member account.", 80, y + 50, 1300, 24)
    return p


L1 = [
    ("1.0", "Authenticate and\nManage Accounts",
     [("Member", ">", "Credentials, email code, profile"), ("Member", "<", "Session, profile, Member ID"),
      ("Librarian / Admin", ">", "Credentials, member details"), ("Librarian / Admin", "<", "Member list, Library ID cards")],
     [("D1", ">", "Account data, card printed"), ("D1", "<", "Accounts, permissions"),
      ("Email Service", ">", "Sign-in codes, welcome / security emails"), ("D7", ">", "Sign-in and account audit")]),
    ("2.0", "Manage Catalog,\nCopies and Inventory",
     [("Librarian / Admin", ">", "Books, copies, Excel import, scans"), ("Librarian / Admin", "<", "Excel export, QR labels, audit report")],
     [("D2", ">", "Book records"), ("D2", "<", "Books"), ("D3", ">", "Copy records, verified date"), ("D3", "<", "Copies"),
      ("D12", ">", "Audit scans"), ("D7", ">", "Audit entry")]),
    ("3.0", "Search Catalog and\nTrack Engagement",
     [("Member", ">", "Search, filters, ratings, favourites"), ("Member", "<", "Catalog, covers, availability"),
      ("Open Library (covers)", ">", "Cover images")],
     [("D2", "<", "Books (not hidden)"), ("D3", "<", "Copy counts"), ("D8", ">", "Views, ratings, favourites"), ("D8", "<", "Favourites")]),
    ("4.0", "Process Borrow\nRequests",
     [("Member", ">", "Borrow request / cancel"), ("Member", "<", "Request status"), ("Librarian / Admin", ">", "Approve / decline")],
     [("D4", ">", "Request records"), ("D4", "<", "Requests"), ("D3", "<", "Available copy")]),
    ("5.0", "Record Circulation\n(Desk Lending and Returns)",
     [("Librarian / Admin", ">", "Member ID + copy QR (lend)"), ("Librarian / Admin", ">", "Copy QR + outcome (return)"),
      ("Member", "<", "Receipt, due date, history")],
     [("D1", "<", "Member by Member ID"), ("D5", ">", "Loan and return records"), ("D5", "<", "Loans"), ("D3", ">", "Copy status")]),
    ("6.0", "Send Notifications\nand Reminders",
     [("Librarian / Admin", ">", "Overdue notice / reminder"), ("Member", "<", "Alerts")],
     [("D5", "<", "Loans due tomorrow (daily job)"), ("D6", ">", "Alerts"), ("D6", "<", "Sent reminders"),
      ("Email Service", ">", "Notice and receipt emails")]),
    ("7.0", "Record Library\nVisits (Kiosk)",
     [("Member", ">", "Card, Member ID, kiosk QR / 6-digit code"), ("Member", "<", "Time In / Time Out"),
      ("Librarian / Admin", ">", "Start / close kiosk (password)")],
     [("D1", "<", "Member check"), ("D9", ">", "Time In / Time Out"), ("D9", "<", "Today's visits")]),
    ("8.0", "Collect Suggestions",
     [("Member", ">", "Book suggestion / feedback"), ("Member", "<", "Status and reply"),
      ("Librarian / Admin", ">", "Status and reply"), ("Librarian / Admin", "<", "Suggestions, NEW count")],
     [("D11", ">", "Suggestions, replies"), ("D11", "<", "Suggestions"), ("D6", ">", "Suggestion alert")]),
    ("9.0", "Generate Reports,\nTime Spent and Printouts",
     [("Member", ">", "App time (seconds per day)"), ("Member", "<", "My statistics"),
      ("Librarian / Admin", ">", "Date range, list to print"), ("Librarian / Admin", "<", "Reports, Excel, printouts")],
     [("D10", ">", "App usage"), ("D10", "<", "App time"), ("D5", "<", "Transactions"), ("D9", "<", "Visits"), ("D1", "<", "Members"), ("D7", "<", "Recent activity")]),
    ("10.0", "Synchronize Offline\nData",
     [("Librarian / Admin", ">", "Changes made offline, Upload"), ("Librarian / Admin", "<", "Upload results, skipped items"),
      ("Member", "<", "Saved catalog, loans, receipts (read-only)")],
     [("D13", ">", "Cached lists, outbox, kiosk queue"), ("D13", "<", "Queued changes"), ("D14", ">", "Upload keys"), ("D14", "<", "First answer (replay)")]),
    ("11.0", "Back Up and\nRestore Database",
     [("Librarian / Admin", ">", "Password, backup password, RESTORE"), ("Librarian / Admin", "<", "Backup file")],
     [("D15", ">", "Backups (daily + on request)"), ("D15", "<", "Backup to restore"), ("D7", ">", "Backup / restore audit")]),
]


def dfd_level1():
    p = Page("DFD Level 1", 1700, 3600)
    y, tops = dfd_rows(p, L1)
    # 4.0 hands an approved request to 5.0 (the next row).
    p.edge("p3", "p4", "Approved loan", style=DFDEDGE, exit=(0.5, 1), entry=(0.5, 0))
    p.box("t", "title", "AklatOne: Data Flow Diagram, Level 1", 200, y, 1200, 34)
    p.box("n", "note", "* = the same external entity or data store repeated to keep the flows readable. D13 lives on the device (Desktop outbox and cache, kiosk queue, phone cache); D1 to D12, D14 are tables in the central MariaDB database; D15 is the backup folder on the server.", 200, y + 40, 1340, 40)
    p.height = int(y + 120)
    return p


L2 = [
    ("1.0 Authenticate and\nManage Accounts", [("1.1", "Check username /\nemail and password", "D1"), ("1.2", "Send and check the\n6-digit email code", "Email Service"), ("1.3", "Issue session token;\nwrite sign-in audit", "D7"), ("1.4", "Add / edit members;\nmake Member ID", "D1"), ("1.5", "Print Library ID\ncards, mark printed", "D1")]),
    ("2.0 Manage Catalog,\nCopies and Inventory", [("2.1", "Add / edit / hide\nbooks", "D2"), ("2.2", "Add copies; make\ncopy codes", "D3"), ("2.3", "Excel import:\npreview, then apply", "D2"), ("2.4", "Print copy\nQR labels", "D3"), ("2.5", "Inventory audit:\nscan copies, report", "D12")]),
    ("3.0 Search Catalog and\nTrack Engagement", [("3.1", "Search, filter\nand sort", "D2"), ("3.2", "Show availability\nand cover", "D3"), ("3.3", "Favourite, rate,\ncount views", "D8")]),
    ("4.0 Process Borrow\nRequests", [("4.1", "Check limit (8*)\nand free copy", "D5"), ("4.2", "Save pending\nrequest", "D4"), ("4.3", "Approve or decline;\nalert member", "D4"), ("4.4", "Approved: lend\n(goes to 5.3)", None)]),
    ("5.0 Record\nCirculation", [("5.1", "Find member by\nMember ID card", "D1"), ("5.2", "Find copy by\nQR label code", "D3"), ("5.3", "Lend: loan, receipt,\ndue date (7 days*)", "D5"), ("5.4", "Return: outcome,\ncopy status", "D5")]),
    ("6.0 Send Notifications\nand Reminders", [("6.1", "Librarian notice\n(overdue / reminder)", None), ("6.2", "Daily job: loans\ndue tomorrow", "D5"), ("6.3", "Save in-app\nalert", "D6"), ("6.4", "Send email\n(if member has one)", "Email Service")]),
    ("7.0 Record Library\nVisits (Kiosk)", [("7.1", "Start kiosk\n(kiosk-only token)", None), ("7.2", "Identify member: card,\nID, phone QR / code", "D1"), ("7.3", "Apply Time In /\nTime Out rule", "D9"), ("7.4", "Offline: queue scan\non the kiosk computer", "D13"), ("7.5", "Close kiosk with\nlibrarian password", None)]),
    ("8.0 Collect\nSuggestions", [("8.1", "Member sends\n(5 a day)", "D11"), ("8.2", "Librarian reviews\n(NEW badge)", "D11"), ("8.3", "Set status\nand reply", "D11"), ("8.4", "Alert the\nmember", "D6")]),
    ("9.0 Generate Reports,\nTime Spent, Printouts", [("9.1", "Collect app time\nper PH day", "D10"), ("9.2", "Library time from\nTime In / Out", "D9"), ("9.3", "Loan statistics\nand days kept", "D5"), ("9.4", "Reports, Excel,\nprintouts", None)]),
    ("10.0 Synchronize\nOffline Data", [("10.1", "Cache read lists\non the device", "D13"), ("10.2", "Queue offline\nchanges (Desktop)", "D13"), ("10.3", "Upload with\nIdempotency-Key", "D14"), ("10.4", "Conflict check\n(409 if changed)", None), ("10.5", "Show sent and\nskipped items", None)]),
    ("11.0 Back Up and\nRestore Database", [("11.1", "Re-check the staff\npassword", "D1"), ("11.2", "Dump, gzip,\noptional encryption", "D15"), ("11.3", "Validate upload;\nsafety copy first", "D15"), ("11.4", "Restore, then\napply migrations", None)]),
]


def dfd_level2():
    p = Page("DFD Level 2 - Simplified", 1900, 2600)
    y, rh, sx, sw, gap = 40, 190, 280, 190, 60
    for r, (title, steps) in enumerate(L2):
        p.box(f"r{r}", "rowlabel", title, 40, y + 18, 200, 70)
        for i, (num, name, store) in enumerate(steps):
            x = sx + i * (sw + gap)
            k = f"s{r}_{i}"
            p.box(k, "dfdproc", f"<b>{escape(num)}</b><br>{html(name)}", x, y, sw, 100, raw=True)
            if i == 0:
                p.edge(f"r{r}", k, style=DFDEDGE, exit=(1, 0.5), entry=(0, 0.5))
            else:
                p.edge(f"s{r}_{i - 1}", k, style=DFDEDGE, exit=(1, 0.5), entry=(0, 0.5))
            if store:
                sk = f"st{r}_{i}"
                if store in EXTERNAL:
                    p.box(sk, "entity", store, x, y + 130, sw, 34)
                else:
                    p.box(sk, "store", f"<b>{store}</b>&nbsp;|&nbsp;{escape(STORES[store])}", x, y + 130, sw, 34, raw=True)
                p.edge(k, sk, style=DFDEDGE + "startArrow=block;startFill=1;startSize=5;", exit=(0.5, 1), entry=(0.5, 0))
        y += rh
    p.box("t", "title", "AklatOne: Data Flow Diagram, Level 2 (one row per Level 1 process)", 40, y, 1200, 34)
    p.box("n", "note", "Arrows between a process and a store mean the process reads and writes it. * Loan rules: 7 days, up to 8 books per member.", 40, y + 40, 1500, 24)
    p.height = int(y + 100)
    return p


PAGES = {
    "AklatOne-Flowchart.drawio": [
        (flowchart_member, "Flowchart-1-Member-Mobile"), (flowchart_staff, "Flowchart-2-Staff-Web-Desktop"),
        (flowchart_offline, "Flowchart-3-Desktop-Offline-Upload"), (flowchart_phone_librarian, "Flowchart-4-Librarian-Phone"),
        (flowchart_kiosk, "Flowchart-5-Visitors-Log-Kiosk"),
    ],
    "AklatOne-DFD.drawio": [(dfd_level0, "DFD-Level-0-Context"), (dfd_level1, "DFD-Level-1")],
    "AklatOne-DFD-Level2.drawio": [(dfd_level2, "DFD-Level-2")],
}


def export_png():
    """Print the draw.io export commands (flatpak draw.io; run from docs/diagrams)."""
    for file, pages in PAGES.items():
        for i, (_, png) in enumerate(pages):
            print(f'flatpak run com.jgraph.drawio.desktop -x -f png -s 1.5 --page-index {i + 1} -o "$PWD/png/{png}.png" "$PWD/{file}"')


if __name__ == "__main__":
    import sys
    for file, pages in PAGES.items():
        save(file, [make() for make, _ in pages])
    if "--png-commands" in sys.argv:
        export_png()
    else:
        print("Wrote", ", ".join(PAGES))
