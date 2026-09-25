---
id: 70-observability-slo
title: SLOs, burn-rate alerts, and log analytics
objectives: ["6.2", "6.5"]
minutes: 75
cost: "Most usage fits in free tiers (Cloud Run, Cloud Build build-minutes, uptime check executions, the first 50 GiB of log storage per project). Expect a few cents. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Deploy a small Cloud Run service, then build its observability: an uptime check, a log-based metric, a request-based SLO, fast-burn and slow-burn alerts to email, an Observability Analytics (formerly Log Analytics) query, and a log sink to BigQuery. Then ship a "bad release", watch the error budget burn, and mitigate with a rollback.

## Exam relevance

- Burn-rate alerting, notification channels, and alert design: [Google Cloud Observability](note:6.2-observability).
- SLIs, SLOs, and error budgets as a quality gate: [Quality control measures](note:6.5-quality-control).
- Mitigate first, then find the cause: [Testing, validation, and root cause analysis](note:4.1-testing-and-troubleshooting).

## Before you start

- Run everything from the repo root, in one shell. Later steps use variables from earlier steps.
- You need the Owner role on the lab project (from `labs/00-setup`).
- Tools: gcloud, `bq` (part of the Google Cloud CLI), `curl`, and `python3`.
- Time: about 75 minutes, including about 15 minutes of waiting for metrics and the alert.

```bash
source labs/env.sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com monitoring.googleapis.com \
  logging.googleapis.com bigquery.googleapis.com
export LAB_EMAIL="you@example.com"   # replace with an address you can read
```

## Steps

1. Grant the Cloud Run Builder role to the Compute Engine default service account, because source deployments use it as the Cloud Build service account.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

2. Deploy the sample service from source as a public service. It returns HTTP 500 for a share of `/checkout` requests set by `FAIL_RATE`, and it writes one structured JSON log line per checkout. The `--no-invoker-iam-check` flag makes the service public in the way that Google recommends.

```bash
gcloud run deploy lab70-shop --source=labs/70-observability-slo/app \
  --region="$REGION" --no-invoker-iam-check --max-instances=2 \
  --set-env-vars=FAIL_RATE=0
export URL="$(gcloud run services describe lab70-shop --region="$REGION" --format='value(status.url)')"
export HOST="${URL#https://}"
export GOOD_REV="$(gcloud run services describe lab70-shop --region="$REGION" --format='value(status.latestReadyRevisionName)')"
curl -s "$URL/checkout"; echo
```

3. Create a log bucket with Observability Analytics enabled, and a sink that copies the service logs into it. Sinks are not retroactive, so create routes before you send traffic.

```bash
gcloud logging buckets create lab70-analytics --location=global \
  --enable-analytics --retention-days=30 --description="lab70 analytics bucket"
gcloud logging sinks create lab70-to-analytics \
  "logging.googleapis.com/projects/${PROJECT_ID}/locations/global/buckets/lab70-analytics" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="lab70-shop"'
```

4. Create a BigQuery dataset and a sink to it, then grant the sink's writer identity the roles that the docs list for a BigQuery destination. BigQuery is the destination to join logs with business data.

```bash
bq --location="$REGION" mk --dataset --description "lab70 routed logs" "${PROJECT_ID}:lab70_logs"
gcloud logging sinks create lab70-to-bq \
  "bigquery.googleapis.com/projects/${PROJECT_ID}/datasets/lab70_logs" \
  --use-partitioned-tables \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="lab70-shop"'
export WRITER="$(gcloud logging sinks describe lab70-to-bq --format='value(writerIdentity)')"
echo "$WRITER"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$WRITER" \
  --role=roles/bigquery.dataEditor --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="$WRITER" \
  --role=roles/logging.logWriter --condition=None
```

5. Create a counter log-based metric for failed payments. It turns a log event into a time series that you can chart and alert on.

```bash
gcloud logging metrics create lab70_payment_failures \
  --description="Failed payments in lab70-shop" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="lab70-shop" AND jsonPayload.event="payment_failed"'
```

6. Create a public uptime check on `/healthz`. It is black-box monitoring: it tests the service the way a user reaches it.

```bash
gcloud monitoring uptime create lab70-shop-uptime \
  --resource-type=uptime-url \
  --resource-labels="host=${HOST},project_id=${PROJECT_ID}" \
  --protocol=https --path=/healthz --period=5
```

7. Create an email notification channel. There is no GA gcloud command for channels, so this step calls the Cloud Monitoring API.

```bash
export TOKEN="$(gcloud auth print-access-token)"
export CHANNEL="$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/notificationChannels" \
  -d "{\"type\": \"email\", \"displayName\": \"lab70 email\", \"labels\": {\"email_address\": \"${LAB_EMAIL}\"}}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
echo "$CHANNEL"
```

8. Create a custom service and a request-based availability SLO: 99% of requests that are not client errors (4xx) must succeed, over a rolling 28 days. The SLI is bad requests (5xx) divided by total requests.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/services?serviceId=lab70-shop" \
  -d '{"displayName": "lab70-shop", "custom": {}}'
