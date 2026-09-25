---
id: 31-gke-autopilot
title: GKE Autopilot with Workload Identity Federation for GKE
objectives: ["2.3"]
minutes: 75
cost: "Less than $0.20 per hour while the cluster exists: the $0.10 per hour cluster management fee (the GKE free tier gives $74.40 of credit per month per billing account, which covers one Autopilot cluster) plus the Pod resource requests. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Create a GKE Autopilot cluster in your own VPC, deploy an app, and let one Pod read a Cloud Storage bucket without keys. Then autoscale the app with a HorizontalPodAutoscaler (HPA) and watch Autopilot add capacity.

## Exam relevance

- Autopilot or Standard: Autopilot is the recommended GKE mode. Google manages the nodes, and you pay for the resources that your Pods request. See [Configuring GKE](note:2.3-gke) and [Mapping workloads to compute platforms](note:1.3-compute-choice).
- Workload identity: Workload Identity Federation for GKE is the recommended way for Pods to call Google Cloud APIs. You grant IAM roles directly to a Kubernetes ServiceAccount principal, and you need no service account keys. See [Secure remote and workload access](note:3.1-secure-access).
- VPC-native networking: Pod and Service IP addresses come from secondary ranges of your subnet. See [Cloud-native network design](note:1.3-network-design).
- Autoscaling layers: the HPA adds Pods, and Autopilot adds nodes for Pods that cannot be scheduled. You pay per Pod request, not per node. See [Cost optimization and CapEx/OpEx](note:4.2-cost-optimization).

## Before you start

Run all commands from the repository root, in one shell. Enable the APIs:

```bash
source labs/env.sh
gcloud services enable container.googleapis.com compute.googleapis.com iam.googleapis.com storage.googleapis.com
```

You need:

- IAM: Owner on the lab project. Without Owner, you need Kubernetes Engine Admin (`roles/container.admin`), Compute Network Admin, Service Account Admin, Project IAM Admin, and Storage Admin.
- Tools: `kubectl` and `gke-gcloud-auth-plugin`. Check the plugin with `gke-gcloud-auth-plugin --version`. If you installed the gcloud CLI with its own installer, you can add both tools as components:

```bash
gcloud components install kubectl gke-gcloud-auth-plugin
```

- Time: about 75 minutes. Cluster creation takes 5 to 10 minutes. Deletion takes about 5 minutes.

## Steps

1. Keep this lab out of your default `kubectl` configuration. The `create-auto` command adds a kubeconfig entry and changes the current context. This step points `kubectl` at a separate file, for this shell only.

```bash
source labs/env.sh
mkdir -p "$HOME/.kube"
export KUBECONFIG="$HOME/.kube/lab31-config"
export BUCKET="${PROJECT_ID}-lab31"
```

If you open a new shell later, run these four lines again.

2. Create a custom-mode VPC and a subnet with two secondary ranges. Autopilot clusters are always VPC-native: nodes get IP addresses from the primary range, Pods from `lab31-pods`, and Services from `lab31-services`.

```bash
gcloud compute networks create lab31-vpc --subnet-mode=custom

gcloud compute networks subnets create lab31-subnet \
  --network=lab31-vpc \
  --region=$REGION \
  --range=10.31.0.0/24 \
  --secondary-range=lab31-pods=10.31.128.0/17,lab31-services=10.31.16.0/20
```

3. Create a least-privilege node service account. By default, GKE uses the Compute Engine default service account for nodes. Google recommends a custom account that has only the Kubernetes Engine Default Node Service Account role.

```bash
gcloud iam service-accounts create lab31-nodes \
  --display-name="Lab 31 GKE node service account"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:lab31-nodes@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/container.defaultNodeServiceAccount" \
  --condition=None
```

4. Create the Autopilot cluster. Autopilot clusters are regional, so you give a region. Some cluster settings cannot change after creation, so set the node service account now.

```bash
gcloud container clusters create-auto lab31-cluster \
  --location=$REGION \
  --network=lab31-vpc \
  --subnetwork=lab31-subnet \
  --cluster-secondary-range-name=lab31-pods \
  --services-secondary-range-name=lab31-services \
  --service-account="lab31-nodes@$PROJECT_ID.iam.gserviceaccount.com" \
  --release-channel=regular
```

