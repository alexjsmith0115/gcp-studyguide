#!/usr/bin/env bash
# Deletes everything that pcd/labs/50-cloud-build-artifact-registry creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

BUILD_SA="lab50-builder@${PROJECT_ID}.iam.gserviceaccount.com"

# Deleting the repository deletes all of its contents.
echo "Deleting the Artifact Registry repository lab50-repo and all its images..."
gcloud artifacts repositories delete lab50-repo --location="$REGION" --quiet || true

echo "Deleting the bucket gs://lab50-${PROJECT_ID} and the uploaded build sources..."
gcloud storage rm --recursive "gs://lab50-${PROJECT_ID}" --quiet || true

echo "Removing the project-level roles from lab50-builder..."
for role in roles/logging.logWriter roles/ondemandscanning.admin; do
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${BUILD_SA}" --role="$role" \
    --condition=None --quiet > /dev/null || true
done

echo "Deleting the service account lab50-builder..."
gcloud iam service-accounts delete "$BUILD_SA" --quiet || true

# While the Container Scanning API is on, every new image in a Docker repository is scanned and billed.
# On-Demand Scanning bills only the scans that you run, so its API can stay on.
echo "Disabling the Container Scanning API to stop automatic scan charges..."
gcloud services disable containerscanning.googleapis.com --quiet || true

echo "Lab 50 teardown finished. The build history and the build logs stay."
