---
id: 20-eventarc-storage-events
title: Event-driven Cloud Run with Eventarc and Cloud Storage events
objectives: ["3.1", "1.1"]
minutes: 45
cost: "Less than $0.10 if you run teardown.sh when done. Eventarc Standard has no charge for events from Google sources, and its Pub/Sub transport, Cloud Run, Cloud Build, Artifact Registry, and Cloud Storage have free tiers."
requiresOrg: false
---

## Goal

Send Cloud Storage events to a private Cloud Run service with an Eventarc Standard trigger. Then make the receiver fail, watch Eventarc deliver the same event again, and fix the receiver so that the retry succeeds.

## Exam relevance

- An Eventarc trigger for direct Cloud Storage events, its filters, its location, and its Pub/Sub transport. See [Triggering Cloud Run with Eventarc and Pub/Sub, and writing event receivers](note:3.1-triggers-and-receivers).
- At-least-once delivery, retries with exponential backoff, dead-letter topics, idempotent handlers, and Eventarc Standard compared with Eventarc Advanced. See [Asynchronous and event-driven integration with Pub/Sub and Eventarc](note:1.1-async-events).
- A trigger service account with only the roles that it needs, and the Cloud Storage service agent. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).
- Eventarc calls a private service as the trigger service account, so the service needs no public access. See [Secure service-to-service communication](note:1.2-service-to-service).
- Structured logs from Cloud Run: one line of JSON on stdout becomes a `jsonPayload` log entry. See [Instrumenting code with logs, metrics, and traces](note:4.3-instrumentation).

## Before you start

- Complete [00-setup](lab:00-setup) first. It makes `source pcd/labs/env.sh` work and enables the base APIs. It also gives the Compute Engine default service account the Cloud Run Builder role, which deploys from source need.
- **IAM:** you are the Owner of the lab project. A trigger creator without Owner needs Eventarc Admin (`roles/eventarc.admin`) on the project, and Service Account User (`roles/iam.serviceAccountUser`) on the trigger service account.
- **Tools:** the gcloud CLI and `curl`.
- **Time:** about 45 minutes. The deploy from source takes a few minutes, and a new trigger can take up to 2 minutes to start to send events.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs that this lab adds to the base APIs from 00-setup. Eventarc Standard uses Pub/Sub to deliver events.

```bash
source pcd/labs/env.sh
gcloud services enable eventarc.googleapis.com pubsub.googleapis.com storage.googleapis.com
```

## Steps

1. Set the lab variables. Bucket names are global, so the bucket name includes your project ID. If you open a new shell, run `source pcd/labs/env.sh` and this block again.

```bash
export BUCKET="lab20-${PROJECT_ID}"
export RUN_SA="lab20-receiver@${PROJECT_ID}.iam.gserviceaccount.com"
export TRIGGER_SA="lab20-trigger@${PROJECT_ID}.iam.gserviceaccount.com"
export LOG_FILTER='resource.type="cloud_run_revision" AND resource.labels.service_name="lab20-receiver" AND jsonPayload.message:"lab20"'
```

2. Read the receiver, so that you know what Eventarc sends. Eventarc delivers each event as an HTTP POST in CloudEvents binary content mode. The `ce-` headers carry the event attributes, and the body carries the event data.

```bash
cat pcd/labs/20-eventarc-storage-events/app/main.py
```

The handler returns `204` to acknowledge the event. For an object whose name starts with `FAIL_PREFIX`, it returns `500`. That is a simulated bug for step 10.

3. Create the service identity, and deploy the receiver as a private service. The service account gets no roles, because the code calls no Google Cloud API.

```bash
gcloud iam service-accounts create lab20-receiver --display-name="lab20 receiver identity"
gcloud run deploy lab20-receiver \
  --source=pcd/labs/20-eventarc-storage-events/app \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --no-allow-unauthenticated \
  --max=2 \
  --set-env-vars=FAIL_PREFIX=fail-
```

