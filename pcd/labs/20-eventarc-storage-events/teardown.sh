#!/usr/bin/env bash
# Deletes everything that pcd/labs/20-eventarc-storage-events creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

BUCKET="lab20-${PROJECT_ID}"
RUN_SA="lab20-receiver@${PROJECT_ID}.iam.gserviceaccount.com"
TRIGGER_SA="lab20-trigger@${PROJECT_ID}.iam.gserviceaccount.com"

# Get the name of the transport subscription before the trigger is deleted.
SUB="$(gcloud eventarc triggers describe lab20-trigger --location="$REGION" \
  --format='value(transport.pubsub.subscription)' 2>/dev/null)"

echo "Deleting the Eventarc trigger lab20-trigger..."
gcloud eventarc triggers delete lab20-trigger --location="$REGION" --quiet || true

# Eventarc deletes the transport topic that it created. Delete the subscription if it still exists.
if [ -n "$SUB" ]; then
  gcloud pubsub subscriptions delete "$SUB" --quiet 2>/dev/null || true
fi

echo "Deleting the Cloud Run service lab20-receiver..."
gcloud run services delete lab20-receiver --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab20-receiver image from cloud-run-source-deploy..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab20-receiver" \
  --delete-tags --quiet || true

echo "Deleting the bucket gs://${BUCKET} and all its objects..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

echo "Removing the project-level IAM bindings..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${TRIGGER_SA}" --role=roles/eventarc.eventReceiver \
  --condition=None --quiet > /dev/null || true
GCS_AGENT="$(gcloud storage service-agent --project="$PROJECT_ID" 2>/dev/null)"
if [ -n "$GCS_AGENT" ]; then
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${GCS_AGENT}" --role=roles/pubsub.publisher \
    --condition=None --quiet > /dev/null || true
fi

echo "Deleting the service accounts..."
gcloud iam service-accounts delete "$TRIGGER_SA" --quiet || true
gcloud iam service-accounts delete "$RUN_SA" --quiet || true

echo "Lab 20 teardown finished. The enabled APIs and the cloud-run-source-deploy repository stay."
