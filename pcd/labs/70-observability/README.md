---
id: 70-observability
title: "Instrument a Cloud Run service: structured logs, traces, metrics, and Error Reporting"
objectives: ["4.3"]
minutes: 75
cost: "Less than $0.30 if you run teardown.sh when done, and usually $0. Cloud Run with instance-based billing (240,000 vCPU-seconds each month), Cloud Build (2,500 build-minutes each month), Cloud Logging (50 GiB each month), and Cloud Trace (2.5 million spans each month) have free tiers. Error Reporting has no charge."
requiresOrg: false
---

## Goal

Deploy two private Python services to Cloud Run: `lab70-frontend` calls `lab70-backend`. Add JSON logs, OpenTelemetry traces, a log-based metric with an alerting policy, and an error that Error Reporting groups. Then follow one request through the logs and the trace of both services.

## Exam relevance

- JSON logs on `stdout` with `severity`, `message`, and the trace fields, so that container logs correlate with request logs and with traces. See [Instrumenting code with logs, metrics, and traces](note:4.3-instrumentation).
- OpenTelemetry with the OTLP exporter and the Telemetry API, the collector sidecar that Google recommends on Cloud Run, and instance-based billing for background export. See [Instrumenting code with logs, metrics, and traces](note:4.3-instrumentation).
- Context propagation with the `traceparent` header, the `ParentBased` sampler, and the sampling limits of Cloud Run. See [Trace IDs: correlating spans and logs across services](note:4.3-tracing-and-correlation).
- Logs Explorer queries on indexed fields, how Error Reporting finds errors, error group statuses, and Gemini Cloud Assist (Preview). See [Finding and fixing issues](note:4.3-troubleshooting).
- A log-based metric counts only new entries, and an alerting policy watches it. See [Instrumenting code with logs, metrics, and traces](note:4.3-instrumentation).
- One service account for each service, and the Cloud Run Invoker role on the backend only. See [Secure service-to-service communication](note:1.2-service-to-service) and [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).
- Instance-based billing charges for the whole life of an instance. See [Sizing resources and controlling cost](note:1.1-resources-and-cost).

## Before you start

- Complete [the setup lab (00-setup)](lab:00-setup) first. It makes `source pcd/labs/env.sh` work. It also gives the Compute Engine default service account the Cloud Run Builder role, which deploys from source need.
- **IAM:** you are the Owner of the lab project.
- **Tools:** the gcloud CLI, `curl`, `openssl`, and `python3`. You do not need Docker. Cloud Build makes the images.
- **Email:** the alerting policy sends email to the account of your gcloud configuration.
- **Time:** about 75 minutes. Each deploy takes a few minutes. Traces, error groups, and metric data take a few minutes to appear.
- Run all steps in one shell, from the repository root. Later steps use variables and functions from earlier steps.

Load the lab environment, and enable the APIs. The Telemetry API (`telemetry.googleapis.com`) receives the spans from your code.

```bash
source pcd/labs/env.sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iam.googleapis.com logging.googleapis.com \
  monitoring.googleapis.com cloudtrace.googleapis.com telemetry.googleapis.com \
  clouderrorreporting.googleapis.com
```

## Steps

1. Create one service account for each service, and give both accounts the roles to write traces. Google recommends a user-managed service account for each Cloud Run service.

```bash
gcloud iam service-accounts create lab70-frontend --display-name="lab70 frontend service identity"
gcloud iam service-accounts create lab70-backend --display-name="lab70 backend service identity"
export FRONTEND_SA="lab70-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
export BACKEND_SA="lab70-backend@${PROJECT_ID}.iam.gserviceaccount.com"
for sa in "$FRONTEND_SA" "$BACKEND_SA"; do
  for role in roles/telemetry.tracesWriter roles/serviceusage.serviceUsageConsumer; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${sa}" --role="$role" --condition=None > /dev/null
  done
done
```

The code sends only spans to the Telemetry API. For least privilege, each account gets the narrowest role for that job: Cloud Telemetry Traces Writer (`roles/telemetry.tracesWriter`). Its only permission is `telemetry.traces.write`. Cloud Telemetry Writer (`roles/telemetry.writer`) can also write logs and metrics, which this code does not send through the API. The Telemetry API also needs the Service Usage Consumer role (`roles/serviceusage.serviceUsageConsumer`) on the quota project. For a service account, the quota project is the project of the account. Neither account needs the Logs Writer role, because Cloud Run sends `stdout` to Cloud Logging. If a binding fails because the account does not exist yet, wait one minute and run the loop again.

