#!/usr/bin/env bash
# Teardown for lab 01-cost-controls. Safe to run more than once.
# Deletes only lab01- budgets on the lab project's billing account, the optional
# VM, and the Pub/Sub subscription and topic. It doesn't change the billing export.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT_ID" \
  --format='value(billingAccountName)' 2>/dev/null | sed 's|^billingAccounts/||')"

# 1. Budgets live on the billing account: delete only the ones named lab01-*.
if [ -n "$BILLING_ACCOUNT" ]; then
  for budget in $(gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
      --filter="displayName~^lab01-" --format="value(name)" 2>/dev/null); do
    echo "Deleting budget $budget"
    gcloud billing budgets delete "$budget" --quiet || true
  done
else
  echo "No billing account found for $PROJECT_ID; skipping budgets."
fi

# 2. Optional idle VM from step 8.
gcloud compute instances delete lab01-idle-vm --zone="$ZONE" --quiet 2>/dev/null || true

# 3. Subscription first, then the topic.
gcloud pubsub subscriptions delete lab01-budget-alerts-sub --quiet || true
gcloud pubsub topics delete lab01-budget-alerts --quiet || true

echo "Teardown done. The billing export is not changed; see the README Clean up section."
