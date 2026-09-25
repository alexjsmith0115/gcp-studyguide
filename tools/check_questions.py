#!/usr/bin/env python3
"""Validate question-bank files: schema, IDs, answers, and doc grounding.

Usage:
  python3 tools/check_questions.py content/questions/net.json [more.json ...]
  python3 tools/check_questions.py --all            # every file in content/questions/
  python3 tools/check_questions.py --all --no-evidence   # schema only (no network)

Grounding check: every question needs at least one source whose "evidence"
string appears verbatim in that page's article text, as printed by
tools/fetch_doc.py. Matching ignores case, whitespace, quote style, and
backticks.
"""
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_doc import fetch, extract, render  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAM = json.load(open(os.path.join(ROOT, "content", "exam.json")))
OBJECTIVES = {o["id"] for s in EXAM["sections"] for o in s["objectives"]}
CASES = {c["id"] for c in EXAM["caseStudies"]}
REQUIRED = ["id", "objective", "type", "difficulty", "stem", "options", "answer", "explanation", "whyWrong", "sources"]


def norm(s):
    s = s.lower().replace("`", "")
    s = re.sub(r"[‘’‚′']", "'", s)
    s = re.sub(r"[“”„″\"]", '"', s)
    s = re.sub(r"[‐-―−]", "-", s)
    s = s.replace(" ", " ")
    s = re.sub(r"[*_]", "", s)
    return re.sub(r"\s+", " ", s).strip()


_page_cache = {}


def page_text(url):
    if url not in _page_cache:
        status, final_url, body = fetch(url)
        if status != 200:
            _page_cache[url] = (status, None)
        else:
            _title, _upd, blocks, _links = extract(body, final_url)
            _page_cache[url] = (status, norm("\n".join(render(blocks))))
    return _page_cache[url]


def check_question(q, errors, warnings, evidence=True):
    qid = q.get("id", "?")
    for k in REQUIRED:
        if k not in q:
            errors.append(f"{qid}: missing field '{k}'")
    if errors and errors[-1].startswith(qid):
        return
    if q["objective"] not in OBJECTIVES:
        errors.append(f"{qid}: unknown objective {q['objective']}")
    cs = q.get("caseStudy")
    if cs is not None and cs not in CASES:
        errors.append(f"{qid}: unknown caseStudy {cs}")
    if q["type"] not in ("single", "multi"):
        errors.append(f"{qid}: type must be single or multi")
    if q["difficulty"] not in (1, 2, 3):
        errors.append(f"{qid}: difficulty must be 1, 2, or 3")
    opt_ids = [o.get("id") for o in q["options"]]
    if len(opt_ids) != len(set(opt_ids)):
        errors.append(f"{qid}: duplicate option ids")
    if not 4 <= len(opt_ids) <= 6:
        errors.append(f"{qid}: needs 4-6 options, has {len(opt_ids)}")
    for a in q["answer"]:
        if a not in opt_ids:
            errors.append(f"{qid}: answer {a} is not an option id")
    if q["type"] == "single" and len(q["answer"]) != 1:
        errors.append(f"{qid}: single-answer question has {len(q['answer'])} answers")
    if q["type"] == "multi":
        if len(q["answer"]) < 2:
            errors.append(f"{qid}: multi question needs 2+ answers")
        if not re.search(r"\(Choose (two|three)\.\)\s*$", q["stem"].strip()):
            errors.append(f"{qid}: multi question stem must end with '(Choose two.)' or '(Choose three.)'")
    for o in q["options"]:
        if re.search(r"\b(both [A-F] and [A-F]|all of the above|none of the above)\b", o.get("text", ""), re.I):
            errors.append(f"{qid}: option {o.get('id')} refers to other options; options are shuffled")
    wrong = set(opt_ids) - set(q["answer"])
    missing = wrong - set(q["whyWrong"].keys())
    if missing:
        errors.append(f"{qid}: whyWrong lacks {sorted(missing)}")
    if not q["sources"]:
        errors.append(f"{qid}: no sources")
    grounded = False
    for s in q["sources"]:
        url = s.get("url", "")
        if not url.startswith("https://"):
            errors.append(f"{qid}: bad source url {url!r}")
            continue
        if not s.get("title"):
            warnings.append(f"{qid}: source without title {url}")
        n_words = len((s.get("evidence") or "").split())
        if s.get("evidence") and not 8 <= n_words <= 40:
            errors.append(f"{qid}: evidence has {n_words} words; use 8 to 40 (SPEC section 5)")
        if not evidence:
            grounded = grounded or bool(s.get("evidence"))
            continue
        status, text = page_text(url)
        if status != 200:
            errors.append(f"{qid}: source HTTP {status} {url}")
            continue
        ev = s.get("evidence")
        if ev:
            if norm(ev) in text:
                grounded = True
            else:
                errors.append(f"{qid}: evidence not found verbatim in {url}: {ev[:90]!r}")
    if not grounded:
        errors.append(f"{qid}: no source has verified evidence")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    evidence = "--no-evidence" not in sys.argv
    files = sorted(glob.glob(os.path.join(ROOT, "content", "questions", "*.json"))) if "--all" in sys.argv else args
    if not files:
        print(__doc__)
        sys.exit(1)
    seen, total, bad = {}, 0, 0
    for f in files:
        try:
            data = json.load(open(f))
        except Exception as e:
            print(f"{f}: INVALID JSON: {e}")
            bad += 1
            continue
        if not isinstance(data, list):
            print(f"{f}: top level must be a JSON array")
            bad += 1
            continue
        for q in data:
            total += 1
            errors, warnings = [], []
            qid = q.get("id", "?")
            if qid in seen:
                errors.append(f"{qid}: duplicate id (also in {seen[qid]})")
            seen[qid] = os.path.basename(f)
            check_question(q, errors, warnings, evidence)
            for e in errors:
                print(f"ERROR {os.path.basename(f)}: {e}")
            for w in warnings:
                print(f"warn  {os.path.basename(f)}: {w}")
            bad += bool(errors)
    print(f"\n{total} questions checked, {bad} with errors.")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
