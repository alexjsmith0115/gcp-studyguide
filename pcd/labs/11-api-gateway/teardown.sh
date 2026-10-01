#!/usr/bin/env bash
# Deletes everything that pcd/labs/11-api-gateway creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

# Same region choice as step 1 of the README.
case "$REGION" in
  asia-northeast1|australia-southeast1|europe-west1|europe-west2|us-central1|us-east1|us-east4|us-west2|us-west3|us-west4)
    GW_REGION="$REGION" ;;
  *) GW_REGION=us-central1 ;;
esac

echo "Deleting API keys with the display name lab11-key..."
for key in $(gcloud services api-keys list --filter='displayName=lab11-key' --format='value(name)' 2>/dev/null); do
  gcloud services api-keys delete "$key" --quiet || true
done

echo "Deleting the gateway (this can take several minutes)..."
gcloud api-gateway gateways delete lab11-gateway --location="$GW_REGION" --quiet || true

echo "Deleting the API config and the API..."
gcloud api-gateway api-configs delete lab11-config-v1 --api=lab11-api --quiet || true
gcloud api-gateway apis delete lab11-api --quiet || true

echo "Deleting the Cloud Run backend..."
gcloud run services delete lab11-backend --region="$REGION" --quiet || true

echo "Deleting the gateway service account..."
gcloud iam service-accounts delete "lab11-gateway-sa@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true

rm -f "${TMPDIR:-/tmp}/lab11-openapi.yaml"
echo "Lab 11 teardown finished. The enabled APIs stay."
