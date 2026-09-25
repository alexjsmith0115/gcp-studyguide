#!/usr/bin/env python3
"""Fetch a Google Cloud docs page and print its article text as plain Markdown.

Usage:
  python3 tools/fetch_doc.py URL                 # full article text
  python3 tools/fetch_doc.py URL --outline       # headings only
  python3 tools/fetch_doc.py URL --grep 'RPO|RTO' [--context 2]
  python3 tools/fetch_doc.py URL --links         # links inside the article
  python3 tools/fetch_doc.py URL --status        # final URL + HTTP status only

Pages are cached in .cache/docs/ (git-ignored). Exit code 2 = HTTP error.
cloud.google.com doc URLs redirect to docs.cloud.google.com; the header
prints the final URL, which is the one to cite.
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, ".cache", "docs")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) pca-studyguide-fetch/1.0"

SKIP_TAGS = {"script", "style", "svg", "template", "button", "devsite-feature-tooltip",
             "devsite-actions", "devsite-thumb-rating", "devsite-toc", "noscript"}
BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "dt", "dd", "tr",
              "pre", "blockquote", "figcaption", "caption"}


def fetch(url, refresh=False):
    os.makedirs(CACHE, exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()
    meta_path = os.path.join(CACHE, key + ".json")
    html_path = os.path.join(CACHE, key + ".html")
    if not refresh and os.path.exists(meta_path) and os.path.exists(html_path):
        try:
            meta = json.load(open(meta_path))
            return meta["status"], meta["final_url"], open(html_path, encoding="utf-8").read()
        except (ValueError, KeyError, OSError):
            pass  # partial cache entry: fetch again
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                status, final_url = r.status, r.geturl()
                body = r.read().decode("utf-8", errors="replace")
            break
        except urllib.error.HTTPError as e:
            status, final_url, body = e.code, getattr(e, "url", url), ""
            if status in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(2 ** attempt * 3)
                continue
            break
        except Exception as e:  # network error: retry, then give up without caching
            if attempt < 3:
                time.sleep(2 ** attempt * 3)
                continue
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(3)
    if status == 200 or status in (404, 410):
        # atomic writes: several processes may share the cache
        for path, data in ((html_path, body), (meta_path, json.dumps({"status": status, "final_url": final_url}))):
            tmp = f"{path}.{os.getpid()}.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(data)
            os.replace(tmp, path)
    return status, final_url, body


class ArticleParser(HTMLParser):
    def __init__(self, base_url):
        super().__init__(convert_charrefs=True)
        self.base = base_url
        self.blocks = []          # list of (kind, text)
        self.buf = []
        self.skip = 0
        self.list_depth = 0
        self.in_pre = 0
        self.pre_buf = []
        self.row = None
        self.cell = None
        self.aside = None
        self.links = []
        self.href = None
        self.link_text = []

    # -- helpers
    def flush(self, kind="p"):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            if self.aside:
                text = f"> {self.aside.upper()}: {text}"
            self.blocks.append((kind, text))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP_TAGS or "hidden" in a:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "pre":
            self.flush()
            self.in_pre += 1
            self.pre_buf = []
            return
        if self.in_pre:
            return
        if tag in ("ul", "ol"):
            self.flush()
            self.list_depth += 1
        elif tag == "aside":
            self.flush()
            self.aside = (a.get("class") or "note").split()[0]
        elif tag == "tr":
            self.flush()
            self._close_row()  # some pages leave </tr> out
            self.row = []
        elif tag in ("td", "th"):
            self._close_cell()  # some pages leave </td> out
            self.cell = []
        elif tag in BLOCK_TAGS or tag in ("div", "section", "table", "br"):
            self.flush()
        if tag == "code" and not self.in_pre:
            self._emit("`")
        if tag == "a" and a.get("href"):
            self.href = urljoin(self.base, a["href"])
            self.link_text = []
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._heading = int(tag[1])

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            if self.skip:
                self.skip -= 1
            return
        if self.skip:
            return
        if tag == "pre":
            self.in_pre = max(0, self.in_pre - 1)
            code = html.unescape("".join(self.pre_buf)).rstrip()
            if code.strip():
                self.blocks.append(("pre", code))
            return
        if self.in_pre:
            return
        if tag == "code":
            self._emit("`")
        if tag == "a" and self.href:
            text = re.sub(r"\s+", " ", "".join(self.link_text)).strip()
            if text:
                self.links.append((text, self.href))
            self.href = None
        if tag in ("td", "th"):
            self._close_cell()
            return
        if tag == "tr":
            self._close_row()
            return
        if tag == "table":
            self._close_row()
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.flush("h" + tag[1])
        elif tag == "li":
            self.flush("li%d" % max(1, self.list_depth))
        elif tag in ("ul", "ol"):
            self.flush()
            self.list_depth = max(0, self.list_depth - 1)
        elif tag == "aside":
            self.flush()
            self.aside = None
        elif tag in BLOCK_TAGS or tag in ("div", "section", "table"):
            self.flush()

    def _close_cell(self):
        if self.cell is not None and self.row is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
        self.cell = None

    def _close_row(self):
        self._close_cell()
        if self.row is not None:
            self.blocks.append(("tr", " | ".join(self.row)))
        self.row = None

    def _emit(self, s):
        if self.cell is not None:
            self.cell.append(s)
        else:
            self.buf.append(s)
        if self.href:
            self.link_text.append(s)

    def handle_data(self, data):
        if self.skip:
            return
        if self.in_pre:
            self.pre_buf.append(data)
            return
        self._emit(data)


def extract(body, final_url):
    title = re.search(r'<h1 class="devsite-page-title"[^>]*>(.*?)<', body, re.S)
    title = html.unescape(title.group(1)).strip() if title else ""
    if not title:
        t = re.search(r"<title>(.*?)</title>", body, re.S)
        title = html.unescape(t.group(1)).strip() if t else "(no title)"
    updated = re.search(r"Last updated (\d{4}-\d{2}-\d{2}) UTC", body)
    start = body.find('class="devsite-article-body')
    if start == -1:
        start = body.find("<article")
    if start == -1:
        start = body.find("<main")
    start = body.rfind("<", 0, start) if start > 0 else 0
    end = body.find("<devsite-content-footer", start)
    if end == -1:
        end = body.find("</article>", start)
    if end == -1:
        end = len(body)
    p = ArticleParser(final_url)
    p.feed(body[start:end])
    p.flush()
    return title, (updated.group(1) if updated else "unknown"), p.blocks, p.links


def render(blocks):
    out = []
    for kind, text in blocks:
        if kind.startswith("h") and kind[1:].isdigit():
            out.append("\n" + "#" * int(kind[1:]) + " " + text)
        elif kind.startswith("li"):
            depth = int(kind[2:] or 1)
            out.append("  " * (depth - 1) + "- " + text)
        elif kind == "tr":
            out.append("| " + text + " |")
        elif kind == "pre":
            out.append("```\n" + text + "\n```")
        else:
            out.append(text)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--grep", help="case-insensitive regex; print matching lines with context")
    ap.add_argument("--context", type=int, default=2, help="lines of context for --grep")
    ap.add_argument("--outline", action="store_true", help="print headings only")
    ap.add_argument("--links", action="store_true", help="print links found in the article")
    ap.add_argument("--status", action="store_true", help="print HTTP status and final URL only")
    ap.add_argument("--max", type=int, default=60000, help="max characters to print")
    ap.add_argument("--refresh", action="store_true", help="ignore cache")
    args = ap.parse_args()

    status, final_url, body = fetch(args.url, args.refresh)
    if args.status:
        print(f"{status} {final_url}")
        sys.exit(0 if status == 200 else 2)
    if status != 200:
        print(f"HTTP {status} for {args.url} (final: {final_url})")
        sys.exit(2)
    title, updated, blocks, links = extract(body, final_url)
    print(f"TITLE: {title}\nURL: {final_url}\nUPDATED: {updated}\n")
    lines = render(blocks)
    if args.links:
        seen = set()
        for text, href in links:
            if href not in seen:
                seen.add(href)
                print(f"- {text} -> {href}")
        return
    if args.outline:
        lines = [l.strip() for l in lines if l.lstrip().startswith("#")]
    elif args.grep:
        rx = re.compile(args.grep, re.I)
        heading = ""
        hits, shown = [], set()
        for i, l in enumerate(lines):
            if l.lstrip().startswith("#"):
                heading = l.strip()
            if rx.search(l):
                lo, hi = max(0, i - args.context), min(len(lines), i + args.context + 1)
                chunk = [f"[{heading}]"] if heading else []
                chunk += [lines[j] for j in range(lo, hi) if j not in shown]
                shown.update(range(lo, hi))
                hits.append("\n".join(chunk))
        lines = ["\n---\n".join(hits) if hits else "(no matches)"]
    text = "\n".join(lines).strip()
    if len(text) > args.max:
        text = text[: args.max] + f"\n\n[truncated at {args.max} chars; use --grep or --outline]"
    print(text)


if __name__ == "__main__":
    main()
