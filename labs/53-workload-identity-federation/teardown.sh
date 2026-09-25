#!/usr/bin/env bash
# Teardown for lab 53-workload-identity-federation. Safe to run more than once.
#
#   bash labs/53-workload-identity-federation/teardown.sh
#
# Deletes the bucket, the service account, and the workload identity pool with its providers.
# A deleted pool stays for 30 days. You can undelete it in that time, and its name stays reserved.
# If you used a different pool name, run this script in the lab shell, or pass POOL=NAME.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

POOL="${POOL:-lab53-pool}"
BUCKET="lab53-${PROJECT_ID}-artifacts"
SA_EMAIL="lab53-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deleting the bucket, its object, and its role bindings..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

echo "Deleting the service account and its role bindings..."
gcloud iam service-accounts delete "$SA_EMAIL" --quiet || true

echo "Deleting the workload identity pool ${POOL} and its providers..."
gcloud iam workload-identity-pools delete "$POOL" --location=global --quiet || true

echo "Lab 53 teardown finished."
echo "The local files are not deleted. In the lab shell, run: rm -rf \"\$LAB53_TMP\""