If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`. There is no `Procfile`. The `requirements.txt` file lists `gunicorn`, so the Python buildpack starts the app with `gunicorn -b :8080 main:app`.

If the source deploy fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deploys from source. Grant the role as in 00-setup. The grant takes a few minutes to propagate, so wait a few minutes before you run the deploy again. `teardown.sh` does not remove this grant, because other labs need it.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

4. Send one event by hand, in the format that Eventarc uses. This tests the receiver before a trigger exists.

```bash
export URL="$(gcloud run services describe lab20-receiver --region="$REGION" --format='value(status.url)')"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "Content-Type: application/json" \
  -H "ce-specversion: 1.0" -H "ce-id: manual-1" -H "ce-source: manual-test" \
  -H "ce-type: google.cloud.storage.object.v1.finalized" \
  -d "{\"bucket\": \"${BUCKET}\", \"name\": \"manual.txt\"}"
```

The command prints `204`. Without the `Authorization` header, the private service returns `403`.

5. Create the trigger identity, and grant the roles that the Eventarc docs require. If you do not set a trigger service account, the trigger uses the Compute Engine default service account. Google recommends a user-managed service account with the minimum permissions.

```bash
gcloud iam service-accounts create lab20-trigger --display-name="lab20 Eventarc trigger identity"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${TRIGGER_SA}" --role=roles/eventarc.eventReceiver --condition=None
gcloud run services add-iam-policy-binding lab20-receiver --region="$REGION" \
  --member="serviceAccount:${TRIGGER_SA}" --role=roles/run.invoker
export GCS_AGENT="$(gcloud storage service-agent --project="$PROJECT_ID")"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GCS_AGENT}" --role=roles/pubsub.publisher --condition=None
```

| Principal | Role | Scope | Why |
|---|---|---|---|
| `lab20-trigger` | Eventarc Event Receiver | Project | The trigger receives events from event providers. |
| `lab20-trigger` | Cloud Run Invoker | The `lab20-receiver` service only | The trigger calls the private service. Without this role, the trigger is created and active, but each call fails with "The request was not authenticated". |
| Cloud Storage service agent | Pub/Sub Publisher | Project | Cloud Storage sends direct events through Pub/Sub notifications. |

If a binding fails because the service account does not exist yet, wait one minute and run the command again. A project that enabled the Pub/Sub service agent on or before April 8, 2021 also needs a Service Account Token Creator grant. Your lab project is newer.

6. Create the bucket. The bucket must be in the same project and the same region (or multi-region) as the trigger.

```bash
gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access
```

7. Create the trigger. Both filters are required for Cloud Storage events. Filters are exact matches, with no wildcards or regular expressions.

```bash
gcloud eventarc triggers create lab20-trigger \
  --location="$REGION" \
  --destination-run-service=lab20-receiver \
  --destination-run-region="$REGION" \
  --event-filters="type=google.cloud.storage.object.v1.finalized" \
  --event-filters="bucket=${BUCKET}" \
  --service-account="$TRIGGER_SA"
gcloud eventarc triggers list --location="$REGION"
```

The `finalized` event comes when a new object is created, and when an overwrite creates a new generation of an object. You cannot change the event type of a trigger after you create it. If this is the first trigger in the project, the create can fail while Google provisions the Eventarc service agent. Then run the create command again.

8. Look at the transport. Eventarc Standard creates a Pub/Sub topic and subscription for the trigger. You change retries, retention, and the acknowledgment deadline on that subscription.

```bash
gcloud eventarc triggers describe lab20-trigger --location="$REGION" --format='yaml(transport)'
export SUB="$(gcloud eventarc triggers describe lab20-trigger --location="$REGION" \
  --format='value(transport.pubsub.subscription)')"
gcloud pubsub subscriptions describe "$SUB" \
  --format='yaml(ackDeadlineSeconds, messageRetentionDuration, retryPolicy)'
gcloud pubsub subscriptions update "$SUB" --ack-deadline=600 --min-retry-delay=5s --max-retry-delay=30s
```

The subscription ID starts with `eventarc-` and your region. By default, Eventarc keeps an undelivered event for 24 hours, and the retry delay grows from 10 to 600 seconds. The Cloud Run docs say that the default acknowledgment deadline of 10 seconds can cause duplicate deliveries, and recommend 600 seconds. The short retry delays are only for this lab, so that you see retries in minutes. Set both delay flags: a delay flag that you omit goes back to its default value.

9. Upload a file, and read the log entry from the receiver. Wait about 30 seconds after the upload. If the log has no entry yet, wait one more minute: a new trigger can take up to 2 minutes to work.

```bash
echo "hello" | gcloud storage cp - "gs://${BUCKET}/hello.txt"
echo "hello again" | gcloud storage cp - "gs://${BUCKET}/hello.txt"
gcloud logging read "$LOG_FILTER" --freshness=10m --limit=5 \
  --format='table(timestamp, severity, jsonPayload.ce.id, jsonPayload.generation, jsonPayload.message)'
