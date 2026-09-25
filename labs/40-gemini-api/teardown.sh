#!/usr/bin/env bash
# Teardown for lab 40-gemini-api. Safe to run more than once.
# The lab creates no cloud resources. This script deletes the local work folder.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

LAB40_DIR="${TMPDIR:-/tmp}/lab40"

echo "Deleting the local work folder ${LAB40_DIR}..."
rm -rf "$LAB40_DIR" || true

echo "Teardown complete. The Agent Platform API stays enabled."
