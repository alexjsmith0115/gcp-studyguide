#!/usr/bin/env python3
"""Check lab commands against the locally installed gcloud CLI.

Usage:
  python3 tools/check_labs.py                 # all labs
  python3 tools/check_labs.py labs/12-ha-vpn  # one lab folder (or file)

For every gcloud command in lab READMEs (fenced shell blocks) and *.sh files:
  - the command path must exist (from `gcloud meta list-commands`, cached in
    .cache/gcloud-commands.txt), and
  - every --flag must appear in `gcloud <command> --help`.
For every bq command, the command and each flag must appear in `bq help <command>`.
Flags before the command must be bq global flags.
It also enforces lab safety rules (no service account keys, no SSH/RDP from
0.0.0.0/0, no retention-policy locks, no hard-coded project IDs).
Comment lines, positional arguments, and flag values are not checked.
"""
import glob
import os
import re
import shlex
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import fetch_doc  # noqa: E402

REF = "https://docs.cloud.google.com/sdk/gcloud/reference/"
GLOBAL_FLAGS = {"--access-token-file", "--account", "--billing-project", "--configuration", "--flags-file",
                "--flatten", "--format", "--help", "--impersonate-service-account", "--log-http", "--project",
                "--quiet", "--trace-token", "--user-output-enabled", "--verbosity"}
CMD_CACHE = os.path.join(ROOT, ".cache", "gcloud-commands.txt")
ANSI = re.compile(r"\x1b\[[0-9;]*m")
WORD = re.compile(r"^[a-z][a-z0-9-]*$")
OPS = {"|", "||", "&&", ";", "(", ")", "&", ">", ">>", "<", "2>", "2>&1"}
TOOLS = {"gcloud", "bq"}
HELP_ENV = dict(os.environ, CLOUDSDK_CORE_DISABLE_PROMPTS="1", PAGER="cat", CLOUDSDK_ACTIVE_CONFIG_NAME="default")


def load_commands():
    if not os.path.exists(CMD_CACHE):
        print("Building gcloud command list (about 1 minute)...", file=sys.stderr)
        os.makedirs(os.path.dirname(CMD_CACHE), exist_ok=True)
        out = subprocess.run(["gcloud", "meta", "list-commands"], capture_output=True, text=True).stdout
        open(CMD_CACHE, "w").write(out)
    cmds, parents = set(), set()
    for line in open(CMD_CACHE):
        line = line.strip()
        if line.startswith("gcloud"):
            cmds.add(line)
            parts = line.split()
            for k in range(1, len(parts)):   # every proper prefix is a group
                parents.add(" ".join(parts[:k]))
    return cmds, cmds - parents   # leaves = commands that are not groups


_help = {}


def help_text(path):
    if path not in _help:
        r = subprocess.run(path.split() + ["--help"], capture_output=True, text=True, env=HELP_ENV)
        _help[path] = ANSI.sub("", r.stdout + r.stderr)
    return _help[path]


BQ_FLAG = re.compile(r"^\s*(?:-(\w),)?--(\[no\])?(\w+):", re.M)
_bq = {}


def _bq_help(argv):
    r = subprocess.run(["bq"] + argv, capture_output=True, text=True, env=HELP_ENV)
    flags = {}
    for short, neg, name in BQ_FLAG.findall(r.stdout + r.stderr):
        flags[name] = bool(neg)
        if short:
            flags[short] = bool(neg)
    return r.stdout + r.stderr, flags


def bq_flags(cmd):
    """Flags from the local bq help (no API call): `bq help <cmd>` for the
    command, `bq --help` for the global flags. Returns (command_flags,
    global_flags), or None when bq has no such command. Each maps a long or
    one-letter name to True when it is a boolean ([no]) flag."""
    if "--help" not in _bq:
        _bq["--help"] = _bq_help(["--help"])[1]
    if cmd not in _bq:
        text, flags = _bq_help(["help", cmd])
        _bq[cmd] = flags if re.search(r"^" + re.escape(cmd) + r"\s{2,}", text, re.M) else None
    return None if _bq[cmd] is None else (_bq[cmd], _bq["--help"])


def bq_flag_known(token, flags):
    """--name, --name=value, --noname (boolean), -x, or -name (absl also takes one dash)."""
    name = token.lstrip("-").split("=", 1)[0]
    if name in flags:
        return True
    return name.startswith("no") and flags.get(name[2:]) is True


