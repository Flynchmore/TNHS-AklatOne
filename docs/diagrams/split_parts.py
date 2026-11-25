"""Cut each exported diagram (png/*.png) into numbered parts for Google Docs (png/parts/).

A whole diagram shrunk to the width of a document page has text too small to read, so each one is cut into a grid of
parts (at most PART_W x PART_H pixels, so a part fills a page at a readable size). Parts overlap by OVERLAP pixels so
nothing is lost at a cut, and each part has a label: diagram, "Part n of N" and its row / column. Put them in the
document in order (left to right, then top to bottom) to rebuild the whole diagram.

Run after exporting the PNGs (python3 generate_diagrams.py --png-commands): python3 split_parts.py
Needs ImageMagick 7 (magick).
"""
import math
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
PART_W, PART_H, OVERLAP, LABEL_H = 1200, 1500, 60, 56

# PNG file -> (part name, title on the label)
DIAGRAMS = {
    "Flowchart-1-Member-Mobile.png": ("Flowchart1", "Flowchart 1: Member Mobile App"),
    "Flowchart-2-Staff-Web-Desktop.png": ("Flowchart2", "Flowchart 2: Staff Web and Desktop"),
    "Flowchart-3-Desktop-Offline-Upload.png": ("Flowchart3", "Flowchart 3: Desktop Offline and Upload"),
    "Flowchart-4-Librarian-Phone.png": ("Flowchart4", "Flowchart 4: Librarian on the Phone"),
    "Flowchart-5-Visitors-Log-Kiosk.png": ("Flowchart5", "Flowchart 5: Visitor's Log Kiosk"),
    "ERD.png": ("ERD", "Entity Relationship Diagram"),
    "DFD-Level-0-Context.png": ("DFD0", "DFD Level 0 (Context Diagram)"),
    "DFD-Level-1.png": ("DFD1", "DFD Level 1"),
    "DFD-Level-2.png": ("DFD2", "DFD Level 2"),
}


def magick(*args: str) -> str:
    return subprocess.run(["magick", *args], check=True, capture_output=True, text=True).stdout


def spans(total: int, size: int) -> list[tuple[int, int]]:
    """Start and length of each part along one side: equal parts, each at most `size`, overlapping by OVERLAP."""
    n = max(1, math.ceil((total - OVERLAP) / (size - OVERLAP)))
    step = (total - OVERLAP) / n
    return [(round(i * step), min(total, round(i * step + step + OVERLAP)) - round(i * step)) for i in range(n)]


def split(png: Path, name: str, title: str, out: Path) -> list[str]:
    trimmed = out / f".{name}-trimmed.png"
    magick(str(png), "-trim", "+repage", "-bordercolor", "white", "-border", "24", str(trimmed))
    w, h = map(int, magick(str(trimmed), "-format", "%w %h", "info:").split())
    cols, rows = spans(w, PART_W), spans(h, PART_H)
    total, files, n = len(cols) * len(rows), [], 0
    for r, (y, ph) in enumerate(rows, 1):
        for c, (x, pw) in enumerate(cols, 1):
            n += 1
            file = f"{name}_{n:02d}.png"
            label = f"{title}  |  Part {n} of {total}" + (f"  (row {r}, column {c})" if total > 1 else "")
            magick(str(trimmed), "-crop", f"{pw}x{ph}+{x}+{y}", "+repage",
                   "-background", "#1E326D", "-gravity", "north", "-splice", f"0x{LABEL_H}",
                   "-font", "Liberation-Sans-Bold", "-pointsize", "24", "-fill", "white", "-gravity", "northwest",
                   "-annotate", "+20+14", label, str(out / file))
            files.append(file)
    trimmed.unlink()
    return files


def main() -> None:
    out = HERE / "png" / "parts"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.png"):
        old.unlink()
    lines = ["# Diagram parts for Google Docs", "", "Made by `split_parts.py` from `png/*.png`. Insert each diagram's parts in order "
             "(left to right, then top to bottom); neighbouring parts overlap a little so nothing is lost at a cut.", ""]
    for png, (name, title) in DIAGRAMS.items():
        files = split(HERE / "png" / png, name, title, out)
        lines.append(f"- **{title}** ({len(files)} part{'s' if len(files) > 1 else ''}): " + ", ".join(f"`{f}`" for f in files))
        print(f"{png} -> {len(files)} parts")
    (out / "README.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
