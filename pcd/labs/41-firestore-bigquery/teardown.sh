#!/usr/bin/env bash
# Deletes everything that pcd/labs/41-firestore-bigquery creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

FS_DB=lab41-shop

echo "Deleting the manual (composite) indexes of the Firestore database ${FS_DB}..."
for index in $(gcloud firestore indexes composite list --database="$FS_DB" \
    --format="value(name)" 2> /dev/null); do
  gcloud firestore indexes composite delete "$index" --database="$FS_DB" --quiet || true
done

# Deleting the database deletes all of its documents. Delete protection is off by default.
# You can use the database ID again about 5 minutes after the delete.
echo "Deleting the Firestore database ${FS_DB}..."
gcloud firestore databases delete --database="$FS_DB" --quiet || true

# -r deletes the tables in the dataset, -f skips the confirmation prompt.
echo "Deleting the BigQuery dataset lab41_shop and its tables..."
bq rm -r -f -d "${PROJECT_ID}:lab41_shop" || true

echo "Lab 41 teardown finished. The enabled APIs stay."
