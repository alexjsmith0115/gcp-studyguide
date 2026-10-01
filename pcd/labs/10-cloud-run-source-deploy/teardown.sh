#!/usr/bin/env bash
# Deletes everything that pcd/labs/10-cloud-run-source-deploy creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

RUN_SA="lab10-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="lab10-builder@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deleting the Cloud Run service lab10-app and all its revisions..."
gcloud run services delete lab10-app --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab10-app image (all versions and tags) from cloud-run-source-deploy..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab10-app" \
  --delete-tags --quiet || true

echo "Removing the Cloud Run Builder role from lab10-builder..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/run.builder \
  --condition=None --quiet > /dev/null || true

echo "Deleting the service accounts..."
gcloud iam service-accounts delete "$BUILD_SA" --quiet || true
gcloud iam service-accounts delete "$RUN_SA" --quiet || true

echo "Lab 10 teardown finished. The enabled APIs and the cloud-run-source-deploy repository stay."
