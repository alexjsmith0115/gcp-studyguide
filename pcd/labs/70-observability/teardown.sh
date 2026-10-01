#!/usr/bin/env bash
# Deletes everything that pcd/labs/70-observability creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

FRONTEND_SA="lab70-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
BACKEND_SA="lab70-backend@${PROJECT_ID}.iam.gserviceaccount.com"

# The alerting policy refers to the channel and to the metric, so it goes first.
echo "Deleting the alerting policy lab70-payment-failures..."
for p in $(gcloud monitoring policies list \
    --filter='displayName="lab70-payment-failures"' --format='value(name)'); do
  gcloud monitoring policies delete "$p" --quiet || true
done

# No GA command manages notification channels, so these two commands use beta.
echo "Deleting the notification channel lab70-email..."
for c in $(gcloud beta monitoring channels list \
    --filter='displayName="lab70-email"' --format='value(name)'); do
  gcloud beta monitoring channels delete "$c" --force --quiet || true
done

echo "Deleting the log-based metric lab70-payment-failures..."
gcloud logging metrics delete lab70-payment-failures --quiet || true

echo "Removing the Cloud Run Invoker role of lab70-frontend from lab70-backend..."
gcloud run services remove-iam-policy-binding lab70-backend --region="$REGION" \
  --member="serviceAccount:${FRONTEND_SA}" --role=roles/run.invoker \
  --quiet > /dev/null || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's images.
for s in lab70-frontend lab70-backend; do
  echo "Deleting the Cloud Run service ${s} and its image..."
  gcloud run services delete "$s" --region="$REGION" --quiet || true
  gcloud artifacts docker images delete \
    "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${s}" \
    --delete-tags --quiet || true
done

echo "Removing the project roles of the two service accounts..."
for sa in "$FRONTEND_SA" "$BACKEND_SA"; do
  for role in roles/telemetry.tracesWriter roles/serviceusage.serviceUsageConsumer; do
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${sa}" --role="$role" \
      --condition=None --quiet > /dev/null || true
  done
done

# Only the optional Gemini Cloud Assist step adds these roles. If you skipped it, nothing changes.
echo "Removing the roles of the optional Gemini Cloud Assist step from your account..."
ME="user:$(gcloud config get-value account 2>/dev/null)"
for role in roles/geminicloudassist.user roles/cloudasset.viewer; do
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="$ME" --role="$role" \
    --condition=None --quiet > /dev/null 2>&1 || true
done

echo "Deleting the service accounts..."
gcloud iam service-accounts delete "$FRONTEND_SA" --quiet || true
gcloud iam service-accounts delete "$BACKEND_SA" --quiet || true

echo "Lab 70 teardown finished. These stay: the enabled APIs, the cloud-run-source-deploy"
echo "repository, the log entries, the error group, and the _Trace bucket (you cannot delete it)."
