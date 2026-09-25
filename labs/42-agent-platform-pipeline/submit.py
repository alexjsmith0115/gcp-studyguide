#!/usr/bin/env python3
"""Submit the compiled lab 42 pipeline to Agent Platform Pipelines.

The run acts as the service account lab42-pipeline and writes its artifacts
under gs://lab42-$PROJECT_ID/pipeline-root. The script gets a short-lived OAuth
access token from the gcloud CLI, so it needs no service account key and no
Application Default Credentials. It writes the run's resource name to a file.
The optional SEED argument (default 42) sets the seed pipeline parameter.
A run with the same seed as an earlier run can reuse the cached results.

Example:
  python3 labs/42-agent-platform-pipeline/submit.py "$LAB42_DIR/pipeline.yaml" "$LAB42_DIR/run1.txt" 1234
"""
import os
import subprocess
import sys

import google.oauth2.credentials
from google.cloud import aiplatform


def main():
    if len(sys.argv) not in (3, 4):
        sys.exit("Usage: submit.py PIPELINE_YAML JOB_NAME_FILE [SEED]")
    template, job_file = sys.argv[1], sys.argv[2]
    seed = int(sys.argv[3]) if len(sys.argv) == 4 else 42
    project = os.environ["PROJECT_ID"]
    region = os.environ["REGION"]

    token = subprocess.run(["gcloud", "auth", "print-access-token"],
                           capture_output=True, text=True, check=True).stdout.strip()
    aiplatform.init(project=project, location=region,
                    credentials=google.oauth2.credentials.Credentials(token))

    job = aiplatform.PipelineJob(
        display_name="lab42-tiny-pipeline",
        template_path=template,
        pipeline_root=f"gs://lab42-{project}/pipeline-root",
        parameter_values={"rows": 1000, "seed": seed},
        enable_caching=True,
        labels={"lab": "lab42"},
    )
    job.submit(service_account=f"lab42-pipeline@{project}.iam.gserviceaccount.com")

    with open(job_file, "w") as f:
        f.write(job.resource_name + "\n")
    print(f"Submitted {job.resource_name} with seed {seed}")


if __name__ == "__main__":
    main()
