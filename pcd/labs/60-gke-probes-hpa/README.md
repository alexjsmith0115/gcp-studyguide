---
id: 60-gke-probes-hpa
title: Deploy to GKE Autopilot with probes and a Horizontal Pod Autoscaler
objectives: ["3.2"]
minutes: 75
cost: "Less than $0.20 for each hour that the cluster exists. The GKE cluster management fee is $0.10 per hour, and the GKE free tier gives each billing account $74.40 of credit each month. Autopilot also bills the CPU and memory that the Pods request. Cloud Build (2,500 build-minutes each month) and Artifact Registry (0.5 GiB of storage each month) have free tiers. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Deploy a small Python app to a GKE Autopilot cluster with a startup probe, a liveness probe, and a readiness probe, and see what each probe does to a Pod. Then scale the app on CPU use with a HorizontalPodAutoscaler (HPA).

## Exam relevance

- A Deployment, a Service, resource requests on Autopilot, and `kubectl rollout undo`. See [Deploying containerized applications to GKE](note:3.2-gke-deployments).
- Which probe restarts a container, which probe removes a Pod from the Service, and why a slow app needs a startup probe. See [Kubernetes health checks](note:3.2-health-checks).
- An `autoscaling/v2` HPA with a CPU target, a replica range, and a scale-down stabilization window. See [Scaling on GKE](note:3.2-autoscaling).
- Autopilot bills Pod requests, so the requests are a cost decision. See [Sizing resources and controlling cost](note:1.1-resources-and-cost).
- On GKE you configure probes, Services, and autoscaling yourself. Compare this with Cloud Run in [Choosing a platform](note:1.1-platform-choice).
- Cloud Build makes the image, Artifact Registry stores it, and the node service account pulls it. See [Cloud Build and Artifact Registry](note:2.2-cloud-build-artifact-registry).

## Before you start

- Complete [the setup lab](lab:00-setup), so that `source pcd/labs/env.sh` works.
- **IAM:** you are the Owner of the lab project.
- **Tools:** the gcloud CLI, `kubectl`, and the authentication plugin `gke-gcloud-auth-plugin`. `kubectl` needs the plugin to communicate with GKE clusters. You do not need Docker.
- **Time:** about 75 minutes. Cluster creation and deletion each take several minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Check that `kubectl` and the plugin are installed. Each command prints a version:

```bash
kubectl version --client
gke-gcloud-auth-plugin --version
```

If a command is not found, install the tool. Use the method that you used to install the gcloud CLI ([Install kubectl and configure cluster access](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl)):

| You installed the gcloud CLI with | Install command |
|---|---|
| The gcloud CLI installer | `gcloud components install kubectl gke-gcloud-auth-plugin` |
| apt | `sudo apt-get install kubectl google-cloud-cli-gke-gcloud-auth-plugin` |
| yum | `sudo yum install kubectl google-cloud-cli-gke-gcloud-auth-plugin` |

Load the lab environment, and enable the APIs:

```bash
source pcd/labs/env.sh
gcloud services enable container.googleapis.com compute.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com iam.googleapis.com
```

## Steps

1. Check the kubeconfig file, and set the variables. `env.sh` sets `KUBECONFIG` to a lab-only file, `~/.kube/pcd-lab-config`. So `kubectl` in the lab shell cannot reach the clusters in your normal kubeconfig file. When you create a cluster with `create-auto`, gcloud adds it to the kubeconfig file and makes it the current context ([Install kubectl and configure cluster access](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl)).

```bash
echo "$KUBECONFIG"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/lab60-repo/lab60-app:v1"
export NODE_SA="lab60-nodes@${PROJECT_ID}.iam.gserviceaccount.com"
```

The first line prints a path that ends with `.kube/pcd-lab-config`. If you open a new terminal, run `source pcd/labs/env.sh` and the two `export` lines again.

2. Read the app, so that you know what each probe sees. It is one Python file that uses only the standard library. A second file, `load.py`, is the test client and the load generator.

```bash
cat pcd/labs/60-gke-probes-hpa/app/main.py
```

