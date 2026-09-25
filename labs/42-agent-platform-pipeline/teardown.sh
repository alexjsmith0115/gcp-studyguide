#!/usr/bin/env bash
# Teardown for lab 42-agent-platform-pipeline. Safe to run more than once.
# Usage: bash labs/42-agent-platform-pipeline/teardown.sh [--delete-role]
# The script cancels or deletes the lab 42 pipeline runs. Then it deletes the
# bucket, the IAM binding, the service account, and the local work folder.
# It keeps the custom role unless you add --delete-role, because Google keeps a
# deleted role ID reserved for up to 44 days.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

DELETE_ROLE=false
[ "${1:-}" = "--delete-role" ] && DELETE_ROLE=true

LAB42_DIR="${TMPDIR:-/tmp}/lab42"
BUCKET="lab42-${PROJECT_ID}"
SA_EMAIL="lab42-pipeline@${PROJECT_ID}.iam.gserviceaccount.com"
ROLE_ID="lab42_pipelineRunner"
API="https://${REGION}-aiplatform.googleapis.com/v1"
STILL_RUNNING=false

show_error() {  # print the error message of a REST response, if it has one
  python3 -c 'import json, sys
try:
    r = json.load(sys.stdin)
except ValueError:
    sys.exit(0)
if "error" in r:
    print("  API error:", r["error"].get("message"))'
}

list_runs() {  # print "NAME STATE" for each lab 42 pipeline run in $REGION
  curl -s -G -H "Authorization: Bearer ${TOKEN}" \
    --data-urlencode 'filter=labels.lab="lab42"' --data-urlencode 'pageSize=100' \
    "${API}/projects/${PROJECT_ID}/locations/${REGION}/pipelineJobs" \
  | python3 -c 'import json, sys
try:
    r = json.load(sys.stdin)
except ValueError:
    sys.exit("  Could not read the list of pipeline runs.")
if "error" in r:
    sys.exit("  API error: " + r["error"].get("message", ""))
for job in r.get("pipelineJobs", []):
    print(job["name"], job.get("state", ""))'
}

# Pipelines has no gcloud commands, so the script uses the REST API for runs.
if TOKEN="$(gcloud auth print-access-token 2>/dev/null)"; then
  echo "Looking for lab 42 pipeline runs in ${REGION}..."
  while read -r NAME STATE; do
    [ -n "$NAME" ] || continue
    case "$STATE" in
      PIPELINE_STATE_SUCCEEDED|PIPELINE_STATE_FAILED|PIPELINE_STATE_CANCELLED)
        echo "Deleting pipeline run ${NAME##*/}..."
        curl -s -X DELETE -H "Authorization: Bearer ${TOKEN}" "${API}/${NAME}" | show_error || true ;;
      *)
        echo "Cancelling pipeline run ${NAME##*/} (${STATE})..."
        curl -s -X POST -H "Authorization: Bearer ${TOKEN}" "${API}/${NAME}:cancel" | show_error || true
        STILL_RUNNING=true ;;
    esac
  done < <(list_runs)
else
  echo "Could not get an access token. Skipping the pipeline runs."
fi

echo "Deleting the bucket gs://${BUCKET} and its artifacts..."
gcloud storage rm --recursive "gs://${BUCKET}" --quiet || true

echo "Removing the project binding of the custom role..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role="projects/${PROJECT_ID}/roles/${ROLE_ID}" \
  --all --quiet --format=none || true

echo "Deleting the service account ${SA_EMAIL}..."
gcloud iam service-accounts delete "$SA_EMAIL" --project="$PROJECT_ID" --quiet || true

if [ "$DELETE_ROLE" = true ]; then
  echo "Deleting the custom role ${ROLE_ID}. You can undelete it for 7 days."
  gcloud iam roles delete "$ROLE_ID" --project="$PROJECT_ID" --quiet || true
else
  echo "Keeping the custom role ${ROLE_ID}. It has no bindings and costs nothing."
  echo "To delete it, run this script again with --delete-role."
fi

echo "Deleting the local work folder ${LAB42_DIR}..."
rm -rf "$LAB42_DIR" || true

if [ "$STILL_RUNNING" = true ]; then
  echo "Some runs were still running. Wait a few minutes, and then run this script again to delete them."
fi
echo "Teardown complete. The default ML Metadata store in ${REGION} and the APIs stay."
