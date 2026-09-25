#!/usr/bin/env bash
# Deletes everything that lab 60 creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

LAB_DIR="labs/60-terraform-basics"
STATE_BUCKET="gs://lab60-tfstate-${PROJECT_ID}"

# 1. Let Terraform destroy what its state still tracks. Remove the import
#    file first: destroy uses the state, and an import block can fail when
#    its target no longer exists.
rm -f "$LAB_DIR/import.tf" "$LAB_DIR/generated.tf"
if [ -d "$LAB_DIR/.terraform" ]; then
  terraform -chdir="$LAB_DIR" destroy -auto-approve -input=false || true
fi

# 2. Delete anything that is left, in dependency order.
gcloud compute instances delete lab60-vm --zone="$ZONE" --quiet || true
gcloud compute firewall-rules delete lab60-allow-icmp-internal --quiet || true
gcloud compute firewall-rules delete lab60-vpc-allow-iap-ssh --quiet || true
gcloud compute networks subnets delete lab60-subnet --region="$REGION" --quiet || true
gcloud compute networks delete lab60-vpc --quiet || true

# 3. Delete the state bucket, including all noncurrent object versions.
gcloud storage rm --recursive "${STATE_BUCKET}" --quiet || true

# 4. Delete the local Terraform files.
rm -rf "$LAB_DIR/.terraform" "$LAB_DIR/.terraform.lock.hcl" "$LAB_DIR/tfplan"

echo "Lab 60 teardown finished."
