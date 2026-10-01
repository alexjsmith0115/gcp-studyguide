---
id: 22-workflows-tasks-scheduler
title: Orchestrate services with Workflows, Cloud Tasks, and Cloud Scheduler
objectives: ["1.1"]
minutes: 60
cost: "Less than $0.10 if you run teardown.sh when done. Workflows (5,000 internal steps each month), Cloud Tasks (1 million operations each month), Cloud Scheduler (3 jobs for each billing account), Cloud Run, and Cloud Build have free tiers."
requiresOrg: false
---

## Goal

Call a private Cloud Run service from a workflow, with a retry policy for temporary errors and an `except` block for a business error. Then send work to the same service through a Cloud Tasks queue with rate limits and retries, and start the workflow from a Cloud Scheduler job.

## Exam relevance

- Workflows (steps, `http.post` with OIDC, `retry`, `try`/`except`, compensation), Cloud Tasks (rate limits, retries, task names for deduplication, HTTP targets with OIDC tokens), and Cloud Scheduler (cron jobs that call the Workflow Executions API). See [Orchestrating services with Workflows, Cloud Tasks, and Cloud Scheduler](note:1.1-orchestration).
- Cloud Tasks compared with Pub/Sub: explicit invocation compared with implicit invocation. See [Asynchronous and event-driven integration with Pub/Sub and Eventarc](note:1.1-async-events).
- One service account for each caller, with one narrow role. OIDC tokens for Cloud Run, and OAuth tokens for `*.googleapis.com`. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege) and [Secure service-to-service communication](note:1.2-service-to-service).
- Which errors to retry, and backoff settings. See [Efficient and resilient API calls](note:4.2-efficient-api-calls).

## Before you start

- Complete [00-setup](lab:00-setup) first. It makes `source pcd/labs/env.sh` work and enables the base APIs. It also gives the Compute Engine default service account the Cloud Run Builder role, which deploys from source need.
- **IAM:** you are the Owner of the lab project. To attach a service account to a workflow, a task, or a job, a principal needs the `iam.serviceAccounts.actAs` permission on that service account, for example through Service Account User (`roles/iam.serviceAccountUser`).
- **Tools:** the gcloud CLI.
- **Time:** about 60 minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs that this lab adds to the base APIs from 00-setup.

```bash
source pcd/labs/env.sh
gcloud services enable workflows.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com
```

## Steps

1. Set the lab variables. If you open a new shell, run `source pcd/labs/env.sh` and this block again. After you delete a queue, Cloud Tasks blocks its name for 3 days. For Cloud Scheduler job names, the docs do not agree. The gcloud steps say that you cannot use a job name again in a project, even after you delete the job. The console steps say that you can. So the lab adds a time stamp to these two names, and this block finds them again in a new shell.

```bash
export RUN_SA="lab22-steps@${PROJECT_ID}.iam.gserviceaccount.com"
export WF_SA="lab22-workflow@${PROJECT_ID}.iam.gserviceaccount.com"
export TASKS_SA="lab22-tasks@${PROJECT_ID}.iam.gserviceaccount.com"
export SCHEDULER_SA="lab22-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
export TASKS_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
export LOG_FILTER='resource.type="cloud_run_revision" AND resource.labels.service_name="lab22-steps" AND jsonPayload.message:"lab22"'
export QUEUE="$(gcloud tasks queues list --location="$REGION" --filter='name~/queues/lab22-' --format='value(name.basename())' | head -1)"
export QUEUE="${QUEUE:-lab22-queue-$(date +%Y%m%d%H%M)}"
export JOB="$(gcloud scheduler jobs list --location="$REGION" --filter='name~/jobs/lab22-' --format='value(name.basename())' | head -1)"
export JOB="${JOB:-lab22-job-$(date +%Y%m%d%H%M)}"
echo "queue=${QUEUE} job=${JOB}"
```

2. Read the service, then deploy it as a private service. It has one endpoint for each step of an order. `--max=1` keeps one instance, so that the in-memory counter that simulates a short outage works.

```bash
cat pcd/labs/22-workflows-tasks-scheduler/app/main.py
gcloud iam service-accounts create lab22-steps --display-name="lab22 steps service identity"
gcloud run deploy lab22-steps \
  --source=pcd/labs/22-workflows-tasks-scheduler/app \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --no-allow-unauthenticated \
  --max=1
export URL="$(gcloud run services describe lab22-steps --region="$REGION" --format='value(status.url)')"
```

