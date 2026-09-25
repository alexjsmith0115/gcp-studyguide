---
id: 42-agent-platform-pipeline
title: Run a small Agent Platform Pipelines workflow
objectives: ["2.4"]
minutes: 45
cost: "About $0.10. Each pipeline run costs $0.03, and the lab starts 2 runs. In the first run, each of the 2 steps also uses a 2-vCPU machine for a few minutes. In us-central1, these machines cost about $0.09 to $0.15 per hour, billed in 30-second increments. The second run uses cached results and starts no machines. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Compile a two-step Kubeflow Pipelines (KFP) pipeline on your computer. Run it on Agent Platform Pipelines (formerly Vertex AI Pipelines) as a dedicated service account with a custom role. Then run it again, and see execution caching skip both steps.

This lab is optional. It needs Python 3.10 or later on your computer, and the SDK installation takes a few minutes.

## Exam relevance

- Agent Platform Pipelines runs container-based ML workflows with no cluster to operate. Know when to use it and when to use Managed Service for Apache Airflow (formerly Cloud Composer): [End-to-end ML workflows on Agent Platform](note:2.4-ml-workflows).
- Execution caching and ML Metadata. A step with the same inputs reuses its earlier outputs, and each run records its lineage: [End-to-end ML workflows on Agent Platform](note:2.4-ml-workflows).
- Run pipelines as a dedicated service account with only the permissions that they need. Do not use the Compute Engine default service account: [End-to-end ML workflows on Agent Platform](note:2.4-ml-workflows), [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- Each step asks for CPU and memory, and Pipelines selects the machine type. Each run has an execution fee and a billing label: [Cost optimization and CapEx/OpEx](note:4.2-cost-optimization).
- This lab uses no GPUs or TPUs. For accelerators, see [AI Hypercomputer: accelerators and consumption models](note:2.4-ai-hypercomputer).

## Before you start

- **IAM:** you are the Owner of the lab project from `labs/00-setup`. The lab creates a service account, a custom role, a bucket, and IAM bindings.
- **Tools:** the gcloud CLI, curl, and Python 3.10 or later with the `venv` module. The lab installs the KFP SDK and the Agent Platform SDK for Python (`google-cloud-aiplatform`) in a virtual environment in a temporary folder.
- **No gcloud commands:** Agent Platform Pipelines has no gcloud commands. The lab submits runs with the Python SDK and reads them with the REST API.
- **Time:** about 45 minutes. Each run takes several minutes, because each step runs as a separate custom job on its own machine.

Open a shell in the repo root. Enable the APIs that Pipelines needs: Agent Platform, Compute Engine, and Cloud Storage.

```bash
source labs/env.sh
gcloud services enable aiplatform.googleapis.com compute.googleapis.com storage.googleapis.com \
  --project="$PROJECT_ID"
```

## Steps

1. Set the names that every step uses, and install the two SDKs in a virtual environment. The virtual environment keeps the packages out of your system Python. Run all steps in the same shell.

```bash
export LAB42_DIR="${TMPDIR:-/tmp}/lab42"
export BUCKET="lab42-${PROJECT_ID}"
export SA_EMAIL="lab42-pipeline@${PROJECT_ID}.iam.gserviceaccount.com"
export ROLE_ID="lab42_pipelineRunner"
export PY="$LAB42_DIR/venv/bin/python"
mkdir -p "$LAB42_DIR"
python3 -m venv "$LAB42_DIR/venv"
"$PY" -m pip install --quiet -r labs/42-agent-platform-pipeline/requirements.txt
"$PY" -c 'import kfp; from google.cloud import aiplatform; print("kfp", kfp.__version__, "aiplatform", aiplatform.__version__)'
```

2. Compile the pipeline to a YAML file on your computer. Pipelines runs this compiled definition, not your Python code. You can also store the file in Artifact Registry as a reusable template.

```bash
"$PY" labs/42-agent-platform-pipeline/pipeline.py "$LAB42_DIR/pipeline.yaml"
head -6 "$LAB42_DIR/pipeline.yaml"
grep -E "image:|resourceCpuLimit|resourceMemoryLimit" "$LAB42_DIR/pipeline.yaml"
```

Each step runs in the `python:3.11` container image and asks for 2 vCPUs and 8 GB of memory. Without these limits, a step runs on an e2-standard-4 machine. With them, Pipelines selects the closest supported machine type. For example, n4-standard-2 has exactly 2 vCPUs and 8 GB.

3. Create a bucket for the pipeline root. Pipelines writes the output artifacts of each run under this path. Create the bucket in the region where the runs happen.

```bash
gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" \
  --uniform-bucket-level-access --project="$PROJECT_ID"
```

4. Create a service account for the runs, and a custom role with only the permissions that a run needs. Without a service account, runs use the Compute Engine default service account, which can have the Editor role on the project.

```bash
gcloud iam service-accounts create lab42-pipeline \
  --display-name="Lab 42 pipeline runner" --project="$PROJECT_ID"
gcloud iam roles create "$ROLE_ID" --project="$PROJECT_ID" \
  --title="Lab 42 pipeline runner" --stage=GA \
  --permissions=aiplatform.metadataStores.create,aiplatform.metadataStores.get,storage.buckets.get,storage.objects.create,storage.objects.get
```

The docs list four permissions as the minimum to run a pipeline. The first run in a project creates the ML Metadata store, so it also needs `aiplatform.metadataStores.create`. Role IDs cannot contain hyphens, so the role uses the `lab42_` prefix.

If you did this lab before, the teardown kept the role, and `roles create` says that the role exists. Ignore that error. If you deleted the role in the last 7 days, run `gcloud iam roles undelete "$ROLE_ID" --project="$PROJECT_ID"`.

5. Grant the roles. The service account gets the custom role on the project and object access on the bucket. You get the Service Account User role on the service account, so that you can start runs that act as it.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role="projects/${PROJECT_ID}/roles/${ROLE_ID}" \
  --condition=None --format=none
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/storage.objectUser --format=none
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="user:$(gcloud config get-value account)" \
  --role=roles/iam.serviceAccountUser --project="$PROJECT_ID" --format=none
```

As the Owner, you already have the permissions of the Service Account User role. The last binding shows what a data scientist who is not an Owner needs.

A new service account can take 60 seconds or more to become visible. If a command says that the service account or the role does not exist, wait one minute and run the command again. IAM changes typically take effect in 2 minutes, and sometimes in 7 minutes or more.

6. Submit the first run with a random seed. The seed is a pipeline parameter, and parameter values are part of the cache key. A new seed makes sure that both steps run, even when you repeat the lab.

```bash
export SEED=$RANDOM
"$PY" labs/42-agent-platform-pipeline/submit.py "$LAB42_DIR/pipeline.yaml" "$LAB42_DIR/run1.txt" "$SEED"
```

The SDK prints the resource name of the run and a `View Pipeline Job` link. Open the link to see the graph of the two steps in the console. If the submit fails with a permission error for the service account, wait 2 minutes and run the command again.

7. Wait for the run to finish, and then print it. Pipelines has no gcloud commands, so this function reads the run with the REST API every 30 seconds.

```bash
wait_run() {  # usage: wait_run RUN_NAME_FILE RUN_JSON_FILE
  for i in $(seq 1 60); do
    curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
      "https://${REGION}-aiplatform.googleapis.com/v1/$(cat "$1")" > "$2"
    RUN_STATE="$(python3 labs/42-agent-platform-pipeline/show.py --state "$2")"
    echo "$(date +%H:%M:%S) ${RUN_STATE}"
    case "$RUN_STATE" in *SUCCEEDED|*FAILED|*CANCELLED|API_ERROR) return ;; esac
    sleep 30
  done
}
wait_run "$LAB42_DIR/run1.txt" "$LAB42_DIR/run1.json"
python3 labs/42-agent-platform-pipeline/show.py "$LAB42_DIR/run1.json"
```

The `make-data` and `summarize` tasks ran as two separate custom jobs. The `labels` line has your `lab` label and the `vertex-ai-pipelines-run-billing-id` label. Pipelines adds that label, so that billing reports can show the cost of each run.

8. List the artifacts in the pipeline root, and read the start of the dataset. Each output artifact is a Cloud Storage object, and ML Metadata records which step made it.

```bash
gcloud storage ls "gs://${BUCKET}/pipeline-root/**"
gcloud storage cat "$(gcloud storage ls "gs://${BUCKET}/pipeline-root/**/data" | head -1)" | head -4
```

The dataset starts with the header `x`, and then one random number on each line.

9. Submit a second run with the same seed. Every step has the same inputs as in the first run, so Pipelines reuses the cached outputs from ML Metadata and skips the steps.

```bash
"$PY" labs/42-agent-platform-pipeline/submit.py "$LAB42_DIR/pipeline.yaml" "$LAB42_DIR/run2.txt" "$SEED"
wait_run "$LAB42_DIR/run2.txt" "$LAB42_DIR/run2.json"
python3 labs/42-agent-platform-pipeline/show.py "$LAB42_DIR/run2.json"
```

Both tasks show `SKIPPED`, and neither task has a custom job. You pay the $0.03 run fee, but no machine time. To see both steps run again, submit a third run with a new seed, such as `"$RANDOM"`. That run costs the same as the first run.

## Check your work

```bash
python3 labs/42-agent-platform-pipeline/show.py "$LAB42_DIR/run1.json" | grep -E "^(state|task)"
python3 labs/42-agent-platform-pipeline/show.py "$LAB42_DIR/run2.json" | grep -E "^(state|task)"
```

Expected: both runs show `state: PIPELINE_STATE_SUCCEEDED`. In the first run, `make-data` and `summarize` show `SUCCEEDED`. In the second run, they show `SKIPPED`. The list can also show one task for the whole pipeline.

```bash
gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
  --filter="bindings.members:${SA_EMAIL}" --format="value(bindings.role)"
