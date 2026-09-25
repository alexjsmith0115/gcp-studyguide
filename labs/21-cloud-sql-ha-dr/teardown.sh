#!/usr/bin/env bash
# Teardown for lab 21-cloud-sql-ha-dr. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../.."
source labs/env.sh || exit 1

PRIMARY="lab21-pg"
CLONE="lab21-pg-pitr"
REPLICA="lab21-pg-dr"

echo "Deleting the DR instance (a replica must go before its primary)..."
gcloud sql instances delete "$REPLICA" --quiet || true

echo "Deleting the PITR clone..."
gcloud sql instances delete "$CLONE" --quiet || true

echo "Deleting the primary instance and its backups..."
gcloud sql instances delete "$PRIMARY" --quiet || true

echo "Remaining lab 21 instances (expect none):"
gcloud sql instances list --filter="name~^lab21-" --format="value(name)" || true

echo "Lab 21 teardown finished."
