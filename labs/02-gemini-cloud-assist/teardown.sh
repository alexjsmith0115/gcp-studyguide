#!/usr/bin/env bash
# Teardown for lab 02-gemini-cloud-assist. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

LAB_USER="$(gcloud config get-value account 2>/dev/null)"
LAB_BUCKET="gs://lab02-${PROJECT_ID}"

echo "Deleting bucket ${LAB_BUCKET} (objects, then the bucket)..."
gcloud storage rm --recursive "${LAB_BUCKET}/" --quiet || true

echo "Deleting service account lab02-reader..."
gcloud iam service-accounts delete "lab02-reader@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true

echo "Removing the lab role bindings for ${LAB_USER}..."
for ROLE in roles/geminicloudassist.user roles/cloudasset.viewer \
  roles/cloudhub.operator roles/recommender.viewer roles/cloudaicompanion.settingsAdmin; do
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="user:${LAB_USER}" --role="$ROLE" --condition=None --quiet >/dev/null || true
done

echo "Disabling the Gemini Cloud Assist API..."
gcloud services disable geminicloudassist.googleapis.com --project="$PROJECT_ID" --quiet || true

echo "Teardown complete."