gcloud storage buckets get-iam-policy "gs://${BUCKET}" --flatten="bindings[].members" \
  --format="value(bindings.role,bindings.members)" | grep lab42-pipeline
```

Expected: only `projects/<your project ID>/roles/lab42_pipelineRunner` on the project, and `roles/storage.objectUser` on the bucket.

## Explore

1. New rows arrive in a BigQuery table at irregular times. The team wants the training pipeline to run when new data arrives. How do you start the runs?

<details><summary>Answer</summary>

Use an event trigger. A Cloud Run function (formerly Cloud Functions) with an Eventarc trigger can run the pipeline when new data is inserted into the BigQuery dataset. Another documented pattern is a function that subscribes to a Pub/Sub topic and submits the run with the Agent Platform SDK. The scheduler API fits data that arrives on a regular schedule. The function's own service account needs permission to create runs, and the Service Account User role on the pipeline service account.

</details>

2. A security review finds that all pipeline runs in a project use the Compute Engine default service account. What is the risk, and what do you change?

<details><summary>Answer</summary>

Depending on the organization policy, the default service account can have the Editor role on the project. Then every pipeline step can change almost any resource in the project. Create a dedicated service account for the pipelines. Grant it a custom role with only the permissions that the runs need, and object access on the pipeline root bucket. Grant the Service Account User role on it only to the people who start runs. In an organization, enforce the `iam.automaticIamGrantsForDefaultServiceAccounts` constraint, so that default service accounts get no Editor role.

</details>

3. A step reads the newest rows from BigQuery with a fixed query and has no parameters. After the first run, the step shows `SKIPPED` in every run, and the model gets no new data. Why, and how do you fix it?

<details><summary>Answer</summary>

Execution caching skips the step. The cache key includes the input parameter values, the input artifact IDs, the output definitions, and the component specification. This step has the same key in every run, and cached results have no time to live. Pass the date or a snapshot ID as a parameter, or turn off caching for that task with `set_caching_options(False)`. Google recommends deterministic components: the same inputs always give the same output.

</details>

4. A pipeline has a light data preparation step and a training step that needs a GPU and a large amount of memory. How do you size the machines?

<details><summary>Answer</summary>

Set the resources on each step, not on the whole pipeline. On the training step, use `set_cpu_limit`, `set_memory_limit`, `set_accelerator_type`, and `set_accelerator_limit`. Leave the light step small. Pipelines selects the closest supported machine type for each step. To set the disk size too, run the training step as a custom training job instead.

</details>

## Clean up

Run the teardown script:

```bash
bash labs/42-agent-platform-pipeline/teardown.sh
```

The script does these things:

- It cancels the lab 42 runs that are still running, and it deletes the finished lab 42 runs. If a run was still running, run the script again after a few minutes.
- It deletes the bucket `lab42-<your project ID>` and all artifacts in it.
- It removes the project binding for the custom role, and it deletes the `lab42-pipeline` service account.
- It deletes the local work folder `${TMPDIR:-/tmp}/lab42`, which holds the virtual environment.

The script keeps these resources:

- The custom role `lab42_pipelineRunner`. It has no bindings and costs nothing. After you delete a role, you cannot create a role with the same ID until Google deletes it permanently, up to 44 days later. To delete the role anyway, run `bash labs/42-agent-platform-pipeline/teardown.sh --delete-role`. You can undelete a deleted role for 7 days.
- The default ML Metadata store in your region. Pipelines created it on the first run, and it holds a few KB of lineage and cache records. ML Metadata costs $10 per GiB per month, so these records cost less than $0.01.
- The APIs that you enabled.

## Docs used

- [Introduction to Agent Platform Pipelines](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/introduction)
- [Configure your project for Agent Platform Pipelines](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/configure-project)
- [Build a pipeline](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/build-pipeline)
- [Run a pipeline](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/run-pipeline)
- [Specify the machine configuration for a pipeline step](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/machine-types)
- [Configure execution caching](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/configure-caching)
- [Trigger a pipeline run with Pub/Sub](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/trigger-pubsub)
- [Build a pipeline for continuous model training](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/pipelines/continuous-training-tutorial)
- [REST resource: projects.locations.pipelineJobs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.pipelineJobs)
- [Method: pipelineJobs.list](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.pipelineJobs/list)
- [Configure compute resources for serverless training](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/training/configure-compute)
- [Gemini Enterprise Agent Platform pricing](https://cloud.google.com/products/gemini-enterprise-agent-platform/pricing)
- [MLOps: Continuous delivery and automation pipelines in machine learning](https://docs.cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning)
- [Create and manage custom roles](https://docs.cloud.google.com/iam/docs/creating-custom-roles)
- [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [Service accounts for Compute Engine](https://docs.cloud.google.com/compute/docs/access/service-accounts)
- [gcloud storage ls](https://docs.cloud.google.com/sdk/gcloud/reference/storage/ls)
