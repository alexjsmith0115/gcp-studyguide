#!/usr/bin/env bash
# Deletes what pcd/labs/30-secrets-and-kms creates. Safe to run more than once.
# Cloud KMS key rings and keys stay. By default, the key versions also stay.
#
#   bash pcd/labs/30-secrets-and-kms/teardown.sh
#   bash pcd/labs/30-secrets-and-kms/teardown.sh --destroy-key-versions   # OPTIONAL, see the README
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

DESTROY_KEY_VERSIONS=false
for arg in "$@"; do
  case "$arg" in
    --destroy-key-versions) DESTROY_KEY_VERSIONS=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

RUN_SA="lab30-run@${PROJECT_ID}.iam.gserviceaccount.com"
CRYPTO_SA="lab30-crypto@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Deleting the Cloud Run service lab30-app..."
gcloud run services delete lab30-app --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab30-app image from the cloud-run-source-deploy repository..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab30-app" \
  --delete-tags --quiet || true

echo "Deleting the secret lab30-db-password, with all its versions and its rotation schedule..."
gcloud secrets delete lab30-db-password --quiet || true

echo "Deleting the Pub/Sub subscription and topic (the publisher binding goes with the topic)..."
gcloud pubsub subscriptions delete lab30-secret-events-sub --quiet || true
gcloud pubsub topics delete lab30-secret-events --quiet || true

echo "Removing the lab30-crypto binding and the automatic rotation schedule from lab30-key..."
gcloud kms keys remove-iam-policy-binding lab30-key --keyring=lab30-ring --location="$REGION" \
  --member="serviceAccount:${CRYPTO_SA}" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter \
  --quiet > /dev/null || true
# Each automatic rotation adds a billable key version. Without a schedule, the cost cannot grow.
gcloud kms keys update lab30-key --keyring=lab30-ring --location="$REGION" \
  --remove-rotation-schedule --quiet > /dev/null || true

echo "Deleting the service accounts lab30-run and lab30-crypto..."
gcloud iam service-accounts delete "$RUN_SA" --quiet || true
gcloud iam service-accounts delete "$CRYPTO_SA" --quiet || true

if [ "$DESTROY_KEY_VERSIONS" = true ]; then
  # OPTIONAL and permanent after the scheduled period (24 hours for lab30-key):
  # data that a destroyed version encrypted can never be decrypted again.
  echo "Scheduling destruction of the enabled and disabled versions of lab30-key..."
  for v in $(gcloud kms keys versions list --key=lab30-key --keyring=lab30-ring --location="$REGION" \
      --filter="state=ENABLED OR state=DISABLED" --format="value(name.basename())" 2>/dev/null); do
    gcloud kms keys versions destroy "$v" --key=lab30-key --keyring=lab30-ring \
      --location="$REGION" --quiet > /dev/null || true
  done
fi

echo "Deleting the local lab files in ${TMPDIR:-/tmp}/lab30..."
rm -rf "${TMPDIR:-/tmp}/lab30"

ACTIVE="$(gcloud kms keys versions list --key=lab30-key --keyring=lab30-ring --location="$REGION" \
  --filter="state=ENABLED OR state=DISABLED OR state=DESTROY_SCHEDULED" \
  --format="value(name)" 2>/dev/null | wc -l | tr -d ' ')"
echo "Lab 30 teardown finished. The key ring lab30-ring and the key lab30-key stay."
echo "lab30-key has ${ACTIVE} active key version(s). Cloud KMS bills each one, about \$0.06 a month,"
echo "until it is destroyed. A version that is scheduled for destruction is billed until then."
