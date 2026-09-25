#!/usr/bin/env bash
# Deletes everything that lab 61 creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

LAB_DIR="labs/61-infrastructure-manager"
IM_PREFIX="projects/${PROJECT_ID}/locations/${REGION}"
IM_DEPLOYMENT="${IM_PREFIX}/deployments/lab61-deployment"
IM_SA_EMAIL="lab61-infra-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# 1. Delete the deployment and its resources. Infra Manager needs the service
#    account for this, so the account is deleted last. If the normal delete
#    fails, remove only the metadata; step 3 deletes the resources.
gcloud infra-manager deployments delete "$IM_DEPLOYMENT" --quiet \
  || gcloud infra-manager deployments delete "$IM_DEPLOYMENT" --delete-policy=abandon --quiet \
  || true

# 2. Delete the previews.
for PREVIEW in lab61-preview-create lab61-preview-update lab61-preview-drift; do
  gcloud infra-manager previews delete "${IM_PREFIX}/previews/${PREVIEW}" --quiet || true
done

# 3. Delete any resource that is left, in dependency order.
gcloud compute instances delete lab61-vm --zone="$ZONE" --quiet || true
gcloud compute firewall-rules delete lab61-vpc-allow-iap-ssh --quiet || true
gcloud compute networks subnets delete lab61-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab61-vpc --quiet || true

# 4. Remove the IAM bindings, then the service account.
for ROLE in roles/config.agent roles/compute.networkAdmin roles/compute.securityAdmin roles/compute.instanceAdmin.v1; do
  gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${IM_SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --format=none --quiet || true
done
gcloud iam service-accounts delete "$IM_SA_EMAIL" --quiet || true

# 5. Delete the Infra Manager artifact bucket, but only when no deployment
#    is left in this region. Infra Manager creates a new one when needed.
if [ -z "$(gcloud infra-manager deployments list --location="$REGION" --format="value(name)" 2>/dev/null)" ]; then
  gcloud storage rm --recursive "gs://${PROJECT_NUMBER}-${REGION}-blueprint-config" --quiet || true
fi

# 6. Delete the local files.
rm -f "$LAB_DIR"/lab61-preview* "$LAB_DIR/lab61-r0.tfstate"

echo "Lab 61 teardown finished."
