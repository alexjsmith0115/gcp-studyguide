#!/usr/bin/env bash
# Teardown for lab 51-kms-cmek-secrets. Safe to run more than once.
#
#   bash labs/51-kms-cmek-secrets/teardown.sh
#       Deletes the bucket, the secret, and the service account. Keeps the key versions.
#   bash labs/51-kms-cmek-secrets/teardown.sh --destroy-key-versions
#       OPTIONAL AND IRREVERSIBLE: also schedules destruction of every key version.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

DESTROY_KEY_VERSIONS=false
for arg in "$@"; do
  case "$arg" in
    --destroy-key-versions) DESTROY_KEY_VERSIONS=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

KEYRING="lab51-keyring"
KEY="lab51-key"
BUCKET="lab51-${PROJECT_ID}-cmek"
SECRET="lab51-db-password"
SA_EMAIL="lab51-app@${PROJECT_ID}.iam.gserviceaccount.com"
GCS_AGENT="service-${PROJECT_NUMBER}@gs-project-accounts.iam.gserviceaccount.com"

echo "Deleting the bucket and its objects..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

echo "Deleting the secret and all of its versions..."
gcloud secrets delete "$SECRET" --quiet || true

echo "Deleting the service account..."
gcloud iam service-accounts delete "$SA_EMAIL" --quiet || true

echo "Removing the Cloud Storage service agent's role on the key..."
gcloud kms keys remove-iam-policy-binding "$KEY" --keyring="$KEYRING" --location="$REGION" \
  --member="serviceAccount:${GCS_AGENT}" --role="roles/cloudkms.cryptoKeyEncrypterDecrypter" \
  --format=none --quiet || true

if [ "$DESTROY_KEY_VERSIONS" = true ]; then
  echo "OPTIONAL STEP: scheduling destruction of every version of ${KEY}."
  echo "After the scheduled-destruction period (24 hours for this key), the key material is gone for good."
  VERSIONS="$(gcloud kms keys versions list --key="$KEY" --keyring="$KEYRING" --location="$REGION" \
    --filter="state=ENABLED OR state=DISABLED" --format="value(name.basename())" || true)"
  for v in $VERSIONS; do
    gcloud kms keys versions destroy "$v" --key="$KEY" --keyring="$KEYRING" --location="$REGION" \
      --format=none --quiet || true
  done
else
  echo "Kept the key versions of ${KEY}. Each active version costs about \$0.06 per month."
  echo "To stop that charge, run: bash labs/51-kms-cmek-secrets/teardown.sh --destroy-key-versions"
fi

echo "Lab 51 teardown finished. The key ring and key stay. They cost nothing."
