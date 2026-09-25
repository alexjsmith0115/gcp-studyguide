#!/usr/bin/env bash
# Teardown for lab 23-streaming-pipeline. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the BigQuery subscription and the dead-letter pull subscription..."
gcloud pubsub subscriptions delete lab23-rides-to-bq --quiet || true
gcloud pubsub subscriptions delete lab23-rides-dlq-pull --quiet || true

echo "Deleting the topics..."
gcloud pubsub topics delete lab23-rides --quiet || true
gcloud pubsub topics delete lab23-rides-dlq --quiet || true

echo "Deleting the dataset and its table..."
bq rm -r -f -d "${PROJECT_ID}:lab23_stream" || true

echo "Lab 23 teardown finished."
