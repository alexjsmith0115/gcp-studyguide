#!/usr/bin/env bash
# Deletes everything that pcd/labs/52-cloud-build-tests creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

BUILD_SA="lab52-builder@${PROJECT_ID}.iam.gserviceaccount.com"

# Optional step 8: the trigger, the repository link, the connection, and its token secret.
if gcloud builds connections describe lab52-conn --region="$REGION" > /dev/null 2>&1; then
  # Read the token secret before the connection is gone. Format: projects/P/secrets/SECRET_ID/versions/V
  TOKEN_VERSION="$(gcloud builds connections describe lab52-conn --region="$REGION" \
    --format='value(githubConfig.authorizerCredential.oauthTokenSecretVersion)')"
  echo "Deleting the trigger lab52-pr-tests, the repository link lab52-github, and the connection lab52-conn..."
  gcloud builds triggers delete lab52-pr-tests --region="$REGION" --quiet || true
  gcloud builds repositories delete lab52-github --connection=lab52-conn --region="$REGION" --quiet || true
  gcloud builds connections delete lab52-conn --region="$REGION" --quiet || true
  SECRET_ID="$(echo "$TOKEN_VERSION" | cut -d/ -f4)"
  if [[ "$SECRET_ID" == lab52-conn* ]]; then
    echo "Deleting the token secret ${SECRET_ID}..."
    gcloud secrets delete "$SECRET_ID" --quiet || true
  elif [ -n "$SECRET_ID" ]; then
    echo "NOTE: the connection used the secret ${SECRET_ID}. Delete it if no other connection uses it."
  fi
fi

echo "Deleting the Artifact Registry repository lab52-repo and all its images..."
gcloud artifacts repositories delete lab52-repo --location="$REGION" --quiet || true

echo "Deleting the bucket gs://lab52-${PROJECT_ID} with the build sources and the test reports..."
gcloud storage rm --recursive "gs://lab52-${PROJECT_ID}" --quiet || true

echo "Removing the project-level roles from lab52-builder..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/logging.logWriter \
  --condition=None --quiet > /dev/null || true
# Present only after step 8, so a "not found" error is hidden.
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/cloudbuild.builds.editor \
  --condition=None --quiet > /dev/null 2>&1 || true

echo "Deleting the service account lab52-builder..."
gcloud iam service-accounts delete "$BUILD_SA" --quiet || true

echo "Deleting the local folders /tmp/lab52-broken and /tmp/lab52-github..."
rm -rf /tmp/lab52-broken /tmp/lab52-github

echo "Lab 52 teardown finished. The build history and the build logs stay."
echo "If you did step 8, uninstall the Cloud Build GitHub App from your GitHub account when you no longer need it."
