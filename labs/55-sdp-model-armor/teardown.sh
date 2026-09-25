#!/usr/bin/env bash
# Teardown for lab 55-sdp-model-armor. Safe to run more than once.
#
#   bash labs/55-sdp-model-armor/teardown.sh
#
# Deletes the two Model Armor templates first, because lab55-output refers to the
# Sensitive Data Protection templates. Then deletes the de-identify and inspect templates.
# It does not change the Model Armor floor setting, because the lab only reads it.
# Log entries stay in Cloud Logging until the retention period of their log bucket ends.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

LOCATION="us"
DLP_URL="https://dlp.googleapis.com/v2/projects/${PROJECT_ID}/locations/${LOCATION}"

echo "Deleting the Model Armor templates lab55-output and lab55-input..."
for t in lab55-output lab55-input; do
  gcloud model-armor templates delete "$t" --location="$LOCATION" --quiet || true
done

echo "Deleting the Sensitive Data Protection templates..."
TOKEN="$(gcloud auth print-access-token)" || true
for t in deidentifyTemplates/lab55-deidentify inspectTemplates/lab55-inspect; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
    -H "Authorization: Bearer ${TOKEN}" -H "x-goog-user-project: ${PROJECT_ID}" \
    "${DLP_URL}/${t}")" || true
  echo "  ${t}: HTTP ${code:-000} (200 = deleted, 404 = not found)"
done

echo "Lab 55 teardown finished."
echo "The local files are not deleted. In the lab shell, run: rm -rf \"\$LAB55_TMP\""