2. Read the code. One folder holds both services, and the `LAB70_ROLE` environment variable selects the app.

```bash
ls -A pcd/labs/70-observability/app
cat pcd/labs/70-observability/app/telemetry.py
cat pcd/labs/70-observability/app/backend.py pcd/labs/70-observability/app/frontend.py
```

| File | What to look for |
|---|---|
| `telemetry.py`, `setup_tracing` | The OTLP gRPC exporter sends spans to `https://telemetry.googleapis.com` with Application Default Credentials (ADC). The `gcp.project_id` resource attribute names the project. `FlaskInstrumentor` makes a server span from the incoming `traceparent` header. `RequestsInstrumentor` adds `traceparent` to outgoing calls. |
| `telemetry.py`, `ParentBased(ALWAYS_OFF)` | The code follows the sampling decision in the incoming header. It does not start traces of its own. |
| `telemetry.py`, `log` | One JSON object on one line of `stdout`, with `severity`, `message`, `logging.googleapis.com/trace`, `logging.googleapis.com/spanId`, and `logging.googleapis.com/trace_sampled`. |
| `backend.py` | The custom span `compute-price`. The `/fail` route writes `traceback.format_exc()` in `message` at severity `ERROR`. |
| `frontend.py` | `fetch_id_token` gets an ID token with the backend URL as the audience. The answer includes the trace ID. |
| `main.py`, `Procfile` | Gunicorn serves `main:app`. `main.py` imports the frontend app or the backend app, as `LAB70_ROLE` tells it. |

The trace field uses the format `projects/PROJECT_ID/traces/TRACE_ID`, as the Cloud Run logging sample does. The sample uses this format to nest container logs under their request log in the Logs Explorer. It is the legacy format, which the docs still accept. The preferred format is the trace ID alone.

For trace data, Google recommends the Telemetry (OTLP) API instead of the Cloud Trace API and the Google Cloud trace exporters. Those exporters transform the data, and the transformation can lose some data. The code exports directly from the process to the Telemetry API, so each service stays one container. On Cloud Run, Google recommends the OpenTelemetry SDK with an OpenTelemetry Collector sidecar. Direct export is the documented choice when a separate collector process is not practical.

3. Deploy the backend from source, and let only the frontend service account call it. Deploy from source builds the image with Cloud Build and Google Cloud's buildpacks.

```bash
gcloud run deploy lab70-backend \
  --source=pcd/labs/70-observability/app \
  --region="$REGION" \
  --service-account="$BACKEND_SA" \
  --no-allow-unauthenticated \
  --no-cpu-throttling \
  --cpu=1 --memory=512Mi --concurrency=8 --max=1 \
  --set-env-vars="LAB70_ROLE=backend,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
export BACKEND_URL="$(gcloud run services describe lab70-backend --region="$REGION" --format='value(status.url)')"
gcloud run services add-iam-policy-binding lab70-backend --region="$REGION" \
  --member="serviceAccount:${FRONTEND_SA}" --role=roles/run.invoker
```

If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`. The binding is on the `lab70-backend` service, not on the project, so the frontend can call only this service.

If the build fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deploys from source. Grant the role as in the setup lab, wait two minutes, and run the deploy again. `teardown.sh` does not remove this grant, because other labs need it.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

| Flag | Why this lab sets it |
|---|---|
| `--service-account` | The service identity. With ADC, the code uses this account to call the Telemetry API and the backend. |
| `--no-allow-unauthenticated` | Only principals with the `run.routes.invoke` permission can call the service. |
| `--no-cpu-throttling` | Instance-based billing. The instance keeps its CPU after it sends the answer, so the `BatchSpanProcessor` thread can export spans. |
| `--max=1` | At most one instance, as a cost limit. With instance-based billing, Cloud Run charges for the whole life of the instance. |
| `--set-env-vars` | `LAB70_ROLE` selects the app. `GOOGLE_CLOUD_PROJECT` gives the project ID to the trace resource and to the trace field of the logs. Cloud Run sets `K_SERVICE` to the service name, and the code uses it as the OpenTelemetry `service.name`. |

4. Deploy the frontend. It gets the URL of the backend in an environment variable, and it uses that URL as the audience of its ID token.

```bash
gcloud run deploy lab70-frontend \
  --source=pcd/labs/70-observability/app \
  --region="$REGION" \
  --service-account="$FRONTEND_SA" \
  --no-allow-unauthenticated \
  --no-cpu-throttling \
  --cpu=1 --memory=512Mi --concurrency=8 --max=1 \
  --set-env-vars="LAB70_ROLE=frontend,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},BACKEND_URL=${BACKEND_URL}"
