#!/usr/bin/env bash
# Deletes everything that pcd/labs/13-gemini-api creates. Safe to run more than once.
# The lab creates no cloud resources, so this script deletes only local files.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

echo "Deleting the local work folder (the Python virtual environment)..."
rm -rf "${TMPDIR:-/tmp}/lab13" || true

echo "Lab 13 teardown finished. The Agent Platform API (aiplatform.googleapis.com) stays enabled."
