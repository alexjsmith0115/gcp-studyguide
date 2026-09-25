#!/usr/bin/env python3
"""Print the useful parts of a saved Agent Platform Pipelines run for lab 42.

The script reads a PipelineJob resource that curl saved as JSON. It prints the
run state, the service account, the pipeline root, the parameters, and the
labels. For each task, it prints the state, the run time, the custom job that
ran the step, and the output artifacts with their metadata. For an error
response, it prints the error message. It only reads a local file.

Example:
  python3 labs/42-agent-platform-pipeline/show.py "$LAB42_DIR/run1.json"
  python3 labs/42-agent-platform-pipeline/show.py --state "$LAB42_DIR/run1.json"
"""
import argparse
import calendar
import json
import sys
import time


def seconds(obj):
    """Return the time from startTime to endTime in seconds, or None."""
    def parse(ts):
        main, _, frac = ts.rstrip("Z").partition(".")
        return calendar.timegm(time.strptime(main, "%Y-%m-%dT%H:%M:%S")) + float("0." + (frac or "0"))
    if "startTime" in obj and "endTime" in obj:
        return round(parse(obj["endTime"]) - parse(obj["startTime"]))
    return None


def show_task(task):
    took = seconds(task)
    line = f"task {task.get('taskName')}: {task.get('state')}"
    if took is not None:
        line += f" in {took} s"
    main_job = task.get("executorDetail", {}).get("containerDetail", {}).get("mainJob")
    if main_job:
        line += f" (custom job {main_job.rsplit('/', 1)[-1]})"
    print(line)
    if "error" in task:
        print(f"  error: {task['error'].get('message')}")
    for key, value in task.get("execution", {}).get("metadata", {}).items():
        if key.startswith("output:"):
            print(f"  output parameter {key[len('output:'):]}: {value}")
    for key, artifacts in task.get("outputs", {}).items():
        for artifact in artifacts.get("artifacts", []):
            meta = {k: v for k, v in artifact.get("metadata", {}).items() if k != "display_name"}
            print(f"  output artifact {key}: {artifact.get('uri')}")
            if meta:
                print(f"    metadata: {json.dumps(meta)}")


def main():
    parser = argparse.ArgumentParser(description="Print a saved pipeline run.")
    parser.add_argument("file", help="the JSON file that curl saved")
    parser.add_argument("--state", action="store_true", help="print only the run state")
    args = parser.parse_args()

    with open(args.file) as f:
        job = json.load(f)
    if "name" not in job and "error" in job:
        if args.state:
            print("API_ERROR")
            return
        print(f"API error {job['error'].get('code')}: {job['error'].get('message')}")
        sys.exit(1)
    if args.state:
        print(job.get("state", "UNKNOWN"))
        return

    config = job.get("runtimeConfig", {})
    took = seconds(job)
    print(f"run: {job['name'].rsplit('/', 1)[-1]}")
    print(f"state: {job.get('state')}" + (f" in {took} s" if took is not None else ""))
    print(f"service account: {job.get('serviceAccount', '(Compute Engine default)')}")
    print(f"pipeline root: {config.get('gcsOutputDirectory')}")
    print(f"parameters: {json.dumps(config.get('parameterValues', {}))}")
    print(f"labels: {json.dumps(job.get('labels', {}))}")
    if "error" in job:
        print(f"run error: {job['error'].get('message')}")
    tasks = job.get("jobDetail", {}).get("taskDetails", [])
    for task in sorted(tasks, key=lambda t: t.get("createTime", "")):
        show_task(task)


if __name__ == "__main__":
    main()
