#!/usr/bin/env python3
"""Print a Cloud Monitoring metric over time, by using PromQL.

The script calls the Prometheus HTTP API of Cloud Monitoring (query_range) in
the project $PROJECT_ID. It gets an OAuth access token from the gcloud CLI.
It only reads data.

Example:
  python3 metrics.py --minutes 15 \
    'sum by (state) (run_googleapis_com:container_instance_count{monitored_resource="cloud_run_revision",service_name="lab72-api"})'
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://monitoring.googleapis.com/v1/projects/{}/location/global/prometheus/api/v1/query_range"


def fetch(project, query, minutes, step):
    token = subprocess.run(["gcloud", "auth", "print-access-token"],
                           capture_output=True, text=True, check=True).stdout.strip()
    end = int(time.time())
    form = {"query": query, "start": end - minutes * 60, "end": end, "step": f"{step}s"}
    request = urllib.request.Request(API.format(project), data=urllib.parse.urlencode(form).encode(),
                                     headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)["data"]["result"]


def show(result):
    if not result:
        print("No data yet. New metric points can take some minutes to appear. Try again later.")
        return
    for series in result:
        labels = {k: v for k, v in series["metric"].items() if not k.startswith("__")}
        print("Series:", ", ".join(f"{k}={v}" for k, v in sorted(labels.items())) or "(all)")
        for timestamp, value in series["values"]:
            print(f"  {time.strftime('%H:%M', time.localtime(float(timestamp)))}  {float(value):g}")


def main():
    parser = argparse.ArgumentParser(description="Print a Cloud Monitoring metric by using PromQL.")
    parser.add_argument("query", help="PromQL expression")
    parser.add_argument("--minutes", type=int, default=20, help="how far back to read (default 20)")
    parser.add_argument("--step", type=int, default=60, help="seconds between points (default 60)")
    args = parser.parse_args()
    project = os.environ.get("PROJECT_ID")
    if not project:
        sys.exit("metrics.py: PROJECT_ID is not set. Run: source labs/env.sh")
    try:
        show(fetch(project, args.query, args.minutes, args.step))
    except urllib.error.HTTPError as err:
        sys.exit(f"metrics.py: HTTP {err.code}: {err.read().decode(errors='replace')[:400]}")


if __name__ == "__main__":
    main()
