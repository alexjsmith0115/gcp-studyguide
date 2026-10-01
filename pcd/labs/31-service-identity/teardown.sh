#!/usr/bin/env bash
# Deletes everything that pcd/labs/31-service-identity creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

FRONTEND_SA="lab31-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
BACKEND_SA="lab31-backend@${PROJECT_ID}.iam.gserviceaccount.com"

# The Cloud Run Invoker binding for lab31-frontend is in the IAM policy of
# lab31-backend, so it goes with the service.
echo "Deleting the Cloud Run services lab31-frontend and lab31-backend..."
gcloud run services delete lab31-frontend --region="$REGION" --quiet || true
gcloud run services delete lab31-backend --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's images.
echo "Deleting the lab31 images from the cloud-run-source-deploy repository..."
for image in lab31-frontend lab31-backend; do
  gcloud artifacts docker images delete \
    "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${image}" \
    --delete-tags --quiet || true
done

# Your Token Creator binding is in the IAM policy of the lab31-frontend service
# account, so it goes with the service account. The lab grants no project-level roles.
echo "Deleting the service accounts lab31-frontend and lab31-backend..."
gcloud iam service-accounts delete "$FRONTEND_SA" --quiet || true
gcloud iam service-accounts delete "$BACKEND_SA" --quiet || true

echo "Lab 31 teardown finished. The enabled APIs and the cloud-run-source-deploy repository stay."
