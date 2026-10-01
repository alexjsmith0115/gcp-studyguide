"""The study guides in this repo and where their files live.

Each guide has a content folder and a labs folder, relative to the repo root.
The checkers take `--guide pca|pcd` (default pca). A file path argument also
selects its guide: a file under pcd/ belongs to the PCD guide.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GUIDES = {
    "pca": {"content": "content", "labs": "labs",
            "flashcard_domains": ("arch", "net", "data", "comp", "ai", "sec", "mig", "ops")},
    "pcd": {"content": os.path.join("pcd", "content"), "labs": os.path.join("pcd", "labs"),
            "flashcard_domains": ("plat", "net", "api", "evt", "sec", "iam", "data", "dio", "dev", "cicd", "run", "obs")},
}


def guide_of_path(path):
    """The guide that owns a file: 'pcd' for files under pcd/, else 'pca'."""
    rel = os.path.relpath(os.path.abspath(path), ROOT)
    return "pcd" if rel == "pcd" or rel.startswith("pcd" + os.sep) else "pca"


def select(argv, files=()):
    """Pick the guide from --guide in argv, else from the first file argument."""
    if "--guide" in argv:
        i = argv.index("--guide")
        name = argv[i + 1] if i + 1 < len(argv) else ""
        if name not in GUIDES:
            sys.exit(f"--guide must be one of {', '.join(GUIDES)}")
        return name
    for f in files:
        return guide_of_path(f)
    return "pca"


def strip_guide(argv):
    """argv without the --guide option and its value."""
    out, skip = [], False
    for a in argv:
        if skip:
            skip = False
            continue
        if a == "--guide":
            skip = True
            continue
        out.append(a)
    return out


def content_dir(name, *parts):
    return os.path.join(ROOT, GUIDES[name]["content"], *parts)


def labs_dir(name):
    return os.path.join(ROOT, GUIDES[name]["labs"])
