#!/usr/bin/env bash
# Teardown for lab 30-mig-autoscaling-spot. You can run it more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the Spot VM..."
gcloud compute instances delete lab30-spot-vm --zone="$ZONE" --quiet || true

echo "Deleting the MIG (gcloud deletes its autoscaler first, then the group deletes its VMs)..."
gcloud compute instance-groups managed delete lab30-mig --region="$REGION" --quiet || true

echo "Deleting the instance templates..."
for T in lab30-template-v1 lab30-template-v2 lab30-template-spot; do
  gcloud compute instance-templates delete "$T" --region="$REGION" --quiet || true
done

echo "Deleting the health check..."
gcloud compute health-checks delete lab30-hc --global --quiet || true

echo "Deleting the firewall rules..."
for R in lab30-allow-health-checks lab30-allow-iap-ssh; do
  gcloud compute firewall-rules delete "$R" --quiet || true
done

echo "Deleting the subnet and the VPC network..."
gcloud compute networks subnets delete lab30-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab30-vpc --quiet || true

echo "Remaining lab 30 VMs (expect none):"
gcloud compute instances list --filter="name~^lab30-" || true
echo "Lab 30 teardown finished."
