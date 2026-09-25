#!/usr/bin/env bash
# Lab 64 teardown: deletes the Migration Center items that the lab created.
# Migration Center has no gcloud commands, so this script calls the REST API.
# It deletes only items whose ID or display name starts with "lab64-", and
# assets whose machine name starts with "lab64-". Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

export MC_REGION="${MC_REGION:-$REGION}"
MC_TOKEN="$(gcloud auth print-access-token)" || exit 1
export MC_TOKEN
echo "Migration Center region: $MC_REGION"

python3 - <<'EOF' || true
import json, os, sys, time, urllib.error, urllib.request

API = "https://migrationcenter.googleapis.com/v1/"
PARENT = "projects/%s/locations/%s" % (os.environ["PROJECT_ID"], os.environ["MC_REGION"])
HEADERS = {"Authorization": "Bearer " + os.environ["MC_TOKEN"], "Content-Type": "application/json"}


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print("  %s %s: HTTP %d %s" % (method, path, e.code, e.read()[:200].decode(errors="replace")), file=sys.stderr)
        return {}


def items(path, key, query=""):
    out, token = [], ""
    while True:
        sep = "&" if query else ""
        page = call("GET", path + "?" + query + (sep + "pageToken=" + token if token else ""))
        out += page.get(key, [])
        token = page.get("nextPageToken", "")
        if not token:
            return out


def is_lab(item):
    return (item.get("name", "").rsplit("/", 1)[-1].startswith("lab64-")
            or item.get("displayName", "").startswith("lab64-"))


def wait(op):
    for _ in range(60):
        if not op.get("name") or op.get("done"):
            return
        time.sleep(5)
        op = call("GET", op["name"])


def delete(name, query=""):
    print("Deleting " + name)
    wait(call("DELETE", name + query))


# 1. Reports first, because they use the groups and the preference sets.
for cfg in items(PARENT + "/reportConfigs", "reportConfigs"):
    reports = items(cfg["name"] + "/reports", "reports")
    if is_lab(cfg) or (reports and all(is_lab(r) for r in reports)):
        delete(cfg["name"], "?force=true")
    else:
        for r in reports:
            if is_lab(r):
                delete(r["name"])

# 2. Groups.
for g in items(PARENT + "/groups", "groups"):
    if is_lab(g):
        delete(g["name"])

# 3. Preference sets. The default set does not start with lab64- and stays.
for p in items(PARENT + "/preferenceSets", "preferenceSets"):
    if is_lab(p):
        delete(p["name"])

# 4. File import jobs. Deleting a job also reverts the assets that it created.
for j in items(PARENT + "/importJobs", "importJobs"):
    if is_lab(j):
        delete(j["name"], "?force=true")

# 5. Any lab asset that is still there.
names = [a["name"] for a in items(PARENT + "/assets", "assets", "view=ASSET_VIEW_FULL")
         if a.get("machineDetails", {}).get("machineName", "").startswith("lab64-")]
if names:
    print("Deleting %d assets" % len(names))
    call("POST", PARENT + "/assets:batchDelete", {"names": names, "allowMissing": True})

print("Done. Migration Center stays activated in region " + os.environ["MC_REGION"] + ".")
EOF
