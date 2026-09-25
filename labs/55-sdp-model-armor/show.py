#!/usr/bin/env python3
"""Print the useful parts of a saved API response for lab 55.

The script reads one JSON file that curl or gcloud saved. It finds the type of
the response from its fields:
  - Sensitive Data Protection content:inspect: one line for each finding.
  - Sensitive Data Protection content:deidentify: the new text and a summary.
  - Sensitive Data Protection templates: the name and the configuration.
  - Model Armor sanitize result (gcloud --format=json or REST): the overall
    verdict and the result of each filter.
  - Model Armor floor setting: the enforcement state and the filters.
  - An error response: the error code and the message.
It only reads a local file. It makes no network calls.

Examples:
  python3 labs/55-sdp-model-armor/show.py "$LAB55_TMP/inspect.json"
  python3 labs/55-sdp-model-armor/show.py --text "$LAB55_TMP/deid-1.json"
"""
import argparse
import json
import sys

# Model Armor filter keys, in the order that the script prints them.
FILTER_ORDER = ["pi_and_jailbreak", "rai", "sdp", "malicious_uris", "csam"]


def load(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read().strip()
    if not raw:
        print("Empty file: the command returned no output. Read the error message above it.")
        sys.exit(1)
    try:
        return json.loads(raw)
    except ValueError:
        print("Not JSON. The file starts with:\n" + raw[:300])
        sys.exit(1)


def show_error(r):
    e = r["error"]
    print(f"API error {e.get('code')} {e.get('status', '')}: {e.get('message')}")
    sys.exit(1)


def show_findings(r):
    findings = r.get("result", {}).get("findings", [])
    print(f"{len(findings)} findings")
    for f in findings:
        quote = f.get("quote", "")
        print(f"  {f.get('infoType', {}).get('name', '?'):<27} {f.get('likelihood', '?'):<12} {quote}")


def show_deidentified(r, text_only):
    print(r.get("item", {}).get("value", ""))
    if text_only:
        return
    overview = r.get("overview", {})
    for s in overview.get("transformationSummaries", []):
        method = next(iter(s.get("transformation", {})), "?")
        counts = ", ".join(f"{x.get('code')} x{x.get('count')}" for x in s.get("results", []))
        print(f"  {s.get('infoType', {}).get('name', '?'):<27} {method:<27} {counts}")
    print(f"  transformedBytes: {overview.get('transformedBytes', 0)}")


def show_inspect_template(r):
    cfg = r.get("inspectConfig", {})
    names = ", ".join(t.get("name", "?") for t in cfg.get("infoTypes", []))
    print(r["name"])
    print(f"  infoTypes: {names}")
    print(f"  minLikelihood: {cfg.get('minLikelihood', 'POSSIBLE (default)')}")


def show_deidentify_template(r):
    print(r["name"])
    transformations = (r.get("deidentifyConfig", {}).get("infoTypeTransformations", {})
                       .get("transformations", []))
    for t in transformations:
        names = ", ".join(i.get("name", "?") for i in t.get("infoTypes", []))
        method = next(iter(t.get("primitiveTransformation", {})), "?")
        print(f"  {names} -> {method}")


def state_of(result):
    """Return the match state, or the execution state when the filter did not run."""
    execution = result.get("executionState", "")
    if execution and execution != "EXECUTION_SUCCESS":
        return execution
    return result.get("matchState", "?")


def messages(result, indent):
    for m in result.get("messageItems", []):
        print(f"{indent}message ({m.get('messageType', '?')}): {m.get('message', '')}")


def show_sdp(fr):
    sdp = fr.get("sdpFilterResult", {})
    inspect = sdp.get("inspectResult")
    if inspect is not None:
        found = ", ".join(f"{f.get('infoType')} ({f.get('likelihood', '?')})"
                          for f in inspect.get("findings", []))
        print(f"  {'sdp inspect':<18} {state_of(inspect):<16} {found}".rstrip())
        messages(inspect, "    ")
    deid = sdp.get("deidentifyResult")
    if deid is not None:
        print(f"  {'sdp deidentify':<18} {state_of(deid):<16} {', '.join(deid.get('infoTypes', []))}".rstrip())
        text = deid.get("data", {}).get("text")
        if text:
            print(f"    de-identified text: {text}")
        messages(deid, "    ")


def show_sanitize(r):
    sr = r["sanitizationResult"]
    print(f"filterMatchState: {sr.get('filterMatchState')}   invocationResult: {sr.get('invocationResult')}")
    results = sr.get("filterResults", {})
    keys = [k for k in FILTER_ORDER if k in results] + sorted(k for k in results if k not in FILTER_ORDER)
    for key in keys:
        fr = results[key]
        if key == "sdp":
            show_sdp(fr)
            continue
        inner = next(iter(fr.values()), {}) if fr else {}
        detail = ""
        if key == "rai":
            matched = [name + (f" ({v['confidenceLevel']})" if "confidenceLevel" in v else "")
                       for name, v in inner.get("raiFilterTypeResults", {}).items()
                       if v.get("matchState") == "MATCH_FOUND"]
            detail = ", ".join(matched)
        elif key == "pi_and_jailbreak" and inner.get("matchState") == "MATCH_FOUND":
            detail = f"confidence {inner.get('confidenceLevel', '?')}"
        elif key == "malicious_uris":
            detail = ", ".join(i.get("uri", "?") for i in inner.get("maliciousUriMatchedItems", []))
        print(f"  {key:<18} {state_of(inner):<16} {detail}".rstrip())
        messages(inner, "    ")
    meta = sr.get("sanitizationMetadata", {})
    if meta:
        print(f"  sanitizationMetadata: {json.dumps(meta)}")


def show_floor_setting(r):
    print(r["name"])
    print(f"  enableFloorSettingEnforcement: {json.dumps(r.get('enableFloorSettingEnforcement', False))}")
    print(f"  integratedServices: {', '.join(r.get('integratedServices', [])) or 'none'}")
    filters = sorted(r.get("filterConfig", {}))
    print(f"  filterConfig: {', '.join(filters) or 'no filters'}")
    if "aiPlatformFloorSetting" in r:
        print(f"  aiPlatformFloorSetting: {json.dumps(r['aiPlatformFloorSetting'])}")


def main():
    parser = argparse.ArgumentParser(description="Print a saved lab 55 API response.")
    parser.add_argument("file", help="JSON file that curl or gcloud saved")
    parser.add_argument("--text", action="store_true", help="print only the de-identified text")
    args = parser.parse_args()
    r = load(args.file)

    if not isinstance(r, dict):
        print(json.dumps(r, indent=2))
    elif "error" in r:
        show_error(r)
    elif "sanitizationResult" in r:
        show_sanitize(r)
    elif "result" in r:
        show_findings(r)
    elif "item" in r:
        show_deidentified(r, args.text)
    elif "inspectConfig" in r and "name" in r:
        show_inspect_template(r)
    elif "deidentifyConfig" in r and "name" in r:
        show_deidentify_template(r)
    elif str(r.get("name", "")).endswith("/floorSetting"):
        show_floor_setting(r)
    elif "inspectTemplates" in r or "deidentifyTemplates" in r:
        for t in r.get("inspectTemplates", []) + r.get("deidentifyTemplates", []):
            print(t.get("name"))
    elif not r:
        print("{} (an empty response: no items, or a successful delete)")
    else:
        print(json.dumps(r, indent=2))


if __name__ == "__main__":
    main()