cat > /tmp/lab70-slo.json <<'EOF'
{
  "displayName": "99% of lab70-shop requests succeed (rolling 28 days)",
  "goal": 0.99,
  "rollingPeriod": "2419200s",
  "serviceLevelIndicator": {
    "requestBased": {
      "goodTotalRatio": {
        "badServiceFilter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"lab70-shop\" metric.label.\"response_code_class\"=\"5xx\"",
        "totalServiceFilter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.label.\"service_name\"=\"lab70-shop\" metric.label.\"response_code_class\"!=\"4xx\""
      }
    }
  }
}
EOF
export SLO_NAME="$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/services/lab70-shop/serviceLevelObjectives?serviceLevelObjectiveId=availability" \
  -d @/tmp/lab70-slo.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
echo "$SLO_NAME"
```

9. Create two burn-rate alerting policies, as Google recommends: a fast burn (10x over 1 hour) and a slow burn (2x over 24 hours). In production, the fast burn pages and the slow burn opens a ticket.

```bash
python3 - <<'EOF'
import json, os
def policy(name, lookback, threshold, doc):
    return {
        "displayName": name,
        "combiner": "OR",
        "conditions": [{
            "displayName": f"Burn rate above {threshold} ({lookback} lookback)",
            "conditionThreshold": {
                "filter": f'select_slo_burn_rate("{os.environ["SLO_NAME"]}", "{lookback}")',
                "comparison": "COMPARISON_GT",
                "thresholdValue": threshold,
                "duration": "0s",
            },
        }],
        "notificationChannels": [os.environ["CHANNEL"]],
        "documentation": {"content": doc, "mimeType": "text/markdown"},
    }
json.dump(policy("lab70 fast burn (10x over 1h)", "3600s", 10,
                 "The error budget burns 10 times too fast. Mitigate first: roll back to the last good revision (lab 70, step 11)."),
          open("/tmp/lab70-fast.json", "w"), indent=2)
json.dump(policy("lab70 slow burn (2x over 24h)", "86400s", 2,
                 "The error budget burns 2 times too fast. Open a ticket and investigate during working hours."),
          open("/tmp/lab70-slow.json", "w"), indent=2)
EOF
cat /tmp/lab70-fast.json
gcloud monitoring policies create --policy-from-file=/tmp/lab70-fast.json
gcloud monitoring policies create --policy-from-file=/tmp/lab70-slow.json
```

10. Send healthy traffic for about three minutes. Then ship a "bad release" that fails 30% of checkouts, and send traffic again.

```bash
for i in $(seq 1 600); do curl -s -o /dev/null -w '%{http_code}\n' "$URL/checkout"; done | sort | uniq -c
gcloud run services update lab70-shop --region="$REGION" --update-env-vars=FAIL_RATE=0.3
for i in $(seq 1 900); do curl -s -o /dev/null -w '%{http_code}\n' "$URL/checkout"; done | sort | uniq -c
```

In the console, open **Monitoring > SLOs** (or **Monitoring > Services > lab70-shop**) and watch the error budget. Within about 10 minutes, the fast-burn policy opens an alert and sends an email. Read the documentation text in the email.

11. Mitigate first: send all traffic back to the last good revision. You find the cause after users are safe.

```bash
gcloud run services update-traffic lab70-shop --region="$REGION" --to-revisions="${GOOD_REV}=100"
for i in $(seq 1 300); do curl -s -o /dev/null -w '%{http_code}\n' "$URL/checkout"; done | sort | uniq -c
```

12. Find the cause with Observability Analytics. In the console, open **Logging > Observability Analytics** (older consoles show **Log Analytics**), paste the query, replace `PROJECT_ID`, and run it. The query computes the error ratio per minute and per revision, which the Logs Explorer cannot do.

```sql
SELECT
  TIMESTAMP_TRUNC(timestamp, MINUTE) AS minute,
  JSON_VALUE(resource.labels.revision_name) AS revision,
  COUNT(*) AS requests,
  COUNTIF(http_request.status >= 500) AS errors,
  ROUND(SAFE_DIVIDE(COUNTIF(http_request.status >= 500), COUNT(*)), 3) AS error_ratio
FROM `PROJECT_ID.global.lab70-analytics._AllLogs`
WHERE http_request IS NOT NULL
GROUP BY minute, revision
ORDER BY minute DESC
LIMIT 100
```

13. Query the same events in BigQuery. Logging creates one table per log name. The application's stdout log becomes the `run_googleapis_com_stdout` table.

```bash
bq query --use_legacy_sql=false \
  "SELECT jsonPayload.event AS event, COUNT(*) AS entries
   FROM \`${PROJECT_ID}.lab70_logs.run_googleapis_com_stdout\`
   GROUP BY event ORDER BY entries DESC"
```

## Check your work

