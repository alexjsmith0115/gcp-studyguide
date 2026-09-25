#!/usr/bin/env bash
# Teardown for lab 41-ai-apis. Safe to run more than once.
# The lab creates no cloud resources. This script deletes the local work folder
# and disables the four pre-trained AI APIs. The Agent Platform API stays enabled.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

LAB41_DIR="${TMPDIR:-/tmp}/lab41"

echo "Deleting the local work folder ${LAB41_DIR}..."
rm -rf "$LAB41_DIR" || true

echo "Disabling the Vision, Speech-to-Text, Natural Language, and Cloud Translation APIs..."
for API in vision.googleapis.com speech.googleapis.com language.googleapis.com translate.googleapis.com; do
  gcloud services disable "$API" --project="$PROJECT_ID" --quiet || true
done

echo "Teardown complete."