export FRONTEND_URL="$(gcloud run services describe lab70-frontend --region="$REGION" --format='value(status.url)')"
```

5. Call the services. The `order` function sends a `traceparent` header with a random trace ID and the sampled flag set.

```bash
order() {  # usage: order [QUERY]  Calls /order on lab70-frontend and asks Cloud Run to trace it.
  curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
    -H "traceparent: 00-$(openssl rand -hex 16)-$(openssl rand -hex 8)-01" \
    "${FRONTEND_URL}/order?${1:-item=book}"
  echo
}
curl -s -o /dev/null -w '%{http_code}\n' "${BACKEND_URL}/price"
order
```

The call to the backend without a token prints `403`. The `order` call prints a JSON answer with `item`, `price`, and `trace_id`.

The header format is `00-TRACE_ID-PARENT_SPAN_ID-01`. The last field, `01`, sets the sampled flag. Google Cloud services take the flag as a hint. Cloud Run traces at most 10 forced requests per second for each instance. Without the flag, Cloud Run samples at most 0.1 requests per second for each instance, and you cannot change that rate.

This first traced call also matters for storage. The spans from your code make the system create the `_Trace` observability bucket. Cloud Trace stores the spans that Cloud Run creates only after that bucket exists.

6. Create the log-based metric and the alerting policy now, before the errors happen. A user-defined log-based metric counts only the log entries that arrive after you create it.

```bash
gcloud logging metrics create lab70-payment-failures \
  --description="Payment failures that lab70-backend logs" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="lab70-backend" AND severity>=ERROR AND jsonPayload.event="payment_failed"'
export LAB_EMAIL="$(gcloud config get-value account)"
export CHANNEL="$(gcloud beta monitoring channels create --display-name="lab70-email" \
  --type=email --channel-labels=email_address="$LAB_EMAIL" --format='value(name)')"
echo "$CHANNEL"
cat pcd/labs/70-observability/alert-policy.json
gcloud monitoring policies create \
  --policy-from-file=pcd/labs/70-observability/alert-policy.json \
  --notification-channels="$CHANNEL"
```

No GA command manages notification channels, so the channel command uses `gcloud beta`. Cloud Monitoring names the metric `logging.googleapis.com/user/lab70-payment-failures`. The metric filter names one resource type, as Google recommends.

The policy is a metric-threshold condition. In the console, `alignmentPeriod` is the **Rolling window** and `perSeriesAligner` is the **Rolling window function**. The window is 10 minutes, because the ingestion delay of log-based metric data can be as large as 10 minutes. The condition is met when the sum of failures in the window is more than 0.

7. Send the request that you follow in the next steps, and keep its trace ID.

```bash
export TRACE_ID="$(order | python3 -c 'import json, sys; print(json.load(sys.stdin)["trace_id"])')"
echo "$TRACE_ID"
```

The trace ID that the frontend returns is the trace ID that Cloud Run, your code, and the logs use.

8. Read all the logs of this one request. Both services write the same trace ID, and Cloud Run writes it in its request logs.

```bash
gcloud logging read "trace=\"projects/${PROJECT_ID}/traces/${TRACE_ID}\"" \
  --freshness=1h --order=asc \
  --format='table(timestamp, resource.labels.service_name, logName.basename(), severity, jsonPayload.message)'
