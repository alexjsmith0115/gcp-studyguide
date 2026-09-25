#!/usr/bin/env bash
# Teardown for lab 13-private-service-connect. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the optional endpoint for Google APIs..."
gcloud compute forwarding-rules delete lab13gapis --global --quiet || true
gcloud compute addresses delete lab13-gapis-ip --global --quiet || true

echo "Deleting the consumer endpoint and its IP address..."
gcloud compute forwarding-rules delete lab13-psc-endpoint --region="$REGION" --quiet || true
gcloud compute addresses delete lab13-psc-endpoint-ip --region="$REGION" --quiet || true

echo "Deleting the consumer VM..."
gcloud compute instances delete lab13-consumer-vm --zone="$ZONE" --quiet || true

echo "Deleting the service attachment..."
gcloud compute service-attachments delete lab13-svc-attachment --region="$REGION" --quiet || true

echo "Deleting the internal passthrough Network Load Balancer..."
gcloud compute forwarding-rules delete lab13-producer-fr --region="$REGION" --quiet || true
gcloud compute backend-services delete lab13-producer-bs --region="$REGION" --quiet || true
gcloud compute health-checks delete lab13-hc --region="$REGION" --quiet || true
gcloud compute instance-groups unmanaged delete lab13-producer-ig --zone="$ZONE" --quiet || true

echo "Deleting the producer VM..."
gcloud compute instances delete lab13-producer-vm --zone="$ZONE" --quiet || true

echo "Deleting the firewall rules..."
for rule in lab13-producer-allow-hc lab13-producer-allow-psc-nat lab13-consumer-allow-iap-ssh; do
  gcloud compute firewall-rules delete "$rule" --quiet || true
done

echo "Deleting the subnets..."
for subnet in lab13-psc-nat-subnet lab13-producer-subnet lab13-consumer-subnet; do
  gcloud compute networks subnets delete "$subnet" --region="$REGION" --quiet || true
done

echo "Deleting the VPC networks..."
for net in lab13-producer-vpc lab13-consumer-vpc; do
  gcloud compute networks delete "$net" --quiet || true
done

echo "Remaining lab13 networks (expect none):"
gcloud compute networks list --filter="name~^lab13-" --format="value(name)" || true
echo "Lab 13 teardown finished."
