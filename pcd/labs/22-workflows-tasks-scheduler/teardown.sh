#!/usr/bin/env bash
# Deletes everything that pcd/labs/22-workflows-tasks-scheduler creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

RUN_SA="lab22-steps@${PROJECT_ID}.iam.gserviceaccount.com"
WF_SA="lab22-workflow@${PROJECT_ID}.iam.gserviceaccount.com"
TASKS_SA="lab22-tasks@${PROJECT_ID}.iam.gserviceaccount.com"
SCHEDULER_SA="lab22-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

# The job and queue names have a time stamp (step 1 of the README), so find them by prefix.
echo "Deleting the Cloud Scheduler jobs lab22-*..."
for job in $(gcloud scheduler jobs list --location="$REGION" --filter='name~/jobs/lab22-' \
    --format='value(name.basename())' 2>/dev/null); do
  gcloud scheduler jobs delete "$job" --location="$REGION" --quiet || true
done

echo "Deleting the Cloud Tasks queues lab22-* and their tasks (the names stay blocked for 3 days)..."
for queue in $(gcloud tasks queues list --location="$REGION" --filter='name~/queues/lab22-' \
    --format='value(name.basename())' 2>/dev/null); do
  gcloud tasks queues delete "$queue" --location="$REGION" --quiet || true
done

echo "Deleting the workflow lab22-order..."
gcloud workflows delete lab22-order --location="$REGION" --quiet || true

echo "Deleting the Cloud Run service lab22-steps..."
gcloud run services delete lab22-steps --region="$REGION" --quiet || true

# Other labs share the cloud-run-source-deploy repository, so delete only this lab's image.
echo "Deleting the lab22-steps image from cloud-run-source-deploy..."
gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab22-steps" \
  --delete-tags --quiet || true

echo "Removing the Workflows Invoker role from lab22-scheduler..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SCHEDULER_SA}" --role=roles/workflows.invoker \
  --condition=None --quiet > /dev/null || true

# The Service Account User binding for the Cloud Tasks service agent is on lab22-tasks,
# so it goes with that service account.
echo "Deleting the service accounts..."
for sa in "$SCHEDULER_SA" "$TASKS_SA" "$WF_SA" "$RUN_SA"; do
  gcloud iam service-accounts delete "$sa" --quiet || true
done

echo "Lab 22 teardown finished. The enabled APIs and the cloud-run-source-deploy repository stay."
