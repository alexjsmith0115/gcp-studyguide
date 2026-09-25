#!/usr/bin/env bash
# Teardown for lab 22-bigquery-design. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

ANALYST="lab22-analyst@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deleting the shared dataset and its view..."
bq rm -r -f -d "${PROJECT_ID}:lab22_shared" || true

echo "Deleting the source dataset and its tables..."
bq rm -r -f -d "${PROJECT_ID}:lab22_trips" || true

echo "Removing the BigQuery Job User role of the analyst from the project..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${ANALYST}" \
  --role="roles/bigquery.jobUser" --condition=None --format=none --quiet || true

echo "Deleting the analyst service account..."
gcloud iam service-accounts delete "$ANALYST" --quiet || true

echo "Lab 22 teardown finished."
