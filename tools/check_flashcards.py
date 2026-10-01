#!/usr/bin/env python3
"""Validate flashcard files: schema, IDs, notes, style limits, and doc grounding.

Usage:
  python3 tools/check_flashcards.py content/flashcards/net.json [more.json ...]
  python3 tools/check_flashcards.py --all              # every file in content/flashcards/
  python3 tools/check_flashcards.py --all --no-evidence   # no page fetches
  python3 tools/check_flashcards.py --guide pcd --all     # the PCD guide (pcd/content/flashcards/)

A file under pcd/ is checked against the PCD notes without --guide.

Rules are in content/SPEC.md section 8. The grounding check is the same as for
questions: the "evidence" string must appear verbatim in the source page's
article text (ignoring case, whitespace, quote style, and backticks). The
source URL must also appear in the card's notes page.
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_questions import norm, page_text  # noqa: E402
import guides  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTES = {}      # note id -> Markdown, for the selected guide
DOMAINS = ()    # flashcard file names (without .json) of the selected guide


def load_guide(guide):
    global DOMAINS
    NOTES.clear()
    for f in glob.glob(guides.content_dir(guide, "notes", "*.md")):
        NOTES[os.path.basename(f)[:-3]] = open(f, encoding="utf-8").read()
    DOMAINS = guides.GUIDES[guide]["flashcard_domains"]


REQUIRED = ["id", "note", "kind", "front", "back", "source"]
BANNED = re.compile(r"\b(seamless(ly)?|robust|leverag(e|es|ed|ing)|unlock(s|ed|ing)?)\b", re.I)


def plain(md):
    """Markdown to plain words, for counting."""
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", md or "")
    return re.sub(r"[`*_]", "", s)


def nwords(md):
    return len(plain(md).split())


def check_card(c, domain, errors, evidence=True):
    cid = c.get("id", "?")
    missing = [k for k in REQUIRED if k not in c]
    if missing:
        errors.append(f"{cid}: missing field(s) {missing}")
        return
    if not re.fullmatch(rf"{domain}-f\d{{3}}", cid):
        errors.append(f"{cid}: id must look like {domain}-f001 in {domain}.json")
    note = c["note"]
    if note not in NOTES:
        errors.append(f"{cid}: unknown note {note!r}")
    kind, front, back = c["kind"], str(c["front"]).strip(), str(c["back"]).strip()
    if kind == "term":
        if nwords(front) > 8:
            errors.append(f"{cid}: term front has {nwords(front)} words; use 8 or fewer")
        if front.endswith("?"):
            errors.append(f"{cid}: term front must be a name, not a question")
    elif kind == "concept":
        if nwords(front) > 20:
            errors.append(f"{cid}: concept front has {nwords(front)} words; use 20 or fewer")
        if not front.endswith("?"):
            errors.append(f"{cid}: concept front must end with '?'")
    else:
        errors.append(f"{cid}: kind must be 'term' or 'concept'")
    if not front:
        errors.append(f"{cid}: empty front")
    n = nwords(back)
    if not 3 <= n <= 60:
        errors.append(f"{cid}: back has {n} words; use 3 to 60")
    if re.search(r"\]\(|https?://", back + front):
        errors.append(f"{cid}: no links on a card; the app shows the source")
    if "\n" in back:
        errors.append(f"{cid}: back must be inline Markdown (no line breaks)")
    aws = c.get("aws")
    if aws is not None:
        if kind != "term":
            errors.append(f"{cid}: 'aws' is only for term cards")
        elif not str(aws).strip() or nwords(str(aws)) > 12:
            errors.append(f"{cid}: aws must be 1 to 12 words")
    for field in ("front", "back", "aws"):
        m = BANNED.search(str(c.get(field) or ""))
        if m:
            errors.append(f"{cid}: {field} uses the banned word {m.group(0)!r} (SPEC section 3)")
    s = c["source"]
    if not isinstance(s, dict):
        errors.append(f"{cid}: source must be an object")
        return
    url, ev = str(s.get("url", "")), str(s.get("evidence") or "")
    if not s.get("title"):
        errors.append(f"{cid}: source needs a title")
    if not url.startswith("https://"):
        errors.append(f"{cid}: bad source url {url!r}")
        return
    ne = len(ev.split())
    if not 8 <= ne <= 40:
        errors.append(f"{cid}: evidence has {ne} words; use 8 to 40")
    if note in NOTES and f"({url})" not in NOTES[note] and f"({url}#" not in NOTES[note]:
        errors.append(f"{cid}: note {note} does not cite {url}")
        return
    if not evidence or not ev:
        return
    status, text = page_text(url)
    if status != 200:
        errors.append(f"{cid}: source HTTP {status} {url}")
    elif norm(ev) not in text:
        errors.append(f"{cid}: evidence not found verbatim in {url}: {ev[:90]!r}")


def main():
    argv = guides.strip_guide(sys.argv[1:])
    args = [a for a in argv if not a.startswith("--")]
    guide = guides.select(sys.argv[1:], args)
    load_guide(guide)
    evidence = "--no-evidence" not in sys.argv
    files = sorted(glob.glob(guides.content_dir(guide, "flashcards", "*.json"))) if "--all" in sys.argv else args
    if not files:
        print(__doc__)
        sys.exit(1)
    seen_ids, seen_fronts, total, bad = {}, {}, 0, 0
    per_note = {}
    for f in files:
        domain = os.path.basename(f)[:-5]
        if domain not in DOMAINS:
            print(f"{f}: file name must be one of {', '.join(d + '.json' for d in DOMAINS)}")
            bad += 1
            continue
        try:
            data = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"{f}: INVALID JSON: {e}")
            bad += 1
            continue
        if not isinstance(data, list):
            print(f"{f}: top level must be a JSON array")
            bad += 1
            continue
        for c in data:
            total += 1
            errors = []
            cid = c.get("id", "?")
            if cid in seen_ids:
                errors.append(f"{cid}: duplicate id (also in {seen_ids[cid]})")
            seen_ids[cid] = os.path.basename(f)
            key = re.sub(r"[^a-z0-9]+", " ", plain(str(c.get("front", ""))).lower()).strip()
            if key in seen_fronts:
                errors.append(f"{cid}: same front as {seen_fronts[key]}")
            seen_fronts[key] = cid
            per_note[c.get("note")] = per_note.get(c.get("note"), 0) + 1
            check_card(c, domain, errors, evidence)
            for e in errors:
                print(f"ERROR {os.path.basename(f)}: {e}")
            bad += bool(errors)
    counts = " ".join(f"{k}:{v}" for k, v in sorted(per_note.items(), key=lambda kv: str(kv[0])))
    print(f"\n{total} cards checked, {bad} with errors.\nCards per note: {counts}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