```

Expected: four entries, two for each service. Each service has one entry in the request log (`run.googleapis.com%2Frequests`), and one container log entry that your code wrote to `stdout`. If the list is empty, wait one minute and run the command again.

Now look at the same request in the console. Go to the **Logs Explorer** page. Paste this query, with your project ID and trace ID, and click **Run query**:

```text
trace="projects/PROJECT_ID/traces/TRACE_ID"
```

Click the triangle icon at the left of a request log entry. The container logs of that request appear nested under it. Expand the `order placed for book` entry: `jsonPayload` has the field `event`, and `trace`, `spanId`, and `traceSampled` are top-level fields of the entry.

9. Look at the trace in Trace Explorer. The trace shows the request as it moves from one service to the next.

In the console, go to the **Trace Explorer** page. Click **Search for trace**, and enter the value of `$TRACE_ID`. The **Service/workload** column shows the OpenTelemetry `service.name` of each span:

| Span | Service/workload | Made by |
|---|---|---|
| `GET /order` | `lab70-frontend` | `FlaskInstrumentor`, from the incoming `traceparent` |
| `GET` (several) | `lab70-frontend` | `RequestsInstrumentor`, one span for each outgoing call. `fetch_id_token` calls the metadata server, and then the code calls the backend. The `http.url` attribute shows the target |
| `GET /price` | `lab70-backend` | `FlaskInstrumentor`, below the `GET` span of the call to the backend |
| `compute-price` | `lab70-backend` | The custom span in `backend.py` |

The trace can also show the request spans that Cloud Run creates. The `traceparent` header from `curl` has a random parent span ID, so Cloud Trace never receives the parent of the top span. Select `compute-price`, and open these tabs:

- **Attributes:** `lab70.item` is `book`.
- **Logs & Events:** the `price computed for book` log entry. This tab lists the log entries whose trace ID and span ID match the span. **View logs** opens the Logs Explorer with a filter for this trace and span.

If **Search for trace** finds nothing, wait a few minutes: the first trace data in a project can take several minutes to appear. If the trace has only the spans of your code, the `_Trace` bucket did not exist yet when Cloud Run sent its spans. Run step 7 again, and use the new trace ID.

10. Make the backend fail five times. Each call to `/fail` logs a Python stack trace at severity `ERROR`.

```bash
for i in 1 2 3 4 5; do order "item=book&fail=1"; done
```

Each answer is `{"error":"order failed","trace_id":"..."}` with a different trace ID. The backend answers `500`, and the frontend answers `502`.

11. Search the logs with queries on indexed fields. Indexed fields, such as `resource.type`, `resource.labels.*`, `severity`, `trace`, `logName`, and `httpRequest.status`, make queries fast.

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="lab70-backend" AND NOT log_id("run.googleapis.com/requests") AND severity>=ERROR' \
  --freshness=1h --limit=10 --format='value(timestamp, severity, jsonPayload.event)'
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.event="order_placed"' \
  --freshness=1h --limit=5 --format='value(timestamp, resource.labels.service_name, jsonPayload.message)'
gcloud logging read 'resource.type="cloud_run_revision" AND log_id("run.googleapis.com/requests") AND httpRequest.status>=500' \
  --freshness=1h --limit=10 --format='value(timestamp, resource.labels.service_name, httpRequest.status)'
```

| Query | Expected result |
|---|---|
| Container logs of one service with severity `ERROR` or higher | Five entries with the event `payment_failed` |
| A field of your JSON logs | The `order placed` entries of the successful `order` calls |
| Request logs with a server error | Five `500` entries from `lab70-backend`, and five `502` entries from `lab70-frontend` |

The `log_id` function takes the log ID without URL encoding. The Logs Explorer uses the same query language. In the query pane, you can put each condition on its own line, and Cloud Logging adds `AND` between them. Run the first query in the console. The histogram above the results shows when the errors happened.

12. Open the error group in Error Reporting, and change its status. Error Reporting found the stack trace in the `message` field of the backend log entries.

In the console, go to the **Error Reporting** page. It can take a few minutes until a new error group appears. Find the group `RuntimeError: payment provider timed out for book` for the service `lab70-backend`, and click its name:

- The group has five occurrences. The stack trace shows `charge_card` and `fail` in `backend.py`.
- In **Recent samples**, click **View logs**. The Logs Explorer opens with a filter like `errorGroups.id="ERROR_GROUP_ID"`.

Go back to the **Error Reporting** page. On the error group, click **Open**, and then select **Acknowledged**. Then list the error groups with the Error Reporting API:

```bash
error_groups() {  # Prints the ID, status, and event count of the error groups of the last 6 hours.
  curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "x-goog-user-project: ${PROJECT_ID}" \
    "https://clouderrorreporting.googleapis.com/v1beta1/projects/${PROJECT_ID}/groupStats?timeRange.period=PERIOD_6_HOURS" \
    | grep -E '"(groupId|resolutionStatus|count)"'
}
error_groups
```

The output has one error group from this lab, with `"resolutionStatus": "ACKNOWLEDGED"` and a count of `5`. There is no group for the frontend `ERROR` entries, because they have no stack trace.

13. Chart the metric, and wait for the alert. Each failure that you caused in step 10 adds 1 to the metric.

In the console, go to the **Log-based Metrics** page. In the **User-defined metrics** list, open the **More** menu of `lab70-payment-failures`, and select **View in Metrics Explorer**. The chart shows the failures from step 10. To keep the chart, click **Save as** and save it to a dashboard.

The metric data can arrive up to 10 minutes after the log entries. When it arrives, the condition is met. Cloud Monitoring opens an alert, which the **Alerting** page lists, and sends an email to `$LAB_EMAIL`. The notification includes the `documentation` text from `alert-policy.json`.

14. Resolve the error group, and make the error happen again. A Resolved group changes back to Open when the error occurs again. A Muted group would not record the new events.

On the **Error Reporting** page, click **Acknowledged** on the error group, and then select **Resolved**. Then cause one more failure, wait two minutes, and list the groups:

```bash
order "item=book&fail=1"
sleep 120
error_groups
```

The group has the status `OPEN` again, and the count is `6`. If the status is still `RESOLVED`, wait one more minute and run `error_groups` again.

15. **Optional (Preview):** ask Gemini Cloud Assist to explain the error log entry. Skip this step if you do not want to enable a Preview service.

Gemini Cloud Assist is in Preview, under the Pre-GA Offering Terms. The Gemini pricing page lists console chat and Cloud Observability help as available to all Google Cloud users. The setup page offers Gemini Cloud Assist at no cost, and its panel has no cost while in Preview. Gemini Cloud Assist can store data in any Google Cloud data center. Do not enable it for a project with data residency or CMEK requirements. The setup enables five APIs and gives your account two roles. `teardown.sh` removes the two roles.

```bash
gcloud services enable geminicloudassist.googleapis.com cloudasset.googleapis.com \
  designcenter.googleapis.com appoptimize.googleapis.com apphub.googleapis.com
export ME="user:$(gcloud config get-value account)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$ME" \
  --role=roles/geminicloudassist.user --condition=None > /dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$ME" \
  --role=roles/cloudasset.viewer --condition=None > /dev/null
```

In the **Logs Explorer**, run the query `jsonPayload.event="payment_failed"`. Expand one entry, and in the toolbar of the entry, click **Investigate log**. The Cloud Assist pane shows a summary of the entry. For an entry with severity `ERROR` or higher, the summary can list possible causes and fixes. Gemini Cloud Assist gets only the text of this one entry, and it can be wrong, so check its output.

Gemini Cloud Assist investigations (Preview) look for the root cause of an issue across logs, metrics, and configuration. The pricing page lists investigations under Gemini Code Assist Enterprise, not for all users. Since April 10, 2026, only users with a Premium Support contract, or with access from their account team, can create or run investigations.

## Check your work

```bash
curl -s -o /dev/null -w '%{http_code}\n' "${BACKEND_URL}/price"
gcloud run services get-iam-policy lab70-backend --region="$REGION"
gcloud run services describe lab70-frontend --region="$REGION" \
  --format='value(spec.template.spec.serviceAccountName)'
gcloud logging read "trace=\"projects/${PROJECT_ID}/traces/${TRACE_ID}\"" --freshness=1d \
  --format='value(resource.labels.service_name)' | sort | uniq -c
gcloud logging metrics describe lab70-payment-failures --format='value(filter)'
gcloud monitoring policies list --filter='displayName="lab70-payment-failures"' \
  --format='value(displayName, enabled)'
error_groups
```

Expected output:

- `403`: the backend is still private.
- One binding in the IAM policy of `lab70-backend`: `roles/run.invoker` for `serviceAccount:lab70-frontend@...`. There is no binding for `allUsers`.
- `lab70-frontend@PROJECT_ID.iam.gserviceaccount.com`: the frontend runs as its own service account.
- `2 lab70-backend` and `2 lab70-frontend`: the logs of both services share the trace ID.
- The filter of the metric, with `jsonPayload.event="payment_failed"`.
- `lab70-payment-failures` and `True`: the alerting policy is enabled.
- The error group of this lab, with the status `OPEN` from step 14.

## Explore

1. The frontend also logs an `ERROR` entry for each failed order, but Error Reporting shows no group for it. Why, and how do you change that?

<details><summary>Answer</summary>

Error Reporting creates an error event from a log entry with a stack trace in a supported format. The severity of the entry must be unset or at least `ERROR`. For Python, the supported format is the output of `traceback.format_exc()`. Put it in the `message`, `stack_trace`, or `exception` field of `jsonPayload`. The frontend entry has only a text message. To report a text message, set the `@type` field to `type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent`. Error Reporting also cannot analyze log entries in log buckets that use CMEK. Error Reporting groups events with a stack trace by the exception type and the five topmost frames of the innermost exception.

</details>

2. A teammate wants a trace for every request to `lab70-frontend`, and asks you to raise the Cloud Run sample rate. What do you answer?

<details><summary>Answer</summary>

You cannot configure the Cloud Run sample rate. Cloud Run samples at most 0.1 requests per second for each instance. A client can force a trace with the sampled flag, and Cloud Run then traces at most 10 requests per second for each instance. Every component makes its own sampling decision, and the sampled flag is only a hint. With the `ParentBased` sampler, your code follows the decision of its parent, so a sampled trace is complete across your services. Log entries keep their trace ID when the trace is not sampled, and `trace_sampled` is `false`.

</details>

3. Why does this lab use `--no-cpu-throttling`, and what setup does Google recommend for OpenTelemetry on Cloud Run?

<details><summary>Answer</summary>

`BatchSpanProcessor` exports spans from a background thread, after the answer goes back to the client. With request-based billing, the instance has CPU only while it processes requests. The Cloud Run docs list monitoring agents like OpenTelemetry as a reason for instance-based billing. Instance-based billing charges for the whole life of the instance, also when it is idle. Google recommends the OpenTelemetry SDK with an OTLP exporter that sends to an OpenTelemetry Collector sidecar, with instance-based billing. Direct export to the Telemetry API, as in this lab, is for environments where a separate collector process is not practical.

</details>

4. An outage started an hour ago. You create a log-based metric now to chart the errors of the outage. What do you see, and which tools fit better?

<details><summary>Answer</summary>

The chart has no data for the past hour. A user-defined log-based metric counts only the log entries that arrive after you create it. The Logs Explorer shows the stored entries and a histogram, but it does not count them: it does not support aggregate operations. To count stored entries, use SQL in Observability Analytics (formerly Log Analytics). It needs an upgraded log bucket, and you cannot undo the upgrade. Entries from before the upgrade become available after a backfill, which can take several days. The upgrade and the queries have no charge. To get a notification when a specific message appears in your logs, use a log-based alerting policy. It does not need a metric.

</details>

## Clean up

```bash
bash pcd/labs/70-observability/teardown.sh
```

The script deletes, in order:

- The alerting policy `lab70-payment-failures`, and the notification channel `lab70-email` (with `gcloud beta`, because no GA command exists).
- The log-based metric `lab70-payment-failures`.
- The Cloud Run Invoker binding of `lab70-frontend` on `lab70-backend`.
- The services `lab70-frontend` and `lab70-backend`, and their images in the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The project roles of the two service accounts: `roles/telemetry.tracesWriter` and `roles/serviceusage.serviceUsageConsumer`.
- If you did step 15: the `roles/geminicloudassist.user` and `roles/cloudasset.viewer` bindings of your account.
- The service accounts `lab70-frontend` and `lab70-backend`.

These stay: the enabled APIs, the log entries (until the log bucket retention ends), and the error group, which has no charge. The `_Trace` observability bucket also stays, because you cannot delete observability buckets.

## Docs used

