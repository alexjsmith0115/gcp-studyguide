#!/usr/bin/env bash
# Teardown for lab 70-observability-slo. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

TOKEN="$(gcloud auth print-access-token)"
API="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}"

echo "Deleting alerting policies..."
for p in $(gcloud monitoring policies list --filter='displayName:lab70' --format='value(name)'); do
  gcloud monitoring policies delete "$p" --quiet || true
done

echo "Deleting the SLO and the custom service..."
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "${API}/services/lab70-shop/serviceLevelObjectives/availability" >/dev/null || true
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "${API}/services/lab70-shop" >/dev/null || true

echo "Deleting the email notification channel..."
for c in $(curl -s -H "Authorization: Bearer $TOKEN" "${API}/notificationChannels" \
    | python3 -c 'import json,sys; [print(c["name"]) for c in json.load(sys.stdin).get("notificationChannels", []) if c.get("displayName") == "lab70 email"]'); do
  curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "https://monitoring.googleapis.com/v3/${c}?force=true" >/dev/null || true
done

echo "Deleting the uptime check..."
for u in $(gcloud monitoring uptime list-configs --filter='displayName=lab70-shop-uptime' --format='value(name)'); do
  gcloud monitoring uptime delete "$u" --quiet || true
done

echo "Deleting the log-based metric..."
gcloud logging metrics delete lab70_payment_failures --quiet || true

echo "Deleting the sinks and the sink writer's role bindings..."
WRITER="$(gcloud logging sinks describe lab70-to-bq --format='value(writerIdentity)' 2>/dev/null)"
gcloud logging sinks delete lab70-to-bq --quiet || true
gcloud logging sinks delete lab70-to-analytics --quiet || true
if [ -n "$WRITER" ]; then
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="$WRITER" \
    --role=roles/bigquery.dataEditor --condition=None --quiet >/dev/null || true
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="$WRITER" \
    --role=roles/logging.logWriter --condition=None --quiet >/dev/null || true
fi

echo "Deleting the BigQuery dataset..."
bq rm -r -f -d "${PROJECT_ID}:lab70_logs" || true

echo "Deleting the log bucket (it stays in DELETE_REQUESTED for 7 days)..."
gcloud logging buckets delete lab70-analytics --location=global --quiet || true

echo "Deleting the Cloud Run service and its image..."
gcloud run services delete lab70-shop --region="$REGION" --quiet || true
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab70-shop" \
  --delete-tags --quiet || true

rm -f /tmp/lab70-slo.json /tmp/lab70-fast.json /tmp/lab70-slow.json
echo "Lab 70 teardown finished."
