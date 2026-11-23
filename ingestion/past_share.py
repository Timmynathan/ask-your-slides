"""Share general courses' past papers across programmes (owner, 23 Nov 2026).

The IOH courses (English for Business Purposes, Communication in English, Entrepreneurship, …) are taught
to many programmes, but each programme's folder only had the papers found in its own LMS archive
(Finance had no English for Business Purposes paper; Mass Communication had five). This copies every
published paper (status ok in the database) of an IOH course into each programme's copy of that course
(same code and level) that doesn't have it yet: the PDF, its past_papers.yaml entry and its review file.
Copies are byte-identical, so `npm run ingest:past` reuses the stored reading (no model call) and
--analyse reuses answers wherever the slides are the same.

  uv run past_share.py            # preview: what would be copied
  uv run past_share.py --apply    # copy
"""

from __future__ import annotations

import argparse
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import yaml

from config import DATA
from store import Store

PREFIX = "IOH-"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    store = Store()
    rows = store.db.execute(
        """select c.code, c.level, c.programme, p.source_file, p.file_hash, p.status
             from courses c left join past_papers p on p.course_id = c.id
            where c.code like %s""",
        (PREFIX + "%",),
    ).fetchall()
    store.db.close()

    root = DATA  # source_file paths start with the institution folder ("pau/…")
    programmes: dict[tuple, set[str]] = defaultdict(set)
    papers: dict[tuple, dict[str, str]] = defaultdict(dict)  # (code, level) → hash → source path
    have: dict[tuple, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    folders: dict[tuple, dict[str, Path]] = defaultdict(dict)
    for r in rows:
        key = (r["code"], r["level"])
        programmes[key].add(r["programme"])
        if r["file_hash"]:
            have[key][r["programme"]].add(r["file_hash"])
            if r["status"] == "ok" and (root / r["source_file"]).exists():
                papers[key].setdefault(r["file_hash"], r["source_file"])
    # Each programme's course folder (on disk: <institution>/<school>/<programme>/<level>-level/<CODE>).
    for d in DATA.glob(f"*/*/*/*-level/{PREFIX}*"):
        level = int(d.parent.name.split("-")[0])
        folders[(d.name, level)][d.parent.parent.name] = d

    planned = []
    for key, by_hash in papers.items():
        for prog in sorted(programmes[key]):
            dest = folders[key].get(prog)
            if not dest:
                continue
            for h, src in by_hash.items():
                if h not in have[key][prog]:
                    planned.append((key, prog, dest, root / src, h))
    per_course = defaultdict(int)
    for key, *_ in planned:
        per_course[key] += 1
    for key, n in sorted(per_course.items(), key=lambda kv: -kv[1]):
        print(f"{key[0]} ({key[1]}): {n} paper cop{'y' if n == 1 else 'ies'} to add")
    print(f"Total: {len(planned)} cop{'y' if len(planned) == 1 else 'ies'}.")
    if not args.apply:
        print("\nPreview only: nothing copied. Add --apply to copy.")
        return 0

    added = 0
    for (code, _level), prog, dest, src, h in planned:
        src_dir = src.parent.parent  # the source course folder
        src_entries = yaml.safe_load((src_dir / "past_papers.yaml").read_text()) or []
        entry = next((e for e in src_entries if Path(e["file"]).name == src.name), None)
        if not entry:
            continue
        name = src.name
        target = dest / "past_papers" / name
        if target.exists():  # same name, different paper: keep both
            name = f"{src.stem}_{src_dir.parent.parent.name}{src.suffix}"
            target = dest / "past_papers" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
        review = src.with_name(src.stem + ".review.yaml")
        if review.exists():
            shutil.copy2(review, target.with_name(Path(name).stem + ".review.yaml"))
        listing = dest / "past_papers.yaml"
        entries = (yaml.safe_load(listing.read_text()) or []) if listing.exists() else []
        entries.append({**entry, "file": f"past_papers/{name}", "shared_from": src_dir.parent.parent.name})
        header = f"# {code} past papers. Paths are relative to this folder. scanned: true = needs vision OCR.\n"
        listing.write_text(header + yaml.safe_dump(entries, sort_keys=False, allow_unicode=True, width=120))
        added += 1
    print(f"\nCopied {added} paper(s). Next: npm run ingest:past -- --course <each IOH course> (reuses the stored readings).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