If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`.

If the source deploy fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deploys from source. Grant the role as in 00-setup. The grant takes a few minutes to propagate, so wait a few minutes before you run the deploy again. `teardown.sh` does not remove this grant, because other labs need it.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

3. Create one service account for each caller, and give each one only the role that it needs.

```bash
gcloud iam service-accounts create lab22-workflow --display-name="lab22 workflow identity"
gcloud iam service-accounts create lab22-tasks --display-name="lab22 Cloud Tasks token identity"
gcloud iam service-accounts create lab22-scheduler --display-name="lab22 Cloud Scheduler identity"
gcloud run services add-iam-policy-binding lab22-steps --region="$REGION" \
  --member="serviceAccount:${WF_SA}" --role=roles/run.invoker
gcloud run services add-iam-policy-binding lab22-steps --region="$REGION" \
  --member="serviceAccount:${TASKS_SA}" --role=roles/run.invoker
gcloud iam service-accounts add-iam-policy-binding "$TASKS_SA" \
  --member="serviceAccount:${TASKS_AGENT}" --role=roles/iam.serviceAccountUser
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SCHEDULER_SA}" --role=roles/workflows.invoker --condition=None
```

| Principal | Role | Scope | Why |
|---|---|---|---|
| `lab22-workflow` | Cloud Run Invoker | The `lab22-steps` service | The workflow calls the service with an ID token (OIDC) for this account. |
| `lab22-tasks` | Cloud Run Invoker | The `lab22-steps` service | Cloud Tasks calls the service with an ID token for this account. |
| Cloud Tasks service agent | Service Account User | The `lab22-tasks` service account | The Cloud Tasks docs require this grant, so that Cloud Tasks can create tokens for `lab22-tasks`. |
| `lab22-scheduler` | Workflows Invoker | Project | Cloud Scheduler starts executions through the Workflow Executions API. |

If a binding fails because the service account does not exist yet, wait one minute and run the command again.

4. Read the workflow, then deploy it with its own service account and an environment variable for the service URL. Without `--service-account`, the workflow runs as the Compute Engine default service account. Google recommends that only for testing and development.

```bash
cat pcd/labs/22-workflows-tasks-scheduler/workflow.yaml
gcloud workflows deploy lab22-order --location="$REGION" \
  --source=pcd/labs/22-workflows-tasks-scheduler/workflow.yaml \
  --service-account="$WF_SA" \
  --set-env-vars="STEPS_URL=${URL}"
```

The workflow uses OIDC because the target is Cloud Run. The Workflows docs say that the audience should be the root URL of the service, so the workflow sets `audience` to `STEPS_URL` and not to the URL of each endpoint.

5. Run the workflow with a normal order. `gcloud workflows run` waits until the execution completes.

```bash
gcloud workflows run lab22-order --location="$REGION" --data='{"order_id": "o-1", "amount": 30}'
gcloud logging read "$LOG_FILTER" --freshness=10m --limit=5 \
  --format='table(timestamp, jsonPayload.message, jsonPayload.order_id, jsonPayload.call)'
```

The execution has `state: SUCCEEDED`, and the `result` has `"status":"confirmed"`. The log shows, newest first: `charge 200`, `reserve 200` (call 3), and two `reserve 503` entries. The retry policy retried the `503` answers after 1 second and then 2 seconds. Each retry counts as a step for pricing.

6. Run the workflow with an amount that the payment step declines.

```bash
gcloud workflows run lab22-order --location="$REGION" --data='{"order_id": "o-2", "amount": 500}'
gcloud logging read "$LOG_FILTER AND jsonPayload.order_id=\"o-2\"" --freshness=10m --limit=5 \
  --format='table(timestamp, jsonPayload.message)'
gcloud workflows executions list lab22-order --location="$REGION" --limit=5
```

The execution has `state: SUCCEEDED`, and the `result` has `"status":"declined"`. Workflows raised an `HttpError` for the `402`, because it treats any status of 400 or more as a failed call. The `except` block caught it, called `/release` to undo the reservation, and returned a result. The `charge` step has no retry policy. Even `http.default_retry_predicate` does not retry a `402`: it retries only 429, 502, 503, 504, connection errors, and timeouts. Any other error goes to `unhandled_exception`, and the execution fails.

7. Create a Cloud Tasks queue with rate limits and retry settings. `--log-sampling-ratio=1.0` writes every task operation to Cloud Logging.

```bash
gcloud tasks queues create "$QUEUE" --location="$REGION" \
  --max-dispatches-per-second=1 --max-concurrent-dispatches=1 \
  --max-attempts=5 --min-backoff=2s --max-backoff=10s \
  --log-sampling-ratio=1.0
