#!/usr/bin/env python3
"""Check every external link in the study content.

Scans notes, case studies, reference pages, lab READMEs, and question sources. For each URL:
  - fetches it with fetch_doc (cached in .cache/docs/) and reports HTTP errors,
  - reports links that redirect to another page (cite the final URL instead),
  - warns when a #fragment is not an id on the page,
  - warns when the host is not an allowed source (content/SPEC.md, rule 2.1).

Usage:
  python3 tools/check_links.py            # check everything in the PCA guide
  python3 tools/check_links.py --guide pcd   # check everything in the PCD guide
  python3 tools/check_links.py FILE...    # check some files
  python3 tools/check_links.py --refresh  # ignore the cache
Exit code 1 when a link is broken.
"""
import argparse
import glob
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urldefrag, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_doc  # noqa: E402
import guides  # noqa: E402

ROOT = fetch_doc.ROOT
URL_RE = re.compile(r"https?://[^\s<>\"'`)\]]+")
# Links that are not sources and need a sign-in: do not fetch them.
NO_FETCH_HOSTS = {"console.cloud.google.com", "shell.cloud.google.com", "docs.google.com"}


def allowed(url, guide="pca"):
    u = urlparse(url)
    host, path = u.netloc.lower(), u.path
    if host in ("docs.cloud.google.com", "cloud.google.com", "sre.google") or host.endswith(".cloud.google.com"):
        return True
    if host == "support.google.com" and path.startswith("/cloud"):
        return True
    if host == "services.google.com" and path.startswith("/fh/files/misc/"):
        return True
    if guide == "pcd":
        # The PCD guide also allows Google's developer docs, the API design guide (AIPs),
        # the Firebase docs for Firestore and Identity Platform, Kubernetes docs, the Gen AI SDK reference,
        # and the Python reference for google-api-core and google-auth
        # (pcd/content/SPEC.md, rule 2.1).
        if host in ("developers.google.com", "google.aip.dev") or (host == "firebase.google.com" and path.startswith("/docs")):
            return True
        if host == "kubernetes.io" and path.startswith("/docs"):
            return True
        if host == "googleapis.github.io" and path.startswith("/python-genai"):
            return True
        if host == "googleapis.dev" and path.startswith("/python/"):
            return True
    return host in NO_FETCH_HOSTS


def default_files(guide="pca"):
    c, labs = guides.GUIDES[guide]["content"], guides.GUIDES[guide]["labs"]
    pats = [f"{c}/notes/*.md", f"{c}/case-studies/*.md", f"{c}/reference/*.md", f"{labs}/*/README.md",
            f"{c}/questions/*.json", f"{c}/flashcards/*.json"]
    return sorted(f for p in pats for f in glob.glob(os.path.join(ROOT, p)))


def urls_in(path):
    text = open(path, encoding="utf-8").read()
    if path.endswith(".json"):
        found = []
        for q in json.loads(text):
            for s in q.get("sources", []) + ([q["source"]] if isinstance(q.get("source"), dict) else []):
                if s.get("url"):
                    found.append((s["url"], q.get("id", "?")))
        return found
    out = []
    fence = None
    for n, line in enumerate(text.splitlines(), 1):
        m = re.match(r"\s*(```+|~~~+)", line)
        if m:  # URLs inside code blocks are commands, not citations
            fence = None if fence and m.group(1).startswith(fence) else (fence or m.group(1))
            continue
        if fence:
            continue
        line = re.sub(r"`[^`]*`", "", line)
        for m in URL_RE.finditer(line):
            out.append((m.group(0).rstrip(".,;:"), f"line {n}"))
    return out


def check(url, refresh):
    base, frag = urldefrag(url)
    try:
        status, final, body = fetch_doc.fetch(base, refresh)
    except BaseException as e:  # fetch_doc exits on network errors
        return url, None, None, f"network error: {e!r}"
    note = None
    if status == 200 and frag and not base.lower().endswith(".pdf"):
        if not re.search(r'\b(?:id|name)=["\']%s["\']' % re.escape(frag), body):
            note = f"anchor #{frag} not found on the page"
    return url, status, final, note


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--guide", choices=sorted(guides.GUIDES))
    args = ap.parse_args()
    guide = args.guide or (guides.guide_of_path(args.files[0]) if args.files else "pca")
    files = [os.path.abspath(f) for f in args.files] or default_files(guide)

    where = {}
    for f in files:
        for url, loc in urls_in(f):
            where.setdefault(url, []).append(f"{os.path.relpath(f, ROOT)}:{loc}")

    errors, warnings = [], []
    to_fetch = []
    for url in sorted(where):
        if not allowed(url, guide):
            warnings.append((url, "host is not an allowed source (SPEC rule 2.1)"))
        if urlparse(url).netloc.lower() not in NO_FETCH_HOSTS:
            to_fetch.append(url)

    with ThreadPoolExecutor(max_workers=8) as pool:
        for url, status, final, note in pool.map(lambda u: check(u, args.refresh), to_fetch):
            if status is None:
                errors.append((url, note))
                continue
            if status != 200:
                errors.append((url, f"HTTP {status}"))
                continue
            base = urldefrag(url)[0]
            if final and final.rstrip("/") != base.rstrip("/"):
                # cloud.google.com -> docs.cloud.google.com is expected; flag other moves.
                moved = base.replace("://cloud.google.com/", "://docs.cloud.google.com/", 1)
                if final.rstrip("/") != moved.rstrip("/"):
                    warnings.append((url, f"redirects to {final}"))
            if note:
                warnings.append((url, note))

    for label, items in (("BROKEN", errors), ("WARN", warnings)):
        for url, msg in items:
            print(f"{label}: {url}\n    {msg}\n    in: {', '.join(where[url][:4])}{' …' if len(where[url]) > 4 else ''}")
    print(f"\n{len(where)} unique links in {len(files)} files: {len(errors)} broken, {len(warnings)} warnings.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
