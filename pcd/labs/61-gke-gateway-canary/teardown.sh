#!/usr/bin/env bash
# Deletes everything that pcd/labs/61-gke-gateway-canary creates. Safe to run more than once.
set -uo pipefail
cd "$(dirname "$0")/../../.."
source pcd/labs/env.sh || exit 1

NODE_SA="lab61-nodes@${PROJECT_ID}.iam.gserviceaccount.com"
# get-credentials names the context, the cluster, and the user gke_PROJECT_LOCATION_CLUSTER.
# Every kubectl command below uses this context, so it never acts on another cluster.
KUBE_ENTRY="gke_${PROJECT_ID}_${REGION}_lab61-cluster"

# Delete the Gateway while the cluster runs, so that the Gateway controller deletes the
# load balancer. Then delete the Services, so that the NEG controller deletes the NEGs.
if gcloud container clusters describe lab61-cluster --location="$REGION" --format="value(name)" > /dev/null 2>&1; then
  gcloud container clusters get-credentials lab61-cluster --location="$REGION" || true

  echo "Deleting the HTTPRoute and the Gateway..."
  kubectl --context="$KUBE_ENTRY" delete httproutes.gateway.networking.k8s.io lab61-route -n lab61 \
    --ignore-not-found --timeout=5m || true
  kubectl --context="$KUBE_ENTRY" delete gateways.gateway.networking.k8s.io lab61-gateway -n lab61 \
    --ignore-not-found --timeout=10m || true

  echo "Waiting until the load balancer forwarding rule is gone (up to 10 minutes)..."
  for i in $(seq 1 60); do
    [ -z "$(gcloud compute forwarding-rules list --global --filter="name~lab61-gateway" --format="value(name)" 2> /dev/null)" ] && break
    sleep 10
  done

  echo "Deleting the namespace lab61 with the Deployments and the Services..."
  kubectl --context="$KUBE_ENTRY" delete namespace lab61 --ignore-not-found --timeout=10m || true

  echo "Waiting until the network endpoint groups are gone (up to 5 minutes)..."
  for i in $(seq 1 30); do
    [ -z "$(gcloud compute network-endpoint-groups list --filter="name~lab61" --format="value(name)" 2> /dev/null)" ] && break
    sleep 10
  done
fi

echo "Deleting the GKE cluster lab61-cluster (several minutes)..."
gcloud container clusters delete lab61-cluster --location="$REGION" --quiet || true

# env.sh points KUBECONFIG at the lab-only file. Remove only this lab's entries from it.
echo "Removing the lab61-cluster entries from the lab kubeconfig file..."
kubectl config delete-context "$KUBE_ENTRY" 2> /dev/null || true
kubectl config delete-cluster "$KUBE_ENTRY" 2> /dev/null || true
kubectl config delete-user "$KUBE_ENTRY" 2> /dev/null || true

echo "Removing the node role from lab61-nodes..."
gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${NODE_SA}" --role=roles/container.defaultNodeServiceAccount \
  --condition=None --quiet > /dev/null || true

echo "Deleting the service account lab61-nodes..."
gcloud iam service-accounts delete "$NODE_SA" --quiet || true

echo "Load balancer resources left behind (expect no names below):"
gcloud compute forwarding-rules list --global --filter="name~lab61" --format="value(name)" || true
gcloud compute network-endpoint-groups list --filter="name~lab61" --format="value(name,zone.basename())" || true

echo "Lab 61 teardown finished. The enabled APIs stay."