gcloud tasks queues describe "$QUEUE" --location="$REGION" --format='yaml(rateLimits, retryConfig, state)'
```

| Flag | Lab value | Default | What it does |
|---|---|---|---|
| `--max-dispatches-per-second` | 1 | 500 | The rate at which the queue refills its token bucket. Each dispatch uses one token. |
| `--max-concurrent-dispatches` | 1 | 1,000 | The maximum number of tasks that run at the same time. |
| `--max-attempts` | 5 | 100 | The maximum number of attempts for a task, including the first. |
| `--min-backoff`, `--max-backoff` | 2s, 10s | 0.1s, 3600s | The wait between attempts. It doubles up to `--max-doublings` times (default 16). |

8. Create a task with a name. The task calls `/notify` with an ID token for `lab22-tasks`. The body tells the handler to fail the first 2 attempts.

```bash
gcloud tasks create-http-task email-o-1 --queue="$QUEUE" --location="$REGION" \
  --url="${URL}/notify" --method=POST \
  --header="Content-Type: application/json" \
  --body-content='{"order_id": "o-1", "fail_first": 2}' \
  --oidc-service-account-email="$TASKS_SA" --oidc-token-audience="$URL"
```

Run the same command again. It fails, because a task with this name already exists. Cloud Tasks remembers a task name for up to 24 hours after it deletes the task. So a task name is a deduplication key: a client can retry the create request safely. If you do not give a name, Cloud Tasks makes a unique name, and does no deduplication.

9. Wait 30 seconds, then read the log entries for the task.

```bash
gcloud logging read "$LOG_FILTER AND jsonPayload.task=\"email-o-1\"" --freshness=10m --limit=5 \
  --format='table(timestamp, jsonPayload.message, jsonPayload.retry_count)'
```

Newest first: `notify 200` with `retry_count` 2, then two `notify 503` entries with `retry_count` 1 and 0. The handler reads the `X-CloudTasks-TaskRetryCount` header. Any status outside 200-299 makes Cloud Tasks retry the task. After a success, Cloud Tasks deletes the task.

10. Add 4 tasks with no name, and watch the rate limit. Each task takes 2 seconds in the handler, and the queue runs only one task at a time.

```bash
for i in 1 2 3 4; do
  gcloud tasks create-http-task --queue="$QUEUE" --location="$REGION" \
    --url="${URL}/notify" --method=POST \
    --header="Content-Type: application/json" \
    --body-content="{\"order_id\": \"batch-${i}\"}" \
    --oidc-service-account-email="$TASKS_SA" --oidc-token-audience="$URL"
done
gcloud tasks list --queue="$QUEUE" --location="$REGION"
```

The list shows the tasks that still wait in the queue. Wait 30 seconds, then read the log:

```bash
gcloud logging read "$LOG_FILTER AND jsonPayload.order_id:\"batch\"" --freshness=10m --limit=4 \
  --format='table(timestamp, jsonPayload.message, jsonPayload.order_id, jsonPayload.task)'
```

There are four `notify 200` entries, at least 2 seconds apart. The task names are IDs that Cloud Tasks generated.

11. Create a Cloud Scheduler job that starts the workflow every Monday at 09:00, New York time. The job calls the Workflow Executions API, which is on `googleapis.com`, so it uses an OAuth access token and not an OIDC token. Workflows, Cloud Tasks, and Cloud Scheduler use the same rule: an OIDC token for a Cloud Run target, and an OAuth token for a `*.googleapis.com` target.

```bash
gcloud scheduler jobs create http "$JOB" --location="$REGION" \
  --schedule="0 9 * * 1" --time-zone="America/New_York" \
  --uri="https://workflowexecutions.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/workflows/lab22-order/executions" \
  --http-method=POST \
  --message-body='{"argument": "{\"order_id\": \"weekly\", \"amount\": 20}"}' \
  --oauth-service-account-email="$SCHEDULER_SA"
```

| Flag | What it does |
|---|---|
| `--schedule` | A unix-cron schedule. `0 9 * * 1` is minute 0, hour 9, every Monday. |
| `--time-zone` | The time zone for the schedule. The default is `Etc/UTC`. |
| `--message-body` | The request body. `argument` is the workflow input, as a JSON string inside JSON. |
| `--oauth-service-account-email` | The identity of the job. Without `--oauth-token-scope`, the scope is `https://www.googleapis.com/auth/cloud-platform`. |

The job does not retry a failed run, because `--max-retry-attempts` and `--max-retry-duration` both default to 0. A failed run then waits for the next scheduled time. To retry, set `--max-retry-attempts` to a value from 1 to 5.

