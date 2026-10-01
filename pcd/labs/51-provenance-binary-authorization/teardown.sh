#!/usr/bin/env bash
# Deletes everything that pcd/labs/51-provenance-binary-authorization creates, and restores the
# Binary Authorization policy of the project. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

BUILD_SA="lab51-builder@${PROJECT_ID}.iam.gserviceaccount.com"
RUN_SA="lab51-run@${PROJECT_ID}.iam.gserviceaccount.com"
BACKUP=/tmp/lab51-policy-backup.yaml
RESTORE=/tmp/lab51-policy-restore.yaml

# Restore the policy first, so that the project allows all images again.
echo "Restoring the Binary Authorization policy..."
if [ -s "$BACKUP" ]; then
  # etag and updateTime come from the server. A stale etag can make the import fail.
  grep -v -E '^(etag|updateTime):' "$BACKUP" > "$RESTORE"
else
  echo "No saved policy found. Importing the default policy, which allows all images."
  cat > "$RESTORE" <<EOF
defaultAdmissionRule:
  enforcementMode: ENFORCED_BLOCK_AND_AUDIT_LOG
  evaluationMode: ALWAYS_ALLOW
globalPolicyEvaluationMode: ENABLE
name: projects/${PROJECT_ID}/policy
EOF
fi
if gcloud container binauthz policy import "$RESTORE" --quiet > /dev/null; then
  rm -f "$BACKUP" "$RESTORE" /tmp/lab51-policy.yaml /tmp/lab51-dryrun.yaml
else
  echo "WARNING: the policy import failed. Check it with: gcloud container binauthz policy export"
fi

echo "Deleting the Cloud Run service lab51-app and all its revisions..."
gcloud run services delete lab51-app --region="$REGION" --quiet || true

echo "Deleting the Artifact Registry repository lab51-repo and all its images..."
gcloud artifacts repositories delete lab51-repo --location="$REGION" --quiet || true

echo "Deleting the bucket gs://lab51-${PROJECT_ID} and the uploaded build sources..."
gcloud storage rm --recursive "gs://lab51-${PROJECT_ID}" --quiet || true

echo "Removing the project-level Logs Writer role from lab51-builder..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/logging.logWriter \
  --condition=None --quiet > /dev/null || true

echo "Deleting the service accounts..."
gcloud iam service-accounts delete "$BUILD_SA" --quiet || true
gcloud iam service-accounts delete "$RUN_SA" --quiet || true

echo "Lab 51 teardown finished. The APIs and the built-by-cloud-build attestor stay."