5. Get credentials and confirm the cluster mode. The output must show `enabled: true` under `autopilot`.

```bash
gcloud container clusters get-credentials lab31-cluster --location=$REGION
gcloud container clusters describe lab31-cluster --location=$REGION \
  --format="yaml(autopilot,releaseChannel,location)"
kubectl get nodes
```

6. Deploy the app. The manifest sets CPU and memory requests. Autopilot bills a Pod for its requests, and the HPA needs a CPU request to calculate utilization.

```bash
kubectl apply -f labs/31-gke-autopilot/app.yaml
kubectl rollout status deployment/lab31-hello --namespace=lab31 --timeout=300s
kubectl get pods --namespace=lab31 -o wide
```

If no node has room for the Pod, the Pod stays `Pending` until Autopilot adds capacity. A new node takes about 80 to 120 seconds to boot.

7. Create a Cloud Storage bucket with one object. The Pod reads this object in the next steps.

```bash
gcloud storage buckets create gs://$BUCKET \
  --location=$REGION \
  --uniform-bucket-level-access

echo "Hello from Cloud Storage. Workload Identity Federation for GKE works." > lab31-hello.txt
gcloud storage cp lab31-hello.txt gs://$BUCKET/hello.txt
rm lab31-hello.txt
```

8. Create a Kubernetes ServiceAccount and grant it read access to the bucket. Autopilot always enables Workload Identity Federation for GKE. You grant the IAM role directly to the principal identifier of the Kubernetes ServiceAccount. You need no IAM service account and no key.

```bash
kubectl create serviceaccount lab31-reader --namespace=lab31

gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --role=roles/storage.objectViewer \
  --member="principal://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$PROJECT_ID.svc.id.goog/subject/ns/lab31/sa/lab31-reader" \
  --condition=None
```

9. Start two test Pods and read the object from each one. `wif-reader` uses `lab31-reader`. `wif-default` uses the `default` ServiceAccount, which has no IAM grants.

```bash
kubectl apply -f labs/31-gke-autopilot/wif-test.yaml
kubectl wait --for=condition=Ready pod/wif-reader pod/wif-default --namespace=lab31 --timeout=600s

kubectl exec --namespace=lab31 wif-reader -- gcloud storage cat gs://$BUCKET/hello.txt
kubectl exec --namespace=lab31 wif-default -- gcloud storage cat gs://$BUCKET/hello.txt
```

The first command prints the text of the object. The second command fails with a `403` error. IAM changes can take a few minutes to apply. If the first command also fails with `403`, wait one minute and run it again.

10. Create the HPA. It keeps average CPU utilization near 50% of the CPU request, with 1 to 5 replicas.

```bash
kubectl apply -f labs/31-gke-autopilot/hpa.yaml
kubectl get hpa lab31-hello --namespace=lab31
```

11. Start the load generator and watch the HPA. Press Ctrl+C after 4 or 5 minutes, when `REPLICAS` stops changing.

```bash
kubectl apply -f labs/31-gke-autopilot/load.yaml
kubectl get hpa lab31-hello --namespace=lab31 --watch
```

If `TARGETS` stays below 50%, add load generators with `kubectl scale deployment/lab31-load --namespace=lab31 --replicas=4`.

12. Look at the Pods and nodes while the load runs. Some new Pods can stay `Pending` until Autopilot adds nodes. You do not manage node pools.

```bash
kubectl get pods --namespace=lab31 -o wide
kubectl get nodes
kubectl describe hpa lab31-hello --namespace=lab31
```

13. Stop the load and watch the scale-down. By default, the HPA waits for a stabilization window of 300 seconds (five minutes) before it removes replicas.

```bash
kubectl delete -f labs/31-gke-autopilot/load.yaml
kubectl get hpa lab31-hello --namespace=lab31 --watch
```

Press Ctrl+C when `REPLICAS` is back to `1`, or after about 7 minutes.

## Check your work

Run these commands before you clean up:

