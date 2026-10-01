#!/usr/bin/env bash
# Deletes everything that pcd/labs/21-pubsub-push-pull creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

RUN_SA="lab21-receiver@${PROJECT_ID}.iam.gserviceaccount.com"
PUSH_SA="lab21-push-invoker@${PROJECT_ID}.iam.gserviceaccount.com"

# Delete the subscriptions first. The IAM bindings on a subscription go with it.
echo "Deleting the subscriptions..."
for sub in lab21-push lab21-pull lab21-dead-letter-sub; do
  gcloud pubsub subscriptions delete "$sub" --quiet || true
done

echo "Deleting the topics..."
gcloud pubsub topics delete lab21-orders --quiet || true
gcloud pubsub topics delete lab21-dead-letter --quiet || true

echo "Deleting the Cloud Run service lab21-receiver..."
gcloud run services delete lab21-receiver --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab21-receiver image from cloud-run-source-deploy..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab21-receiver" \
  --delete-tags --quiet || true

echo "Deleting the service accounts..."
gcloud iam service-accounts delete "$PUSH_SA" --quiet || true
gcloud iam service-accounts delete "$RUN_SA" --quiet || true

echo "Deleting the local virtual environment..."
rm -rf "${TMPDIR:-/tmp}/lab21-venv"

echo "Lab 21 teardown finished. The enabled APIs and the cloud-run-source-deploy repository stay."
