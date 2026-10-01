#!/usr/bin/env bash
# Deletes everything that pcd/labs/40-cloud-sql-connector creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

INSTANCE=lab40-pg
RUN_SA="lab40-run@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Stopping the local Cloud SQL Auth Proxy, if it still runs..."
pkill -f "40-cloud-sql-connector/cloud-sql-proxy" || true

echo "Deleting the Cloud Run service lab40-app..."
gcloud run services delete lab40-app --region="$REGION" --quiet || true

# Deletion protection blocks the delete, so turn it off first.
# Deleting the instance also deletes its databases and database users.
echo "Deleting the Cloud SQL instance ${INSTANCE}..."
gcloud sql instances patch "$INSTANCE" --no-deletion-protection --quiet || true
gcloud sql instances delete "$INSTANCE" --quiet || true

echo "Removing the project roles of lab40-run, then deleting the service account..."
for role in roles/cloudsql.client roles/cloudsql.instanceUser; do
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUN_SA}" --role="$role" \
    --condition=None --quiet > /dev/null || true
done
gcloud iam service-accounts delete "$RUN_SA" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab40-app image (all versions and tags) from cloud-run-source-deploy..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab40-app" \
  --delete-tags --quiet || true

echo "Deleting the downloaded Cloud SQL Auth Proxy binary..."
rm -f pcd/labs/40-cloud-sql-connector/cloud-sql-proxy

echo "Lab 40 teardown finished. The enabled APIs and the cloud-run-source-deploy repository stay."