def check_bq(args, where, problems):
    """bq [global flags] <command> [flags] [args]. Global flags may also follow the command."""
    glob_ = (bq_flags("query") or ({}, {}))[1]
    i = 0
    while i < len(args) and args[i].startswith("-") and args[i] != "-":
        t = args[i]
        if not bq_flag_known(t, glob_):
            problems.append(f"{where}: bq: unknown global flag {t.split('=', 1)[0]} (before the command)")
        name = t.lstrip("-").split("=", 1)[0]
        if "=" not in t and glob_.get(name) is False:
            i += 1   # a value flag written as `--flag value`: skip the value
        i += 1
    if i == len(args) or not WORD.match(args[i]):
        return
    cmd = args[i]
    flags = bq_flags(cmd)
    if flags is None:
        problems.append(f"{where}: unknown command: bq {cmd}")
        return
    known = {**flags[1], **flags[0]}
    for t in args[i + 1:]:
        if t == "--":
            break
        if t.startswith("-") and len(t) > 1 and not t[1].isdigit() and not bq_flag_known(t, known):
            problems.append(f"{where}: bq {cmd}: unknown flag {t.split('=', 1)[0]}")


_ref = {}


def ref_command(words):
    """For beta/alpha commands when the local SDK lacks that component: find the
    longest command path with a gcloud reference page. Returns (path, text), or
    (None, None). A group page (its synopsis takes COMMAND) does not count."""
    for k in range(len(words), 1, -1):
        key = " ".join(words[:k])
        if key not in _ref:
            status, final, body = fetch_doc.fetch(REF + "/".join(words[:k]))
            text = ""
            if status == 200:
                blocks = fetch_doc.extract(body, final)[2]
                text = "\n".join(fetch_doc.render(blocks))
            _ref[key] = text
        text = _ref[key]
        if text:
            synopsis = re.search(r"SYNOPSIS\n(.*)", text)
            if synopsis and "`COMMAND`" in synopsis.group(1):
                return None, None
            return "gcloud " + key, text
    return None, None


def hidden_command(words):
    """Some commands work but `gcloud meta list-commands` does not list them,
    for example the alias `gcloud config get-value`. Accept the longest path
    whose --help page names it and is not a command group."""
    for k in range(min(len(words), 5), 0, -1):
        path = "gcloud " + " ".join(words[:k])
        text = help_text(path)
        if re.search(r"NAME\s+" + re.escape(path) + r" - ", text[:400]):
            synopsis = re.search(r"SYNOPSIS\s+(.*)", text)
            if synopsis and re.search(r"\b(GROUP|COMMAND)\b", synopsis.group(1)):
                return None
            return path
    return None


def flag_known(flag, text):
    name = flag[2:]
    pats = [name]
    if name.startswith("no-"):
        pats.append(name[3:])
    for n in pats:
        if re.search(r"(?<![\w-])--(\[no-\])?" + re.escape(n) + r"(?![\w-])", text):
            return True
    return False


FENCE = re.compile(r"^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)")
SHELL_LANGS = {"", "bash", "sh", "shell", "zsh", "console"}


def shell_blocks(path):
    """Yield (start_line, text) for shell code in a README or .sh file.
    Pairs every fence (indented ones in list items too), and yields only
    shell or untagged blocks."""
    src = open(path, encoding="utf-8").read()
    if path.endswith(".sh"):
        yield 1, src
        return
    fence = None
    for n, line in enumerate(src.split("\n"), 1):
        if fence is None:
            m = FENCE.match(line)
            if m:
                fence = {"mark": m.group(2), "lang": m.group(3).lower(), "indent": len(m.group(1)), "start": n + 1, "body": []}
            continue
        mark = fence["mark"]
        if re.match(r"^[ \t]*" + re.escape(mark[0]) + "{%d,}[ \t]*$" % len(mark), line):
            if fence["lang"] in SHELL_LANGS:
                yield fence["start"], "\n".join(fence["body"])
            fence = None
            continue
        k = fence["indent"]
        fence["body"].append(line[k:] if line[:k].strip() == "" else line)
    if fence and fence["lang"] in SHELL_LANGS:
        yield fence["start"], "\n".join(fence["body"])


def substitutions(line):
    """Split out $(...) command substitutions, quoted or not. Returns the line
    with each one replaced by a placeholder word, and the inner commands."""
    out, inner, i = [], [], 0
    while i < len(line):
        if line.startswith("$(", i) and not line.startswith("$((", i):
            depth, j, q = 1, i + 2, None
            while j < len(line) and depth:
                ch = line[j]
                if q == "'":
                    if ch == "'":
                        q = None
                elif ch == "\\":
                    j += 1
                elif line.startswith("$(", j):
                    depth += 1
                    j += 1
                elif q == '"':
                    if ch == '"':
                        q = None
                elif ch in "'\"":
                    q = ch
                elif ch == "(":
                    depth += 1
                elif ch == ")":
                    depth -= 1
                j += 1
            body = line[i + 2: j - 1] if not depth else line[i + 2:]
            rest, more = substitutions(body)
            inner += [rest] + more
            out.append("SUBST")
            i = j
        else:
            out.append(line[i])
            i += 1
    return "".join(out), inner


