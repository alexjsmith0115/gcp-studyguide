#!/usr/bin/env bash
# Teardown for lab 50-iam-impersonation. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

BUCKET="lab50-${PROJECT_ID}-data"
ROLE_ID="lab50_objectReader"
SA_EMAIL="lab50-reader@${PROJECT_ID}.iam.gserviceaccount.com"
TMP_DIR="$(mktemp -d)"

echo "Removing the Cloud Storage Data Access audit config (bindings stay the same)..."
if gcloud projects get-iam-policy "$PROJECT_ID" --format=json > "$TMP_DIR/policy.json"; then
  if python3 labs/50-iam-impersonation/audit_config.py disable storage.googleapis.com \
      < "$TMP_DIR/policy.json" > "$TMP_DIR/policy-new.json"; then
    gcloud projects set-iam-policy "$PROJECT_ID" "$TMP_DIR/policy-new.json" --format=none --quiet || true
  fi
fi

echo "Deleting the bucket and its objects..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

echo "Deleting the service account..."
gcloud iam service-accounts delete "$SA_EMAIL" --quiet || true

echo "Deleting the custom role (you can undelete it for 7 days)..."
gcloud iam roles delete "$ROLE_ID" --project="$PROJECT_ID" --quiet || true

rm -rf "$TMP_DIR"
echo "Lab 50 teardown finished."
