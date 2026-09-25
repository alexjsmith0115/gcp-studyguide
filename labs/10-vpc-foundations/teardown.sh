#!/usr/bin/env bash
# Teardown for lab 10-vpc-foundations. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the Connectivity Tests..."
for test in lab10-ct-internet lab10-ct-ssh-internal; do
  gcloud network-management connectivity-tests delete "$test" --quiet || true
done

echo "Deleting the VM..."
gcloud compute instances delete lab10-vm --zone="$ZONE" --quiet || true

echo "Deleting the VPC Flow Logs configuration..."
gcloud network-management vpc-flow-logs-configs delete lab10-flow-logs \
    --location=global --quiet || true

echo "Deleting the Cloud NAT gateway and the Cloud Router..."
gcloud compute routers nats delete lab10-nat --router=lab10-router \
    --region="$REGION" --quiet || true
gcloud compute routers delete lab10-router --region="$REGION" --quiet || true

echo "Deleting the firewall policy association and the policy..."
gcloud compute network-firewall-policies associations delete \
    --firewall-policy=lab10-fw-policy --name=lab10-fw-assoc \
    --global-firewall-policy --quiet || true
gcloud compute network-firewall-policies delete lab10-fw-policy \
    --global --quiet || true

echo "Deleting the subnet and the VPC network..."
gcloud compute networks subnets delete lab10-subnet --region="$REGION" \
    --quiet || true
gcloud compute networks delete lab10-vpc --quiet || true

echo "Remaining lab10 networks (expect none):"
gcloud compute networks list --filter="name~^lab10-" --format="value(name)" || true
echo "Lab 10 teardown finished."