```bash
gcloud container clusters describe lab31-cluster --location=$REGION --format="value(autopilot.enabled)"
kubectl get serviceaccount lab31-reader --namespace=lab31
gcloud storage buckets get-iam-policy gs://$BUCKET --format=json | grep "subject/ns/lab31/sa/lab31-reader"
kubectl exec --namespace=lab31 wif-reader -- gcloud storage cat gs://$BUCKET/hello.txt
kubectl describe hpa lab31-hello --namespace=lab31 | grep -i "SuccessfulRescale"
```

Expected output:

- `True` for the Autopilot check.
- The `lab31-reader` ServiceAccount exists.
- The bucket policy contains the `principal://` member for `ns/lab31/sa/lab31-reader`.
- `wif-reader` prints `Hello from Cloud Storage. Workload Identity Federation for GKE works.`
- The HPA events show at least one `SuccessfulRescale` with `New size` greater than 1.

## Explore

1. The `wif-default` Pod runs on a node that has the GKE metadata server, but it still gets `403`. Why is that the safe default?

<details><summary>Answer</summary>

Enabling Workload Identity Federation for GKE does not grant any IAM permissions to workloads. Access comes only from IAM allow policies that name a principal. A principal can be one Kubernetes ServiceAccount, all Pods in a namespace, or all Pods in a cluster. Grant roles on the specific resource, as in step 8, to keep least privilege.

</details>

2. Another team creates a second cluster in the same project. It also has a namespace `lab31` with a ServiceAccount `lab31-reader`. Can its Pods read your bucket?

<details><summary>Answer</summary>

Yes. Clusters in one project share one workload identity pool (`PROJECT_ID.svc.id.goog`). IAM treats the same namespace and ServiceAccount name in any of these clusters as the same identity ("identity sameness"). To prevent this, put clusters that do not trust each other in separate projects, use distinct namespace names, or add IAM conditions.

</details>

3. During the load test, new Pods waited for nodes. How can you make scale-out faster for a planned traffic peak, such as a flash sale?

<details><summary>Answer</summary>

Provision spare capacity. Deploy placeholder Pods with a low-priority PriorityClass that request the capacity you need. GKE adds nodes for them. When real Pods need room, GKE evicts the placeholders, and the real Pods start without a wait for new nodes. You pay for the placeholder requests.

</details>

4. When is GKE Standard a better choice than an Autopilot cluster?

<details><summary>Answer</summary>

Use Standard when the organization needs manual control of the nodes or flexibility that Autopilot does not allow. Autopilot is the recommended mode for most workloads because the whole cluster follows Google's best practices by default. You can also run specific workloads in Autopilot mode inside a Standard cluster.

</details>

## Clean up

```bash
bash labs/31-gke-autopilot/teardown.sh
```

The script deletes:

- The GKE cluster `lab31-cluster`, with its nodes and the firewall rules that GKE created.
- The bucket `gs://PROJECT_ID-lab31` and its object. The bucket IAM binding goes with the bucket.
- The IAM binding and the service account `lab31-nodes`.
- Any firewall rules left in `lab31-vpc`, the subnet `lab31-subnet`, and the VPC `lab31-vpc`.
- The lab kubeconfig file `$HOME/.kube/lab31-config`.

## Docs used

- [Create an Autopilot cluster](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/creating-an-autopilot-cluster)
- [GKE Autopilot overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview)
- [Resource requests in Autopilot](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-resource-requests)
- [Configure Pod bursting in GKE](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/pod-bursting-gke)
- [Create a VPC-native cluster](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/alias-ips)
- [Authenticate to Google Cloud APIs from GKE workloads](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [About Workload Identity Federation for GKE](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/workload-identity)
- [Configuring horizontal Pod autoscaling](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/horizontal-pod-autoscaling)
- [Horizontal Pod autoscaling](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler)
- [Provision extra compute capacity for rapid Pod scaling](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/capacity-provisioning)
- [Install kubectl and configure cluster access](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl)
- [Deploy an app to a GKE cluster](https://docs.cloud.google.com/kubernetes-engine/docs/deploy-app-cluster) (the `hello-app` sample image)
- [Example Dockerfiles](https://docs.cloud.google.com/sdk/docs/dockerfile_example) (the Google Cloud CLI image path)
- [Google Kubernetes Engine pricing](https://cloud.google.com/kubernetes-engine/pricing)