```

There are two `received gs://.../hello.txt` entries. The second upload overwrote the object, so it made a new generation and a new event with a different ID. Cloud Run also adds the labels `run.googleapis.com/cloud_event_id` and `run.googleapis.com/cloud_event_source` to the service logs.

10. Upload a file that the receiver cannot process. The receiver returns `500`. Pub/Sub counts any code other than 102, 200, 201, 202, or 204 as a negative acknowledgment, so Eventarc delivers the event again.

```bash
echo "report" | gcloud storage cp - "gs://${BUCKET}/fail-report.txt"
```

Wait two minutes, then read the error entries:

```bash
gcloud logging read "$LOG_FILTER AND severity=ERROR" --freshness=10m --limit=10 \
  --format='table(timestamp, jsonPayload.ce.id, jsonPayload.message)'
```

There are several `FAILED gs://.../fail-report.txt` entries with the same `ce.id`. Each one is a retry of the same event. The time between retries grows, up to the 30-second maximum from step 8.

11. Fix the bug: remove `FAIL_PREFIX`. This creates a new revision, and the next retry reaches it.

```bash
gcloud run services update lab20-receiver --region="$REGION" --remove-env-vars=FAIL_PREFIX
```

Wait one minute, then read the log for the file:

```bash
gcloud logging read "$LOG_FILTER AND jsonPayload.message:\"fail-report.txt\"" --freshness=15m --limit=10 \
  --format='table(timestamp, severity, jsonPayload.ce.id, jsonPayload.message)'
```

The newest entry is `received gs://.../fail-report.txt`, at severity `INFO`, with the same `ce.id` as the errors. Eventarc did not lose the event while the service failed.

## Check your work

```bash
gcloud eventarc triggers describe lab20-trigger --location="$REGION" \
  --format='yaml(eventFilters, serviceAccount, destination)'
gcloud pubsub subscriptions describe "$SUB" --format='yaml(ackDeadlineSeconds, retryPolicy)'
gcloud run services get-iam-policy lab20-receiver --region="$REGION"
gcloud logging read "$LOG_FILTER" --freshness=30m --format='value(severity, jsonPayload.message)'
```

Expected output:

- The trigger has two filters (`type` and `bucket`), the service account `lab20-trigger`, and the destination `lab20-receiver`.
- The subscription has `ackDeadlineSeconds: 600`, and a retry policy of 5 to 30 seconds.
- The IAM policy of the service gives `roles/run.invoker` to `lab20-trigger` only. There is no binding for `allUsers`.
- The log has two `received` entries for `hello.txt`, the `FAILED` entries for `fail-report.txt`, and then one `received` entry for `fail-report.txt`.

## Explore

1. The receiver failed for minutes, and no event was lost. What are the limits of this protection, and what do you change for development and for production?

<details><summary>Answer</summary>

Eventarc keeps an event that has no acknowledgment for 24 hours by default. After that, Eventarc discards the event, unless the subscription has a dead-letter topic. You set the dead-letter topic on the Pub/Sub subscription of the trigger, not on the topic. A trigger that you create with gcloud, Terraform, or the Eventarc page of the console retries by default. A trigger that you create from the Cloud Run page of the console makes one delivery attempt. Google recommends that you disable retries during development and testing, so that a bug does not cause many retries and extra cost. For a Cloud Run destination, `gcloud eventarc triggers create --max-retry-attempts=1` makes one delivery attempt with no retries. In production, Google recommends that you enable retries and follow the best practices for retries. For example, a dead-letter topic lets you store and analyze the events that fail.

</details>

2. The receiver got the event for `fail-report.txt` several times, with the same ID. How do you make a handler safe for duplicate events?

<details><summary>Answer</summary>

Eventarc Standard delivers at least once, so duplicates can happen even without errors. The CloudEvents `source` and `id` attributes together identify one event. Write an idempotent handler: if an API that you call accepts an idempotency key, use the event ID. Otherwise, record the IDs of the processed events, and check that record in a transaction before you change state. Make sure that each side effect is safe to repeat. Eventarc Standard and Eventarc Advanced also do not guarantee the order of events.

