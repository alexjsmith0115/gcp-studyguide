#!/usr/bin/env bash
# Teardown for lab 12-ha-vpn-hybrid. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

if [ "$REGION" = "us-east1" ]; then REGION2=us-central1; else REGION2=us-east1; fi

echo "Deleting the VMs..."
for vm in lab12-vm-cloud lab12-vm-onprem; do
  gcloud compute instances delete "$vm" --zone="$ZONE" --quiet || true
done

echo "Deleting the firewall rules..."
for rule in lab12-cloud-allow-iap-ssh lab12-cloud-allow-icmp \
    lab12-onprem-allow-iap-ssh lab12-onprem-allow-icmp; do
  gcloud compute firewall-rules delete "$rule" --quiet || true
done

echo "Deleting the VPN tunnels..."
for tunnel in lab12-tun-cloud-if0 lab12-tun-cloud-if1 \
    lab12-tun-onprem-if0 lab12-tun-onprem-if1; do
  gcloud compute vpn-tunnels delete "$tunnel" --region="$REGION" --quiet || true
done

echo "Deleting the Cloud Routers and their BGP sessions..."
for router in lab12-router-cloud lab12-router-onprem; do
  gcloud compute routers delete "$router" --region="$REGION" --quiet || true
done

echo "Deleting the HA VPN gateways..."
for gw in lab12-gw-cloud lab12-gw-onprem; do
  gcloud compute vpn-gateways delete "$gw" --region="$REGION" --quiet || true
done

echo "Deleting the subnets..."
gcloud compute networks subnets delete lab12-cloud-a --region="$REGION" --quiet || true
gcloud compute networks subnets delete lab12-cloud-b --region="$REGION2" --quiet || true
gcloud compute networks subnets delete lab12-onprem-a --region="$REGION" --quiet || true

echo "Deleting the VPC networks..."
for net in lab12-cloud lab12-onprem; do
  gcloud compute networks delete "$net" --quiet || true
done

echo "Remaining lab12 networks (expect none):"
gcloud compute networks list --filter="name~^lab12-" --format="value(name)" || true
echo "Lab 12 teardown finished."
