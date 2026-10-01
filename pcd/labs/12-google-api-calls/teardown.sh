#!/usr/bin/env bash
# Deletes everything that pcd/labs/12-google-api-calls creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

LAB12_BUCKET="lab12-${PROJECT_ID}"
CALLER_SA="lab12-caller@${PROJECT_ID}.iam.gserviceaccount.com"
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"

echo "Removing the Storage Object Viewer binding of lab12-caller from the bucket..."
gcloud storage buckets remove-iam-policy-binding "gs://${LAB12_BUCKET}" \
  --member="serviceAccount:${CALLER_SA}" --role=roles/storage.objectViewer \
  --quiet > /dev/null || true

echo "Deleting the bucket ${LAB12_BUCKET} and its objects..."
gcloud storage rm --recursive "gs://${LAB12_BUCKET}" --quiet || true

echo "Removing your Service Account Token Creator binding from lab12-caller..."
gcloud iam service-accounts remove-iam-policy-binding "$CALLER_SA" \
  --member="user:${ACCOUNT}" --role=roles/iam.serviceAccountTokenCreator \
  --quiet > /dev/null || true

echo "Deleting the service account lab12-caller..."
gcloud iam service-accounts delete "$CALLER_SA" --quiet || true

echo "Deleting the local work folder (objects, batch file, and Python virtual environment)..."
rm -rf "${TMPDIR:-/tmp}/lab12" || true

echo "Lab 12 teardown finished. The enabled APIs stay."
