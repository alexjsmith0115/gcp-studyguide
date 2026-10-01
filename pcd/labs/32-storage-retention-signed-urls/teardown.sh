#!/usr/bin/env bash
# Deletes everything that pcd/labs/32-storage-retention-signed-urls creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

BUCKET="lab32-${PROJECT_ID}"
SIGNER_SA="lab32-signer@${PROJECT_ID}.iam.gserviceaccount.com"

# The lab never locks the retention policy, so you can remove it. You cannot remove a
# locked policy: the bucket stays until every object meets the retention period.
echo "Removing the retention policy and the default event-based hold from gs://${BUCKET}..."
gcloud storage buckets update "gs://${BUCKET}" --clear-retention-period --quiet || true
gcloud storage buckets update "gs://${BUCKET}" --no-default-event-based-hold --quiet || true

# A hold blocks a delete even when the bucket has no retention policy.
echo "Releasing the object holds on all object versions..."
gcloud storage objects update "gs://${BUCKET}/**" --all-versions \
  --no-event-based-hold --no-temporary-hold --quiet || true

# --recursive deletes all object versions, then the bucket. Soft delete is off for this
# bucket, so nothing stays in a soft-deleted state.
echo "Deleting all object versions and the bucket gs://${BUCKET}..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

# The bucket-level role bindings went with the bucket. The Token Creator bindings are
# in the IAM policy of lab32-signer, so they go with the service account.
echo "Deleting the service account lab32-signer..."
gcloud iam service-accounts delete "$SIGNER_SA" --quiet || true

rm -rf "${TMPDIR:-/tmp}/lab32"
echo "Lab 32 teardown finished. The enabled APIs stay."
