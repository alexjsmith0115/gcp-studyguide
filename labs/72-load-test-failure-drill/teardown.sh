#!/usr/bin/env bash
# Teardown for lab 72-load-test-failure-drill. You can run it more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the load balancer (forwarding rule, proxy, URL map, backend service)..."
gcloud compute forwarding-rules delete lab72-fr --global --quiet || true
gcloud compute target-http-proxies delete lab72-proxy --global --quiet || true
gcloud compute url-maps delete lab72-urlmap --global --quiet || true
gcloud compute backend-services delete lab72-bs --global --quiet || true

echo "Deleting the MIG and its VMs..."
gcloud compute instance-groups managed delete lab72-mig --region="$REGION" --quiet || true

echo "Deleting the instance template and the health checks..."
gcloud compute instance-templates delete lab72-template --region="$REGION" --quiet || true
gcloud compute health-checks delete lab72-lb-hc --global --quiet || true
gcloud compute health-checks delete lab72-autoheal-hc --global --quiet || true

echo "Deleting the firewall rule, the subnet, and the VPC network..."
gcloud compute firewall-rules delete lab72-allow-lb --quiet || true
gcloud compute networks subnets delete lab72-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab72-vpc --quiet || true

echo "Deleting the Cloud Run service and its image..."
gcloud run services delete lab72-api --region="$REGION" --quiet || true
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab72-api" \
  --delete-tags --quiet || true

rm -f /tmp/lab72-drill.log /tmp/lab72-drill-plan.txt \
  /tmp/lab72-urlmap-fault.yaml /tmp/lab72-urlmap-clean.yaml

echo "Remaining lab 72 VMs (expect none):"
gcloud compute instances list --filter="name~^lab72-" || true
echo "Lab 72 teardown finished."
