#!/usr/bin/env bash
# Teardown for lab 11-global-lb-cloud-armor. You can run it more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the load balancer frontend (forwarding rule, target proxy, URL map)..."
gcloud compute forwarding-rules delete lab11-http-fr --global --quiet || true
gcloud compute target-http-proxies delete lab11-http-proxy --global --quiet || true
gcloud compute url-maps delete lab11-url-map --global --quiet || true

echo "Deleting the backend service (this also removes the Cloud Armor and Cloud CDN settings)..."
gcloud compute backend-services delete lab11-web-bes --global --quiet || true

echo "Deleting the Cloud Armor security policy..."
gcloud compute security-policies delete lab11-armor --quiet || true

echo "Deleting the health check..."
gcloud compute health-checks delete lab11-hc --global --quiet || true

echo "Deleting the MIG (the group deletes its VMs) and the instance template..."
gcloud compute instance-groups managed delete lab11-web-mig --region="$REGION" --quiet || true
gcloud compute instance-templates delete lab11-web-tmpl --region="$REGION" --quiet || true

echo "Releasing the global IP address..."
gcloud compute addresses delete lab11-lb-ip --global --quiet || true

echo "Deleting the firewall rule, the subnet, and the VPC network..."
gcloud compute firewall-rules delete lab11-allow-lb-hc --quiet || true
gcloud compute networks subnets delete lab11-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab11-vpc --quiet || true

echo "Remaining lab 11 resources (expect none):"
gcloud compute instances list --filter="name~^lab11-" || true
gcloud compute forwarding-rules list --filter="name~^lab11-" || true
gcloud compute addresses list --filter="name~^lab11-" || true
echo "Lab 11 teardown finished."
