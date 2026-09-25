#!/usr/bin/env bash
# Teardown for lab 54-org-policy-vpc-sc. Safe to run more than once.
#
#   bash labs/54-org-policy-vpc-sc/teardown.sh
#
# Deletes the perimeter, the access level, the project-level organization policy,
# the service accounts, and the bucket. It does not delete the scoped access policy
# and does not change organization-level settings.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

BUCKET="lab54-${PROJECT_ID}-data"
CONSTRAINT="iam.managed.disableServiceAccountCreation"
POLICY_ID="${POLICY_ID:-}"

if [ -z "$POLICY_ID" ]; then
  ORG_ID="$(gcloud projects get-ancestors "$PROJECT_ID" --format="value(id,type)" 2>/dev/null \
    | awk '$2=="organization"{print $1}')"
  if [ -n "$ORG_ID" ]; then
    POLICY_ID="$(gcloud access-context-manager policies list --organization="$ORG_ID" \
      --filter="scopes:projects/${PROJECT_NUMBER}" --format="value(name.basename())" 2>/dev/null || true)"
  fi
fi

if [ -n "$POLICY_ID" ]; then
  echo "Deleting the service perimeter, then the access level (access policy ${POLICY_ID})..."
  gcloud access-context-manager perimeters delete lab54_perimeter --policy="$POLICY_ID" --quiet || true
  gcloud access-context-manager levels delete lab54_my_ip --policy="$POLICY_ID" --quiet || true
else
  echo "No access policy found for this project. Skipping the perimeter and the access level."
  echo "If you created them, run: POLICY_ID=NUMBER bash labs/54-org-policy-vpc-sc/teardown.sh"
fi

echo "Deleting the project-level organization policy, if it exists..."
gcloud org-policies delete "$CONSTRAINT" --project="$PROJECT_ID" --quiet || true

echo "Deleting the service accounts..."
for sa in lab54-dryrun lab54-blocked; do
  gcloud iam service-accounts delete "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true
done

echo "Deleting the bucket and its object..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

echo "Lab 54 teardown finished."
echo "If you enforced the perimeter and the bucket delete failed, run this script again in 30 minutes."