12. Run the job now, instead of waiting until Monday. Wait 30 seconds, then look for the new execution and its calls to the service.

```bash
gcloud scheduler jobs run "$JOB" --location="$REGION"
```

```bash
gcloud workflows executions list lab22-order --location="$REGION" --limit=3
gcloud logging read "$LOG_FILTER AND jsonPayload.order_id=\"weekly\"" --freshness=10m --limit=5 \
  --format='table(timestamp, jsonPayload.message)'
```

The newest execution has the state `SUCCEEDED`. The service log shows `reserve` and `charge` calls for the order `weekly`.

## Check your work

```bash
gcloud workflows describe lab22-order --location="$REGION" --format='yaml(serviceAccount, userEnvVars)'
gcloud workflows executions list lab22-order --location="$REGION" --limit=5
gcloud tasks queues describe "$QUEUE" --location="$REGION" --format='yaml(rateLimits, retryConfig)'
gcloud scheduler jobs describe "$JOB" --location="$REGION" \
  --format='yaml(schedule, timeZone, httpTarget.uri, httpTarget.oauthToken)'
gcloud run services get-iam-policy lab22-steps --region="$REGION"
```

Expected output:

- The workflow uses `lab22-workflow`, and has the environment variable `STEPS_URL`.
- The three executions (for `o-1`, `o-2`, and `weekly`) have the state `SUCCEEDED`.
- The queue has `maxDispatchesPerSecond: 1.0`, `maxConcurrentDispatches: 1`, and `maxAttempts: 5`.
- The job has the schedule `0 9 * * 1`, the time zone `America/New_York`, the Workflow Executions URI, and an `oauthToken` for `lab22-scheduler`.
- The service gives `roles/run.invoker` only to `lab22-workflow` and `lab22-tasks`. There is no binding for `allUsers`.

## Explore

1. Labs 20 and 21 let services react to events. This lab calls the services from a workflow. When do you choose each approach?

<details><summary>Answer</summary>

In an event-driven architecture, producers do not know the consumers. A router such as Eventarc or Pub/Sub sends each event to the consumers. This gives loose coupling, fan-out to many consumers, and independent deployment. But you can track the flow only at run time, with monitoring. Workflows runs services in an order that you define. It makes the dependencies between services explicit and observable from start to end, and it gives one definition of the process. A workflow can keep state, retry, and wait for up to a year. Use a workflow when the steps depend on each other, need error handling across steps, or need compensation, as in this order process. Use events when independent consumers react to a change.

</details>

2. When do you use Cloud Tasks, and when Pub/Sub?

<details><summary>Answer</summary>

The main difference is explicit compared with implicit invocation. With Cloud Tasks, the producer chooses the endpoint for each task and keeps control of the execution. With Pub/Sub, the publisher does not know the subscribers.

| Feature | Cloud Tasks | Pub/Sub |
|---|---|---|
| Deduplication when you create a task or message | Yes, with task names | No |
| Scheduled delivery | Yes | No |
| Explicit rate controls | Yes | Pull subscribers can use flow control |
| More than one handler for each message | No | Yes |
| Ordered delivery | No, only best effort | Yes, with ordering keys |
| Maximum size | 1 MB | 10 MB |
| Maximum delivery rate | 500 tasks per second for each queue | No upper limit, subject to regional quotas |

Use Cloud Tasks to call one service at a controlled rate, for example to protect a slow downstream API. Use Pub/Sub to send events to many independent subscribers.

</details>

3. Why does the workflow retry `/reserve`, but catch the error from `/charge`?

<details><summary>Answer</summary>

A `503` from `/reserve` is temporary, so a retry with backoff can succeed. `http.default_retry_predicate` retries 429, 502, 503, 504, connection errors, and timeouts. Use it only for idempotent steps. For a step that is not idempotent, `http.default_retry_predicate_non_idempotent` retries only 429, 503, and connection failures. The default policies `${http.default_retry}` and `${http.default_retry_non_idempotent}` use these predicates, with up to 5 retries and a delay from 1 to 60 seconds. The lab writes its own policy with the same predicate, so that you can see the `max_retries` and `backoff` fields. A `402` from `/charge` is a business decision, and a retry gives the same answer. So the workflow catches it, runs a compensation step (`/release`), and returns a result. Retries are not free: each retry counts as a step execution for pricing.

If an Eventarc trigger starts a workflow, the event counts as delivered when the execution starts. Eventarc does not retry an execution that fails later. So handle the errors inside the workflow, with `retry` and `except`.

</details>

4. Why does the lab add a time stamp to the names of the queue and the job, but not to the workflow?

