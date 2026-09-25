#!/usr/bin/env bash
# Lab 62 clean-up. The lab creates no cloud resources; this script removes local items only.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

echo "Deleting the local gcloud configuration lab62-emulator..."
gcloud config configurations delete lab62-emulator --quiet || true

echo "Stopping Spanner emulator containers..."
if command -v docker >/dev/null 2>&1; then
  ids="$(docker ps -q --filter ancestor=gcr.io/cloud-spanner-emulator/emulator 2>/dev/null || true)"
  if [ -n "$ids" ]; then
    docker stop $ids || true
  fi
fi

echo "Deleting the Python virtual environment..."
rm -rf "$HOME/.venvs/lab62" || true

echo "Done. In each open terminal, run:"
echo "  unset PUBSUB_EMULATOR_HOST FIRESTORE_EMULATOR_HOST SPANNER_EMULATOR_HOST BIGTABLE_EMULATOR_HOST"
