#!/usr/bin/env bash
# Deletes everything that pcd/labs/60-gke-probes-hpa creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

NODE_SA="lab60-nodes@${PROJECT_ID}.iam.gserviceaccount.com"
# get-credentials names the context, the cluster, and the user gke_PROJECT_LOCATION_CLUSTER.
KUBE_ENTRY="gke_${PROJECT_ID}_${REGION}_lab60-cluster"

echo "Deleting the GKE cluster lab60-cluster and all its workloads (several minutes)..."
gcloud container clusters delete lab60-cluster --location="$REGION" --quiet || true

# env.sh points KUBECONFIG at the lab-only file. Remove only this lab's entries from it.
echo "Removing the lab60-cluster entries from the lab kubeconfig file..."
kubectl config delete-context "$KUBE_ENTRY" 2> /dev/null || true
kubectl config delete-cluster "$KUBE_ENTRY" 2> /dev/null || true
kubectl config delete-user "$KUBE_ENTRY" 2> /dev/null || true

echo "Deleting the Artifact Registry repository lab60-repo and its images..."
gcloud artifacts repositories delete lab60-repo --location="$REGION" --quiet || true

echo "Removing the node role from lab60-nodes..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${NODE_SA}" --role=roles/container.defaultNodeServiceAccount \
  --condition=None --quiet > /dev/null || true

echo "Deleting the service account lab60-nodes..."
gcloud iam service-accounts delete "$NODE_SA" --quiet || true

echo "Lab 60 teardown finished. The enabled APIs stay."
