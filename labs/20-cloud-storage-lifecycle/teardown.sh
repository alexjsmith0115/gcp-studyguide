#!/usr/bin/env bash
# Teardown for lab 20-cloud-storage-lifecycle. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

BUCKET="lab20-${PROJECT_ID}-data"
AUTO_BUCKET="lab20-${PROJECT_ID}-auto"
SIGNER="lab20-signer@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Removing the retention policy from the data bucket (it is not locked)..."
gcloud storage buckets update "gs://${BUCKET}" --clear-retention-period --quiet || true

echo "Releasing any object holds..."
gcloud storage objects update "gs://${BUCKET}/**" --all-versions \
  --no-temporary-hold --no-event-based-hold --quiet || true

echo "Turning off soft delete, so that the deletion is permanent..."
gcloud storage buckets update "gs://${BUCKET}" --clear-soft-delete --quiet || true
gcloud storage buckets update "gs://${AUTO_BUCKET}" --clear-soft-delete --quiet || true

echo "Deleting all objects, all versions, and both buckets..."
gcloud storage rm --recursive --all-versions "gs://${BUCKET}" --quiet || true
gcloud storage rm --recursive --all-versions "gs://${AUTO_BUCKET}" --quiet || true

echo "Deleting the signer service account..."
gcloud iam service-accounts delete "$SIGNER" --quiet || true

echo "Lab 20 teardown finished."