| Path | Used by | What it does |
|---|---|---|
| (container start) | The startup probe | The port stays closed for `STARTUP_SECONDS` (20 seconds), as in an app that loads a large file. |
| `/healthz` | The startup and liveness probes | Returns 200. After a call to `/break`, it returns 500. It checks only its own process. |
| `/ready` | The readiness probe | Returns 503 for `WARMUP_SECONDS` (30 seconds) after the port opens, then 200. |
| `/` | The load generator | Does some CPU work, then returns the Pod name. |

At shutdown, the app fails its readiness check and serves for 5 more seconds before it stops. Google recommends that an app does not stop accepting requests right after `SIGTERM`, because Kubernetes updates endpoints and load balancers asynchronously ([Best practices for running cost-optimized Kubernetes applications on GKE](https://docs.cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke)).

3. Create a Docker repository in Artifact Registry, and build the image with Cloud Build. Cloud Build reads the `Dockerfile` in the `app` folder and pushes the image to the repository ([Build and push a Docker image with Cloud Build](https://docs.cloud.google.com/build/docs/build-push-docker-image)).

```bash
gcloud artifacts repositories create lab60-repo \
  --repository-format=docker --location="$REGION"
gcloud builds submit pcd/labs/60-gke-probes-hpa/app --region="$REGION" --tag="$IMAGE"
```

The last line of the output shows `SUCCESS`. The build runs as the default Cloud Build service account. In the setup lab, you gave that account the Cloud Run Builder role, which can push images to Artifact Registry.

If the build fails with a permission error, the account does not have the role. Grant it as in 00-setup, wait a few minutes for the grant to propagate, and run the build again. `teardown.sh` does not remove this grant, because other labs need it.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

4. Create a node service account. By default, GKE nodes use the Compute Engine default service account. Google recommends a custom node service account with the Kubernetes Engine Default Node Service Account role (`roles/container.defaultNodeServiceAccount`) ([Configure GKE node service accounts](https://docs.cloud.google.com/kubernetes-engine/security/configure-node-service-accounts)). Nodes pull images as the node service account, so it also needs Artifact Registry Reader ([Deploying to Google Kubernetes Engine](https://docs.cloud.google.com/artifact-registry/docs/integrate-gke)). This step grants the reader role on the lab repository only.

```bash
gcloud iam service-accounts create lab60-nodes --display-name="lab60 GKE nodes"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${NODE_SA}" \
  --role=roles/container.defaultNodeServiceAccount --condition=None
gcloud artifacts repositories add-iam-policy-binding lab60-repo \
  --location="$REGION" \
  --member="serviceAccount:${NODE_SA}" --role=roles/artifactregistry.reader
```

If a binding fails because the service account does not exist yet, wait one minute and run the command again.

5. Create the Autopilot cluster, and get its credentials. Autopilot clusters are regional. You cannot change the node service account of an existing Autopilot cluster, so set it now ([Create an Autopilot cluster](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/creating-an-autopilot-cluster)).

```bash
gcloud container clusters create-auto lab60-cluster \
  --location="$REGION" --service-account="$NODE_SA"
gcloud container clusters get-credentials lab60-cluster --location="$REGION"
kubectl config current-context
```

The context name has the form `gke_PROJECT_ID_LOCATION_CLUSTER_NAME`, so it ends with `_lab60-cluster` ([Prepare your environment for multi-cluster Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/prepare-environment-multi-cluster-gateways)). While the cluster is created, read `pcd/labs/60-gke-probes-hpa/app.yaml` in your editor. The comments explain the requests, the limits, and the three probes:

| Probe | Settings | Result of a failure |
|---|---|---|
| `startupProbe` on `/healthz` | Every 2 seconds, up to 30 failures | The app has up to 60 seconds to start. The kubelet runs no liveness or readiness probe until it succeeds. |
| `livenessProbe` on `/healthz` | Every 5 seconds, 3 failures, 3-second timeout | The kubelet restarts the container. |
| `readinessProbe` on `/ready` | Every 5 seconds, 1 failure | The Pod leaves the Service endpoints. The container keeps running. |

Sources: [Liveness, Readiness, and Startup Probes | Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/probes/), [Configure Liveness, Readiness and Startup Probes | Kubernetes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/).

The requests and the limits are equal: 100m CPU and 128 MiB of memory. Autopilot raises requests that are below its minimum. For the default compute class, the ratio of CPU to memory must be from 1:1 to 1:6.5 (vCPU to GiB), and these requests have a ratio of 1:1.25 ([Resource requests in Autopilot](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-resource-requests)).

6. Deploy the app, the Service, and the test client. The `sed` command puts your image path in the manifest. Then watch the Pods start.

```bash
sed "s|LAB60_IMAGE|${IMAGE}|" pcd/labs/60-gke-probes-hpa/app.yaml | kubectl apply -f -
kubectl get pods -n lab60 -w
```

The Pods can stay `Pending` for a few minutes while Autopilot adds a node. Then the `lab60-app` Pod shows `Running` with `READY 0/1` for about 50 seconds: 20 seconds of start, and 30 seconds of warm-up. Then it shows `1/1`. Press Ctrl+C, and look at the events of the Pod:

```bash
kubectl describe pod -n lab60 -l app=lab60-app | sed -n '/^Events:/,$p'
```

You see `Unhealthy` warnings: first `Startup probe failed` (the port is closed), then `Readiness probe failed` with status code 503 (the warm-up).

7. Show that a Pod that is not ready gets no traffic. Add a second Pod, and wait until it shows `Running` and `READY 0/1`. Then, before it becomes ready, send 20 requests through the Service and list the endpoints.

```bash
kubectl scale deployment/lab60-app -n lab60 --replicas=2
kubectl get pods -n lab60 -l app=lab60-app -w
```

When the new Pod shows `Running 0/1`, press Ctrl+C and run:

```bash
kubectl exec -n lab60 lab60-client -- python load.py http://lab60-app/ 20
kubectl get endpointslices -n lab60 -l kubernetes.io/service-name=lab60-app \
  -o jsonpath='{range .items[*].endpoints[*]}{.targetRef.name}{" ready="}{.conditions.ready}{"\n"}{end}'
```

All 20 answers come from the first Pod. The EndpointSlice lists the new Pod with `ready=false`. Wait one minute, and run the two commands again. Now both Pods answer, and both show `ready=true`.

8. Break the liveness check of one Pod, and watch the kubelet restart its container. The request goes through the Service, so it reaches one of the two Pods. The answer names that Pod.

```bash
kubectl exec -n lab60 lab60-client -- python load.py http://lab60-app/break 1
kubectl get pods -n lab60 -l app=lab60-app -w
```

After about 15 seconds (3 failures, 5 seconds apart), the `RESTARTS` value of that Pod changes to 1. The Pod goes to `READY 0/1` during the new start and warm-up, and the other Pod gets all requests. Press Ctrl+C, and find the events:

```bash
kubectl describe pod -n lab60 -l app=lab60-app | grep -E '^Name:|Restart Count|Liveness probe failed|will be restarted'
```

You see `Liveness probe failed` with status code 500, and a `Killing` event that says the container failed its liveness probe and will be restarted. The restart gives a new container with a new process, so `/healthz` works again.

9. Remove the startup probe to see why a slow app needs it. Without it, the liveness probe starts at once. It fails 3 times before the port opens, so the kubelet kills the container in each start.

```bash
kubectl patch deployment lab60-app -n lab60 --type=json \
  -p='[{"op": "remove", "path": "/spec/template/spec/containers/0/startupProbe"}]'
kubectl get pods -n lab60 -l app=lab60-app -w
```

The change to the Pod template starts a rollout. The new Pod restarts again and again, and soon shows `CrashLoopBackOff`: the kubelet waits longer before each restart ([Troubleshoot CrashLoopBackOff events](https://docs.cloud.google.com/kubernetes-engine/docs/troubleshooting/crashloopbackoff-events)). The two old Pods keep serving. With 2 replicas, the default `maxUnavailable` of 25% rounds down to 0, so the rollout cannot remove an old Pod before a new Pod is ready ([Deployments | Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)). After two or three restarts, press Ctrl+C and roll back:

```bash
kubectl rollout undo deployment/lab60-app -n lab60
kubectl rollout status deployment/lab60-app -n lab60
```

The rollback restores the Pod template with the startup probe. The failed Pod goes away, and the two old Pods stay.

10. Create the HPA. Read `pcd/labs/60-gke-probes-hpa/hpa.yaml` first. It keeps 2 to 6 replicas, and it targets an average CPU use of 50% of the CPU request. The scale-down stabilization window is 60 seconds, so that you see the scale-down soon. In GKE, the default is 300 seconds ([Horizontal Pod autoscaling](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler)).

```bash
kubectl apply -f pcd/labs/60-gke-probes-hpa/hpa.yaml
kubectl get hpa lab60-app -n lab60
```

`TARGETS` shows the current CPU use as a percentage of the request, then the 50% target. It can show `<unknown>` for the first minute, until the first metrics arrive.

11. Generate load, and watch the HPA add Pods. The load Pod runs `load.py` with 4 threads that call `/` with no pause.

```bash
sed "s|LAB60_IMAGE|${IMAGE}|" pcd/labs/60-gke-probes-hpa/load.yaml | kubectl apply -f -
kubectl get hpa lab60-app -n lab60 -w
```

Within a few minutes, `TARGETS` goes above 50%, and `REPLICAS` goes up to 4 and then to 6, the maximum. The HPA calculates `ceil(current replicas × current use ÷ target)`. For example, 2 replicas at 100% CPU with a 50% target give 4 replicas ([Horizontal Pod Autoscaling | Kubernetes](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)). Each new Pod passes its startup and readiness probes before it gets requests. Press Ctrl+C, and look at the Pods and the HPA events:

```bash
kubectl get pods -n lab60 -l app=lab60-app
kubectl describe hpa lab60-app -n lab60 | sed -n '/^Events:/,$p'
```

12. Stop the load, and watch the HPA remove Pods. The CPU use falls almost to 0%. After the 60-second stabilization window, the HPA scales the Deployment down to `minReplicas`.

```bash
kubectl delete deployment lab60-load -n lab60
kubectl get hpa lab60-app -n lab60 -w
```

After a few minutes, `REPLICAS` shows 2. Press Ctrl+C.

## Check your work

```bash
kubectl get deployment,hpa -n lab60
kubectl get deployment lab60-app -n lab60 \
  -o jsonpath='{.spec.template.spec.containers[0].startupProbe.periodSeconds}{"\n"}'
kubectl get hpa lab60-app -n lab60 \
  -o jsonpath='{.spec.behavior.scaleDown.stabilizationWindowSeconds}{"\n"}'
kubectl exec -n lab60 lab60-client -- python load.py http://lab60-app/ 10
```

Expected output:

- `lab60-app` shows `READY 2/2`. The HPA shows `MINPODS 2`, `MAXPODS 6`, and `REPLICAS 2`. The `lab60-load` Deployment is gone.
- `2`: the rollback in step 9 restored the startup probe.
- `60`: the scale-down stabilization window from `hpa.yaml`.
- 10 answers, from the two app Pods.

## Explore

1. A teammate adds a database query to `/healthz`, so that the liveness probe "checks everything". What can go wrong, and what does Google recommend?

<details><summary>Answer</summary>

If the database is slow or down, every Pod fails its liveness probe, and the kubelet restarts all of them. The restarts do not fix the database, and they drop the requests in progress. The Kubernetes docs say that a bad liveness probe can cause cascading failures: restarts under high load, failed client requests, and more load on the other Pods ([Liveness, Readiness, and Startup Probes | Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)). Google says to never make probe logic access other services, because services that do not respond fast can damage the Pod lifecycle ([Best practices for running cost-optimized Kubernetes applications on GKE](https://docs.cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke)). Use liveness only for failures that a restart fixes, such as a deadlock, as `/healthz` does in this lab.

</details>

2. Your app uses a lot of CPU for its first minute, for example to fill a cache. After each scale-up, the HPA sees this CPU use and adds even more Pods. What do you change?

<details><summary>Answer</summary>

Make the Pod report ready only after the CPU spike ends. The Kubernetes docs give two options: a `startupProbe` that does not pass until the high CPU use has passed, or a `readinessProbe` that reports ready only after the spike, with `initialDelaySeconds` ([Horizontal Pod Autoscaling | Kubernetes](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)). For CPU metrics, the HPA sets aside Pods that are not yet ready. During the CPU initialization period (5 minutes by default), it ignores the CPU use of a Pod unless the Pod is ready and the sample was taken while it was ready. The readiness probe also keeps requests away from a Pod until it can serve them.

</details>

3. A Pub/Sub worker uses little CPU, but its backlog grows. How do you scale it on the backlog instead of CPU?

<details><summary>Answer</summary>

Use an `External` metric. GKE docs show an `autoscaling/v2` HPA with the metric `pubsub.googleapis.com|subscription|num_undelivered_messages`, a selector on `resource.labels.subscription_id`, and a target of type `AverageValue`. The Custom Metrics Stackdriver Adapter reads the metric from Cloud Monitoring. Its Kubernetes service account in the `custom-metrics` namespace needs the Monitoring Viewer role (`roles/monitoring.viewer`) through Workload Identity Federation for GKE ([Optimize Pod autoscaling based on metrics](https://docs.cloud.google.com/kubernetes-engine/docs/tutorials/autoscaling-metrics)). Scaling on the backlog can reduce latency before it becomes a problem, but it can use more resources than scaling on CPU. For custom metrics from your own app, Google recommends Managed Service for Prometheus ([About autoscaling workloads based on metrics](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/custom-and-external-metrics)).

</details>

4. What happens on Autopilot if you leave out the requests, and why does the HPA in this lab need them?

<details><summary>Answer</summary>

Autopilot applies default requests, for example 0.5 vCPU for a general-purpose Pod. Google recommends that you set explicit requests for each container, because the defaults might not be sufficient or optimal for the app ([Resource requests in Autopilot](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-resource-requests)). Autopilot bills general-purpose Pods for their requests ([Google Kubernetes Engine pricing](https://cloud.google.com/kubernetes-engine/pricing)), so a request is also a cost decision. A `Utilization` target is a percentage of the request. With the default of 0.5 vCPU, a 50% target means 250m of CPU use in each Pod, which is not the target that you chose. If a container has no request for the resource at all, the HPA takes no action for that metric ([Horizontal Pod autoscaling](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler)).

</details>

## Clean up

```bash
bash pcd/labs/60-gke-probes-hpa/teardown.sh
```

The script deletes, in order:

- The `lab60-cluster` cluster, with all its Pods, Services, and the HPA.
- The `lab60-cluster` entries in the lab-only kubeconfig file. The file itself stays, and the 00-setup teardown deletes it.
- The `lab60-repo` repository, with the image.
- The project-level role binding for `lab60-nodes`, and the `lab60-nodes` service account.

It leaves the enabled APIs in place. It also leaves the small source archive that `gcloud builds submit` copied to the `gs://${PROJECT_ID}_cloudbuild/source` folder, because other builds can use that bucket.

## Docs used

- [Install kubectl and configure cluster access](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl)
- [Prepare your environment for multi-cluster Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/prepare-environment-multi-cluster-gateways)
- [Build and push a Docker image with Cloud Build](https://docs.cloud.google.com/build/docs/build-push-docker-image)
- [Learning Path: Transform a monolith into a GKE app - Containerize the modular app](https://docs.cloud.google.com/kubernetes-engine/docs/learn/cymbal-books/lp1/containerize)
- [Deploying to Google Kubernetes Engine](https://docs.cloud.google.com/artifact-registry/docs/integrate-gke)
- [Configure GKE node service accounts](https://docs.cloud.google.com/kubernetes-engine/security/configure-node-service-accounts)
- [Create an Autopilot cluster](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/creating-an-autopilot-cluster)
- [Resource requests in Autopilot](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-resource-requests)
- [Liveness, Readiness, and Startup Probes | Kubernetes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [Configure Liveness, Readiness and Startup Probes | Kubernetes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [EndpointSlices | Kubernetes](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [Best practices for running cost-optimized Kubernetes applications on GKE](https://docs.cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke)
- [Troubleshoot CrashLoopBackOff events](https://docs.cloud.google.com/kubernetes-engine/docs/troubleshooting/crashloopbackoff-events)
- [Deployments | Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Horizontal Pod autoscaling](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/horizontalpodautoscaler)
- [Configuring horizontal Pod autoscaling](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/horizontal-pod-autoscaling)
- [Horizontal Pod Autoscaling | Kubernetes](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/)
- [Optimize Pod autoscaling based on metrics](https://docs.cloud.google.com/kubernetes-engine/docs/tutorials/autoscaling-metrics)
- [About autoscaling workloads based on metrics](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/custom-and-external-metrics)
- [Google Kubernetes Engine pricing](https://cloud.google.com/kubernetes-engine/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
