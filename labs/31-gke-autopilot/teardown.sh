#!/usr/bin/env bash
# Deletes everything that lab 31 creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

BUCKET="${PROJECT_ID}-lab31"
NODE_SA="lab31-nodes@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deleting the GKE cluster lab31-cluster (about 5 minutes)..."
gcloud container clusters delete lab31-cluster --location="$REGION" --quiet || true

echo "Deleting the bucket gs://${BUCKET}..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true
gcloud storage buckets delete "gs://${BUCKET}" --quiet || true

echo "Deleting the node service account..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${NODE_SA}" \
  --role="roles/container.defaultNodeServiceAccount" \
  --condition=None --quiet >/dev/null || true
gcloud iam service-accounts delete "$NODE_SA" --quiet || true

echo "Deleting firewall rules left in lab31-vpc..."
for rule in $(gcloud compute firewall-rules list --filter="network:lab31-vpc" --format="value(name)" 2>/dev/null); do
  gcloud compute firewall-rules delete "$rule" --quiet || true
done

echo "Deleting the subnet and the VPC..."
gcloud compute networks subnets delete lab31-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab31-vpc --quiet || true

rm -f "$HOME/.kube/lab31-config"
echo "Lab 31 teardown finished."