<details><summary>Answer</summary>

After you delete a Cloud Tasks queue, you must wait 3 days before you create a queue with the same name. For Cloud Scheduler, the gcloud steps in the docs say that you can never use a deleted job name again in the project. The console steps on the same page say that you can, so a new name is the safe choice. Task names are also remembered for up to 24 hours after a task is deleted. So a lab that you run more than once needs new queue and job names. The teardown script finds all `lab22-` queues and jobs with a filter. The workflow keeps the fixed name `lab22-order`. `gcloud workflows deploy` creates or updates a workflow, and the docs give no wait time before you can use a workflow ID again.

</details>

## Clean up

```bash
bash pcd/labs/22-workflows-tasks-scheduler/teardown.sh
```

The script deletes, in order:

- All Cloud Scheduler jobs whose names start with `lab22-`.
- All Cloud Tasks queues whose names start with `lab22-`, with their tasks. You cannot use these queue names again for 3 days.
- The `lab22-order` workflow.
- The `lab22-steps` service, with its IAM bindings, and its image in the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The project-level Workflows Invoker binding for `lab22-scheduler`.
- The `lab22-scheduler`, `lab22-tasks`, `lab22-workflow`, and `lab22-steps` service accounts. The Service Account User binding for the Cloud Tasks service agent goes with `lab22-tasks`.

It leaves the enabled APIs in place.

## Docs used

- [Workflows overview](https://docs.cloud.google.com/workflows/docs/overview)
- [Invoke Cloud Run functions or Cloud Run](https://docs.cloud.google.com/workflows/docs/calling-run-functions)
- [Make authenticated requests from a workflow](https://docs.cloud.google.com/workflows/docs/authenticate-from-workflow)
- [Grant a workflow permission to access Google Cloud resources](https://docs.cloud.google.com/workflows/docs/authentication)
- [Use environment variables](https://docs.cloud.google.com/workflows/docs/use-environment-variables)
- [Retry steps](https://docs.cloud.google.com/workflows/docs/reference/syntax/retrying)
- [Catch errors](https://docs.cloud.google.com/workflows/docs/reference/syntax/catching-errors)
- [Workflow errors](https://docs.cloud.google.com/workflows/docs/reference/syntax/error-types)
- [Conditions](https://docs.cloud.google.com/workflows/docs/reference/syntax/conditions)
- [Syntax cheat sheet](https://docs.cloud.google.com/workflows/docs/reference/syntax/syntax-cheat-sheet)
- [Use Workflows with Cloud Run and Cloud Run functions tutorial](https://docs.cloud.google.com/workflows/docs/tutorials/run/cloud-run)
- [Schedule a workflow using Cloud Scheduler](https://docs.cloud.google.com/workflows/docs/schedule-workflow)
- [Trigger a workflow with events or Pub/Sub messages](https://docs.cloud.google.com/workflows/docs/trigger-workflow-eventarc)
- [Event-driven architectures](https://docs.cloud.google.com/eventarc/docs/event-driven-architectures)
- [Understand Cloud Tasks](https://docs.cloud.google.com/tasks/docs/dual-overview)
- [Choose Cloud Tasks or Pub/Sub](https://docs.cloud.google.com/tasks/docs/comp-pub-sub)
- [Add an HTTP target task to a Cloud Tasks queue](https://docs.cloud.google.com/tasks/docs/add-task-queue)
- [Configure queue routing, limits, and retries](https://docs.cloud.google.com/tasks/docs/configuring-queues)
- [Create HTTP target tasks programmatically](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Cloud Tasks quotas and limits](https://docs.cloud.google.com/tasks/docs/quotas)
- [Manage queues and tasks](https://docs.cloud.google.com/tasks/docs/manage-queues-and-tasks)
- [About Cloud Scheduler](https://docs.cloud.google.com/scheduler/docs/overview)
- [Manage cron jobs](https://docs.cloud.google.com/scheduler/docs/creating)
- [Retry jobs](https://docs.cloud.google.com/scheduler/docs/configuring/retry-jobs)
- [Use authentication with HTTP targets (Cloud Scheduler)](https://docs.cloud.google.com/scheduler/docs/http-target-auth)
- [REST Resource: projects.locations.jobs (Cloud Scheduler)](https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs)
- [REST Resource: projects.locations.workflows](https://docs.cloud.google.com/workflows/docs/reference/rest/v1/projects.locations.workflows)
- [Workflows pricing](https://cloud.google.com/workflows/pricing)
- [Cloud Tasks pricing](https://cloud.google.com/tasks/pricing)
- [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