</details>

3. Why does the lab set the acknowledgment deadline of the Eventarc subscription to 600 seconds?

<details><summary>Answer</summary>

Eventarc delivers the event through a Pub/Sub push subscription. If the acknowledgment deadline expires before the handler responds, Pub/Sub sends the event again, and the first request can still be in progress. The default deadline of the Eventarc subscription is 10 seconds. The Cloud Run docs say that this is not enough for many functions and can cause unwanted duplicate executions. They recommend the maximum value, 600 seconds. You cannot change the deadline for one push message, only for the subscription.

</details>

4. When do you use a Cloud Audit Logs trigger, or Eventarc Advanced, instead of this setup?

<details><summary>Answer</summary>

Use a Cloud Audit Logs trigger (`type=google.cloud.audit.log.v1.written`) only when the service has no direct event for the change. When both exist, Google recommends the direct event. Eventarc Standard routes events from a provider to a destination through triggers, and supports dead-letter topics through Pub/Sub. Eventarc Advanced uses a central bus, with pipelines and enrollments, for many-to-many routing. It can filter on any event attribute, transform events with CEL expressions, convert the event format, and deliver events across projects. It accepts larger events (1 MB, compared with 512 KB), but it does not support dead-letter queues.

</details>

## Clean up

```bash
bash pcd/labs/20-eventarc-storage-events/teardown.sh
```

The script deletes, in order:

- The `lab20-trigger` trigger. Eventarc deletes the transport topic that it created. The script also deletes the transport subscription if it still exists.
- The `lab20-receiver` service, and its image in the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The `lab20-...` bucket and all its objects.
- The project-level bindings: Eventarc Event Receiver for `lab20-trigger`, and Pub/Sub Publisher for the Cloud Storage service agent.
- The `lab20-trigger` and `lab20-receiver` service accounts.

It leaves the enabled APIs in place.

## Docs used

- [Eventarc overview](https://docs.cloud.google.com/eventarc/docs/overview)
- [Eventarc Standard overview](https://docs.cloud.google.com/eventarc/standard/docs/overview)
- [Event providers and destinations](https://docs.cloud.google.com/eventarc/standard/docs/event-providers-targets)
- [Route Cloud Storage events to Cloud Run](https://docs.cloud.google.com/eventarc/standard/docs/run/route-trigger-cloud-storage)
- [Receive direct events from Cloud Storage (gcloud CLI)](https://docs.cloud.google.com/eventarc/standard/docs/run/create-trigger-storage-gcloud)
- [Use Eventarc to receive events from Cloud Storage](https://docs.cloud.google.com/run/docs/tutorials/eventarc)
- [Create triggers with Eventarc (Cloud Run)](https://docs.cloud.google.com/run/docs/triggering/trigger-with-events)
- [Roles and permissions for Cloud Run targets](https://docs.cloud.google.com/eventarc/docs/roles-permissions)
- [Event format](https://docs.cloud.google.com/eventarc/docs/event-format)
- [CloudEvents format - HTTP protocol binding](https://docs.cloud.google.com/eventarc/docs/cloudevents)
- [Develop event receivers](https://docs.cloud.google.com/eventarc/standard/docs/run/event-receivers)
- [Retry events](https://docs.cloud.google.com/eventarc/docs/retry-events)
- [Manage triggers](https://docs.cloud.google.com/eventarc/docs/managing-triggers)
- [Push subscriptions (Pub/Sub)](https://docs.cloud.google.com/pubsub/docs/push)
- [Known issues for Eventarc Standard](https://docs.cloud.google.com/eventarc/docs/issues)
- [REST Resource: projects.locations.triggers](https://docs.cloud.google.com/eventarc/docs/reference/rest/v1/projects.locations.triggers)
- [Objects resource (Cloud Storage JSON API)](https://docs.cloud.google.com/storage/docs/json_api/v1/objects)
- [Logging and viewing logs in Cloud Run](https://docs.cloud.google.com/run/docs/logging)
- [Build a Python application](https://docs.cloud.google.com/docs/buildpacks/python)
- [Quickstart: Build and deploy a Python (Flask) web app to Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-service)
- [Eventarc pricing](https://cloud.google.com/eventarc/pricing)
- [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