```bash
gcloud monitoring policies list --filter='displayName:lab70' --format='table(displayName,enabled)'
gcloud monitoring uptime list-configs --filter='displayName:lab70' --format='value(displayName)'
gcloud logging metrics describe lab70_payment_failures --format='value(filter)'
gcloud logging sinks describe lab70-to-bq --format='value(destination)'
gcloud run services describe lab70-shop --region="$REGION" --format='value(status.traffic)'
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}/services/lab70-shop/serviceLevelObjectives" \
  | python3 -c 'import json,sys; [print(s["displayName"], s["goal"]) for s in json.load(sys.stdin).get("serviceLevelObjectives", [])]'
```

Expected results:

- Two policies, `lab70 fast burn (10x over 1h)` and `lab70 slow burn (2x over 24h)`, both enabled.
- One uptime check, `lab70-shop-uptime`.
- The metric filter ends with `jsonPayload.event="payment_failed"`.
- The sink destination is `bigquery.googleapis.com/projects/<your project>/datasets/lab70_logs`.
- The traffic shows 100% on the revision in `$GOOD_REV`.
- The SLO prints `99% of lab70-shop requests succeed (rolling 28 days) 0.99`.
- The Observability Analytics query shows an `error_ratio` near 0.3 on the bad revision and 0 on the good revision.
- The BigQuery query shows counts for `order_placed` and `payment_failed`.

## Explore

1. The SLO's total filter excludes 4xx responses. Why?

<details><summary>Answer</summary>

A 4xx response is usually a client error, not a failure of the service. If you count it as bad, a misbehaving client can burn your error budget. Google's Cloud Run SLI example also excludes 4xx from the total ([Request-response services](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/sli-metrics/req-resp-metrics)).

</details>

2. Why not one alert policy with a 28-day lookback that matches the SLO period?

<details><summary>Answer</summary>

Cloud Monitoring cannot alert on burn rate with a lookback longer than 24 hours. A long window also detects a sudden outage late. Google recommends a fast-burn policy with a short lookback and a slow-burn policy with a longer one ([Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate)).

</details>

3. You created the log-based metric in step 5, before any traffic. What would it show if you created it after step 10?

<details><summary>Answer</summary>

Nothing for the earlier failures. A user-defined log-based metric counts only entries that arrive after you create it ([Log-based metrics overview](https://docs.cloud.google.com/logging/docs/logs-based-metrics)). The same is true for sinks, which is why the routes came first ([Route log entries](https://docs.cloud.google.com/logging/docs/routing/overview)).

</details>

4. This lab created a new bucket for Observability Analytics instead of upgrading `_Default`. Why?

<details><summary>Answer</summary>

You cannot undo an upgrade of a log bucket ([Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets)). A separate bucket also keeps this lab's retention and access separate. The cost is that the entries are stored twice, in `_Default` and in `lab70-analytics`.

</details>

## Clean up

```bash
bash labs/70-observability-slo/teardown.sh
```

The script deletes, in order:

- The two alerting policies, the SLO, the custom service, and the email notification channel.
- The uptime check and the log-based metric.
- The sinks `lab70-to-analytics` and `lab70-to-bq`, and the sink writer's two role bindings.
- The BigQuery dataset `lab70_logs`.
- The log bucket `lab70-analytics`. Cloud Logging keeps it in the `DELETE_REQUESTED` state for 7 days. During that time you cannot create a bucket with the same name. To rerun the lab sooner, restore it with `gcloud logging buckets undelete lab70-analytics --location=global`.
- The Cloud Run service `lab70-shop` and its image in the `cloud-run-source-deploy` repository.

It keeps the `roles/run.builder` binding for the Compute Engine default service account, the `cloud-run-source-deploy` repository, and the Cloud Build source bucket, because other labs can use them.

## Docs used

- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Allowing public (unauthenticated) access](https://docs.cloud.google.com/run/docs/authenticating/public)
- [Logging and viewing logs in Cloud Run](https://docs.cloud.google.com/run/docs/logging)
- [Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets)
- [Route logs to supported destinations](https://docs.cloud.google.com/logging/docs/export/configure_export_v2)
- [View logs routed to BigQuery](https://docs.cloud.google.com/logging/docs/export/bigquery)
- [Log-based metrics overview](https://docs.cloud.google.com/logging/docs/logs-based-metrics)
- [Synthetic monitoring overview](https://docs.cloud.google.com/monitoring/uptime-checks/introduction)
- [Create and manage notification channels by API](https://docs.cloud.google.com/monitoring/alerts/using-channels-api)
- [Working with the API (SLOs)](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/api/using-api)
- [Request-response services (Cloud Run SLIs)](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/sli-metrics/req-resp-metrics)
- [Creating an alerting policy (SLO API)](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/api/create-policy-api)
- [Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate)
- [Sample SQL queries](https://docs.cloud.google.com/logging/docs/analyze/examples)
- [Google Cloud Observability pricing](https://cloud.google.com/products/observability/pricing)