def logical_lines(start, text):
    buf, first = "", None
    for i, raw in enumerate(text.split("\n")):
        line = raw.rstrip()
        if first is None:
            first = start + i
        if line.endswith("\\"):
            buf += line[:-1] + " "
            continue
        buf += line
        yield first, buf
        buf, first = "", None
    if buf.strip():
        yield first, buf


def invocations(line):
    """Yield (tool, args) for each gcloud or bq command on the line."""
    stripped = line.strip()
    if stripped.startswith("#"):
        return
    outer, inner = substitutions(line)
    for part in [outer] + inner:
        yield from _invocations(part)


def _invocations(line):
    try:
        lex = shlex.shlex(line, posix=True, punctuation_chars=True)
        lex.whitespace_split = True
        lex.commenters = "#"
        tokens = list(lex)
    except ValueError:
        return
    i = 0
    while i < len(tokens):
        if tokens[i] in TOOLS:
            j = i + 1
            while j < len(tokens) and tokens[j] not in OPS:
                j += 1
            yield tokens[i], tokens[i + 1: j]
            i = j
        else:
            i += 1


def check_file(path, cmds, leaves, problems):
    rel = os.path.relpath(path, ROOT)
    for start, text in shell_blocks(path):
        for lineno, line in logical_lines(start, text):
            where = f"{rel}:{lineno}"
            if line.strip().startswith("#"):
                continue   # a comment line: a warning such as "never lock the retention policy" is not a command
            if re.search(r"service-accounts\s+keys\s+create", line):
                problems.append(f"{where}: policy: do not create service account keys")
            if "0.0.0.0/0" in line and re.search(r"tcp:(22|3389)\b", line):
                problems.append(f"{where}: policy: SSH/RDP open to 0.0.0.0/0 (use IAP range 35.235.240.0/20)")
            if re.search(r"lock-retention-period|retention\s+lock", line):
                problems.append(f"{where}: policy: retention policy lock is irreversible")
            if re.search(r"--project(?:_id)?[= ]['\"]?(?!\$|bigquery-public-data)[a-z][a-z0-9-]{4,}", line):
                problems.append(f"{where}: policy: hard-coded project ID (use $PROJECT_ID)")
            for tool, args in invocations(line):
                if tool == "bq":
                    check_bq(args, where, problems)
                    continue
                words = []
                for t in args:
                    if WORD.match(t):
                        words.append(t)
                    else:
                        break
                path_ = None
                for k in range(len(words), 0, -1):
                    cand = "gcloud " + " ".join(words[:k])
                    if cand in cmds:
                        path_ = cand
                        break
                if (not path_ or path_ not in leaves) and words and words[0] in ("alpha", "beta") \
                        and "gcloud " + words[0] not in cmds:
                    # The component is not installed here: use the online reference.
                    path_, text_ = ref_command(words)
                    if not path_:
                        problems.append(f"{where}: unknown command (online reference): gcloud {' '.join(words[:5])}")
                        continue
                    for t in args:
                        if t.startswith("--") and len(t) > 2:
                            flag = t.split("=", 1)[0]
                            if flag not in GLOBAL_FLAGS and not flag_known(flag, text_):
                                problems.append(f"{where}: {path_}: unknown flag {flag} (online reference)")
                    continue
                if not path_ or path_ not in leaves:
                    path_ = hidden_command(words)
                if not path_:
                    problems.append(f"{where}: unknown command: gcloud {' '.join(words[:4])}")
                    continue
                text_ = help_text(path_)
                if "ERROR:" in text_[:300]:
                    problems.append(f"{where}: {path_} --help failed: {text_[:120].strip()}")
                    continue
                for t in args:
                    if t.startswith("--") and len(t) > 2:
                        flag = t.split("=", 1)[0]
                        if not flag_known(flag, text_):
                            problems.append(f"{where}: {path_}: unknown flag {flag}")


def main():
    targets = sys.argv[1:] or [os.path.join(ROOT, "labs")]
    files = []
    for t in targets:
        if os.path.isdir(t):
            files += glob.glob(os.path.join(t, "**", "README.md"), recursive=True)
            files += glob.glob(os.path.join(t, "**", "*.sh"), recursive=True)
        else:
            files.append(t)
    files = sorted(f for f in set(files) if not f.endswith("env.sh"))
    cmds, leaves = load_commands()
    problems = []
    for f in files:
        check_file(f, cmds, leaves, problems)
    for p in problems:
        print(p)
    print(f"\n{len(files)} files checked, {len(problems)} problems.")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
