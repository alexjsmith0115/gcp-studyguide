#!/usr/bin/env bash
# Deletes everything that pcd/labs/62-memorystore-cache creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

INSTANCE=lab62-cache
RUN_SA="lab62-run@${PROJECT_ID}.iam.gserviceaccount.com"

# Delete the service first, so that no client uses the instance or the secret.
echo "Deleting the Cloud Run service lab62-app..."
gcloud run services delete lab62-app --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab62-app image (all versions and tags) from cloud-run-source-deploy..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab62-app" \
  --delete-tags --quiet || true

echo "Deleting the Redis instance ${INSTANCE} and all its data..."
gcloud redis instances delete "$INSTANCE" --region="$REGION" --quiet || true

# Deleting the secret also deletes its versions and its IAM policy (the grant to lab62-run).
echo "Deleting the secret lab62-redis-auth..."
gcloud secrets delete lab62-redis-auth --quiet || true

# lab62-run has no project-level roles: its only grant was on the secret.
echo "Deleting the service account lab62-run..."
gcloud iam service-accounts delete "$RUN_SA" --quiet || true

echo "Deleting the downloaded CA file..."
rm -f pcd/labs/62-memorystore-cache/app/server-ca.pem

echo "Lab 62 teardown finished. The enabled APIs, the default network, and the cloud-run-source-deploy repository stay."
