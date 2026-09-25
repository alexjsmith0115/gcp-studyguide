#!/usr/bin/env bash
# Deletes everything that lab 32 creates. Safe to run more than once.
# Cloud Run keeps Direct VPC egress IP addresses for 1-2 hours after the job and service are gone.
# Until then the subnet and VPC deletes fail. Run this script again after the wait.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the Cloud Run job and service..."
gcloud run jobs delete lab32-probe --region="$REGION" --quiet || true
gcloud run services delete lab32-hello --region="$REGION" --quiet || true

echo "Deleting the backend VM and the firewall rule..."
gcloud compute instances delete lab32-backend --zone="$ZONE" --quiet || true
gcloud compute firewall-rules delete lab32-allow-run-to-backend --quiet || true

echo "Deleting the service accounts..."
gcloud iam service-accounts delete "lab32-caller@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true
gcloud iam service-accounts delete "lab32-hello-sa@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true

echo "Deleting the subnets and the VPC..."
gcloud compute networks subnets delete lab32-vm-subnet --region="$REGION" --quiet || true
gcloud compute networks subnets delete lab32-run-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab32-vpc --quiet || true

if gcloud compute networks describe lab32-vpc >/dev/null 2>&1; then
  echo "NOTE: lab32-vpc still exists. Cloud Run releases the IP addresses in lab32-run-subnet"
  echo "      1-2 hours after the job and service are deleted. Run this script again after that."
  echo "      The VPC and subnet cost nothing while they wait."
else
  echo "Lab 32 teardown finished."
fi