- [Using distributed tracing (Cloud Run)](https://docs.cloud.google.com/run/docs/trace)
- [Trace context](https://docs.cloud.google.com/trace/docs/trace-context)
- [Instrument for Cloud Trace](https://docs.cloud.google.com/trace/docs/setup)
- [Trace sampling](https://docs.cloud.google.com/trace/docs/trace-sampling)
- [Link log entries with traces](https://docs.cloud.google.com/trace/docs/trace-log-integration)
- [Find and explore traces](https://docs.cloud.google.com/trace/docs/finding-traces)
- [Trace storage overview](https://docs.cloud.google.com/trace/docs/storage-overview)
- [Choose an instrumentation approach](https://docs.cloud.google.com/stackdriver/docs/instrumentation/choose-approach)
- [Migrate from the Trace exporter to the OTLP endpoint](https://docs.cloud.google.com/stackdriver/docs/instrumentation/migrate-to-otlp-endpoints)
- [Python instrumentation sample](https://docs.cloud.google.com/stackdriver/docs/instrumentation/setup/python)
- [Cloud Trace overview](https://docs.cloud.google.com/trace/docs/overview)
- [Telemetry (OTLP) API overview](https://docs.cloud.google.com/stackdriver/docs/reference/telemetry/overview)
- [Telemetry roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/telemetry)
- [Quota project overview](https://docs.cloud.google.com/docs/quotas/quota-project)
- [Configure the Logging agent: special fields in structured payloads](https://docs.cloud.google.com/logging/docs/agent/logging/configuration)
- [Logging and viewing logs in Cloud Run](https://docs.cloud.google.com/run/docs/logging)
- [Logging query language](https://docs.cloud.google.com/logging/docs/view/logging-query-language)
- [View and analyze log entries](https://docs.cloud.google.com/logging/docs/view/logs-explorer-interface)
- [Analyze logs using Logs Explorer and Observability Analytics](https://docs.cloud.google.com/logging/docs/log-analytics)
- [Log-based metrics overview](https://docs.cloud.google.com/logging/docs/logs-based-metrics)
- [REST Resource: projects.metrics (LogMetric)](https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/projects.metrics)
- [List and chart log-based metrics](https://docs.cloud.google.com/logging/docs/logs-based-metrics/view_your_log_based_metrics)
- [Configure notifications for log-based metrics](https://docs.cloud.google.com/logging/docs/logs-based-metrics/charts-and-alerts)
- [Configure log-based alerting policies](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts)
- [Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets)
- [Sample policies in JSON](https://docs.cloud.google.com/monitoring/alerts/policies-in-json)
- [Behavior of metric-based alerting policies](https://docs.cloud.google.com/monitoring/alerts/concepts-indepth)
- [REST Resource: projects.alertPolicies](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies)
- [Create and manage notification channels by API](https://docs.cloud.google.com/monitoring/alerts/using-channels-api)
- [gcloud beta monitoring channels create](https://docs.cloud.google.com/sdk/gcloud/reference/beta/monitoring/channels/create)
- [Format a log entry to report error events](https://docs.cloud.google.com/error-reporting/docs/formatting-error-messages)
- [Method: projects.events.report (ReportedErrorEvent)](https://docs.cloud.google.com/error-reporting/reference/rest/v1beta1/projects.events/report)
- [Instrument Python apps for Error Reporting](https://docs.cloud.google.com/error-reporting/docs/setup/python)
- [Error Reporting overview](https://docs.cloud.google.com/error-reporting/docs/grouping-errors)
- [View and filter error groups](https://docs.cloud.google.com/error-reporting/docs/viewing-errors)
- [Manage error groups](https://docs.cloud.google.com/error-reporting/docs/managing-errors)
- [Method: projects.groupStats.list](https://docs.cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groupStats/list)
- [Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)
- [Introduction to service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)
- [Billing settings for services](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [About instance autoscaling in Cloud Run services](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
- [Container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Build a Python application](https://docs.cloud.google.com/docs/buildpacks/python)
- [Summarize log entries with Gemini assistance](https://docs.cloud.google.com/logging/docs/view/summarize-log-entries-gemini)
- [Set up Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/set-up-gemini)
- [Use Gemini Cloud Assist in the Google Cloud console](https://docs.cloud.google.com/cloud-assist/chat-panel)
- [Troubleshoot issues with Gemini Cloud Assist investigations](https://docs.cloud.google.com/cloud-assist/investigations)
- [Gemini for Google Cloud pricing](https://cloud.google.com/products/gemini/pricing)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Google Cloud Observability pricing](https://cloud.google.com/products/observability/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
