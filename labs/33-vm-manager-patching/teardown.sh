#!/usr/bin/env bash
# Teardown for lab 33-vm-manager-patching. You can run it more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the OS policy assignment..."
gcloud compute os-config os-policy-assignments delete lab33-tree --location="$ZONE" --quiet || true

echo "Deleting the patch deployment..."
gcloud compute os-config patch-deployments delete lab33-weekly-prod --quiet || true

echo "Deleting the VMs..."
for VM in lab33-dev-vm lab33-prod-vm; do
  gcloud compute instances delete "$VM" --zone="$ZONE" --quiet || true
done

echo "Deleting the Cloud NAT gateway and the Cloud Router..."
gcloud compute routers nats delete lab33-nat --router=lab33-router --region="$REGION" --quiet || true
gcloud compute routers delete lab33-router --region="$REGION" --quiet || true

echo "Deleting the subnet and the VPC network..."
gcloud compute networks subnets delete lab33-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab33-vpc --quiet || true

echo "Deleting the service account..."
gcloud iam service-accounts delete "lab33-vm-sa@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true

echo "Patch job records stay in the project history. The API has no delete method for them."
echo "Lab 33 teardown finished."
