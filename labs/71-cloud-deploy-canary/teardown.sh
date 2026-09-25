#!/usr/bin/env bash
# Teardown for lab 71-cloud-deploy-canary. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

BUILDER="lab71-builder@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER="lab71-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME="lab71-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

# The release source bucket is named after the pipeline UID, so read it first.
PIPELINE_UID="$(gcloud deploy delivery-pipelines describe lab71-pipeline --region="$REGION" \
  --format='value(uid)' 2>/dev/null)"

echo "Deleting the delivery pipeline (with its releases and rollouts) and the targets..."
gcloud deploy delivery-pipelines delete lab71-pipeline --region="$REGION" --force --quiet || true
gcloud deploy targets delete lab71-prod --region="$REGION" --quiet || true
gcloud deploy targets delete lab71-staging --region="$REGION" --quiet || true

echo "Deleting the Cloud Run services..."
gcloud run services delete lab71-app-prod --region="$REGION" --quiet || true
gcloud run services delete lab71-app-staging --region="$REGION" --quiet || true

echo "Deleting the Artifact Registry repository and its images..."
gcloud artifacts repositories delete lab71-repo --location="$REGION" --quiet || true

echo "Deleting the Cloud Storage buckets that Cloud Deploy created..."
if [ -n "$PIPELINE_UID" ]; then
  gcloud storage rm --recursive "gs://${PIPELINE_UID}_clouddeploy" --quiet || true
else
  echo "  Pipeline not found. Look for a leftover bucket that ends in _clouddeploy:"
  echo "  gcloud storage buckets list --format='value(name)' | grep _clouddeploy"
fi
gcloud storage rm --recursive "gs://${REGION}.deploy-artifacts.${PROJECT_ID}.appspot.com" --quiet || true

echo "Removing the project role bindings of the lab service accounts..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${BUILDER}" \
  --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null || true
gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER}" \
  --role=roles/clouddeploy.jobRunner --condition=None --quiet >/dev/null || true
gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER}" \
  --role=roles/run.developer --condition=None --quiet >/dev/null || true

echo "Deleting the service accounts..."
for sa in "$RUNTIME" "$DEPLOYER" "$BUILDER"; do
  gcloud iam service-accounts delete "$sa" --quiet || true
done

rm -rf /tmp/lab71-deploy /tmp/lab71-clouddeploy.yaml
echo "Lab 71 teardown finished."
