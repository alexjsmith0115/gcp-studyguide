#!/usr/bin/env bash
# Deletes everything that labs/00-setup created: the budget, the billing link,
# the lab project (30-day recovery), and the pca-lab gcloud configuration.
# Run it only after you finish ALL labs.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "This shuts down project $PROJECT_ID and every resource in it."
read -r -p "Type the project ID to continue: " answer
if [ "$answer" != "$PROJECT_ID" ]; then
  echo "The ID does not match. Nothing was deleted."
  exit 1
fi

BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT_ID" \
  --format='value(billingAccountName)' 2>/dev/null | sed 's|^billingAccounts/||')"

if [ -n "$BILLING_ACCOUNT" ]; then
  for budget in $(gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
      --filter='displayName="pca-lab monthly"' --format='value(name)' 2>/dev/null); do
    gcloud billing budgets delete "$budget" --quiet || true
  done
  # Unlink billing first: charges can continue until the billing cycle ends.
  gcloud billing projects unlink "$PROJECT_ID" --quiet || true
fi

gcloud projects delete "$PROJECT_ID" --quiet || true

# A configuration cannot be deleted while it is active.
unset CLOUDSDK_ACTIVE_CONFIG_NAME
gcloud config configurations delete pca-lab --quiet || true

echo "Done. You can restore the project for 30 days with: gcloud projects undelete $PROJECT_ID"
