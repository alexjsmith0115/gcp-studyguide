#!/usr/bin/env bash
# Teardown for lab 52-iap-ssh. Safe to run more than once.
#
#   bash labs/52-iap-ssh/teardown.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

VM="lab52-vm"
SA_EMAIL="lab52-tunnel@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Stopping IAP tunnels that are still open on this computer..."
pkill -f "start-iap-tunnel ${VM}" 2>/dev/null || true

echo "Deleting the VM..."
gcloud compute instances delete "$VM" --zone="$ZONE" --quiet || true

echo "Deleting the firewall rule, the subnet, and the network..."
gcloud compute firewall-rules delete lab52-allow-iap --quiet || true
gcloud compute networks subnets delete lab52-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab52-vpc --quiet || true

echo "Removing the service account's project role bindings, then the service account..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/iap.tunnelResourceAccessor --all --format=none || true
gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/compute.viewer --all --format=none || true
gcloud iam service-accounts delete "$SA_EMAIL" --quiet || true

echo "Lab 52 teardown finished."
