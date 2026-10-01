---
id: 61-gke-gateway-canary
title: Canary traffic splitting on GKE with the Gateway API
objectives: ["1.1", "3.2"]
minutes: 60
cost: "Less than $0.20 for each hour that the cluster exists. The GKE cluster management fee is $0.10 per hour, and the GKE free tier gives each billing account $74.40 of credit each month. The Gateway creates one global forwarding rule: $0.025 per hour covers the first 5 forwarding rules in the project. The load balancer also charges $0.008 for each GiB of data that it processes, and this lab sends less than 1 MiB. Autopilot bills the CPU and memory that the Pods request. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Run two versions of an app on a GKE Autopilot cluster, and put a Gateway in front of them. Then release version 2 as a canary with an HTTPRoute: send 10% of the requests to it, then 50%, roll back to 0%, and at last send it 100%. Testers reach version 2 at any time with a request header.

## Exam relevance

- A canary release, test traffic routed by a header, and a rollback that is only a weight change. See [Traffic splitting: gradual rollouts, rollbacks, and A/B tests](note:1.1-traffic-splitting).
- The GatewayClass selects the load balancer type, and weights take precedence over session affinity. See [Choosing a load balancer and session affinity](note:1.1-load-balancing).
- One Deployment and one Service for each version, exposed through a Gateway. See [Deploying containerized applications to GKE](note:3.2-gke-deployments).
- The Gateway does not copy its health check from the readiness probe. See [Kubernetes health checks](note:3.2-health-checks).

## Before you start

- Complete [the setup lab](lab:00-setup), so that `source pcd/labs/env.sh` works.
- **IAM:** you are the Owner of the lab project.
- **Tools:** the gcloud CLI, `kubectl`, the authentication plugin `gke-gcloud-auth-plugin`, and `curl`. `kubectl` needs the plugin to communicate with GKE clusters.
- **Time:** about 60 minutes. Cluster creation and deletion each take several minutes, and the load balancer takes a few minutes to start.
- Run all steps in one shell, from the repository root. Later steps use variables and functions from earlier steps.
- **Public endpoint:** the Gateway gets a public IP address, and anyone who knows it can call the sample app. The app shows only a version and a Pod name. Teardown deletes the load balancer.

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
gcloud services enable container.googleapis.com compute.googleapis.com iam.googleapis.com
```

## Steps

1. Check the kubeconfig file, and set the variables. `env.sh` sets `KUBECONFIG` to a lab-only file, `~/.kube/pcd-lab-config`. So `kubectl` in the lab shell cannot reach the clusters in your normal kubeconfig file. When you create a cluster with `create-auto`, gcloud adds it to the kubeconfig file and makes it the current context ([Install kubectl and configure cluster access](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl)). The two functions save typing in later steps.

```bash
echo "$KUBECONFIG"
export NODE_SA="lab61-nodes@${PROJECT_ID}.iam.gserviceaccount.com"
# set_weights V1 V2: applies route.yaml with weight V1 for lab61-v1 and weight V2 for lab61-v2.
set_weights() { sed -e "s/V1_WEIGHT/$1/" -e "s/V2_WEIGHT/$2/" pcd/labs/61-gke-gateway-canary/route.yaml | kubectl apply -f -; }
# count TEXT: sends 100 requests to the Gateway, and counts the answer lines that contain TEXT.
count() { for i in $(seq 1 100); do curl -s "http://${GATEWAY_IP}/" | grep "$1"; done | sort | uniq -c; }
```

The first line prints a path that ends with `.kube/pcd-lab-config`. If you open a new terminal, run `source pcd/labs/env.sh`, the lines of this step, and the `export GATEWAY_IP` line from step 6 again.

2. Create a node service account. By default, GKE nodes use the Compute Engine default service account. Google recommends a custom node service account with the Kubernetes Engine Default Node Service Account role (`roles/container.defaultNodeServiceAccount`) ([Configure GKE node service accounts](https://docs.cloud.google.com/kubernetes-engine/security/configure-node-service-accounts)). The sample images in this lab are public, so the nodes need no Artifact Registry role.

```bash
gcloud iam service-accounts create lab61-nodes --display-name="lab61 GKE nodes"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${NODE_SA}" \
  --role=roles/container.defaultNodeServiceAccount --condition=None
```

If the binding fails because the service account does not exist yet, wait one minute and run the command again.

3. Create the Autopilot cluster, and get its credentials. You cannot change the node service account of an existing Autopilot cluster, so set it now ([Create an Autopilot cluster](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/creating-an-autopilot-cluster)).

```bash
gcloud container clusters create-auto lab61-cluster \
  --location="$REGION" --service-account="$NODE_SA"
gcloud container clusters get-credentials lab61-cluster --location="$REGION"
kubectl config current-context
```

The context name has the form `gke_PROJECT_ID_LOCATION_CLUSTER_NAME`, so it ends with `_lab61-cluster` ([Prepare your environment for multi-cluster Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/prepare-environment-multi-cluster-gateways)). While the cluster is created, read the three manifests in `pcd/labs/61-gke-gateway-canary/` in your editor. The comments explain each setting.

| File | Resources | What they do |
|---|---|---|
| `app.yaml` | Namespace `lab61`, Deployments and Services `lab61-v1` and `lab61-v2` | Version 1 runs `hello-app:1.0` in 2 Pods. Version 2 runs `hello-app:2.0` in 1 Pod. Each Service selects the Pods of one version. |
| `gateway.yaml` | Gateway `lab61-gateway` | Listens for HTTP on port 80. Its GatewayClass makes GKE create a global external Application Load Balancer. |
| `route.yaml` | HTTPRoute `lab61-route` | Rule 1 sends requests with the header `env: canary` to version 2. Rule 2 splits all other requests by weight. |

4. Make sure that the Gateway API is on. GKE Gateway is always enabled on Autopilot clusters ([Deploying Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways)).

```bash
gcloud container clusters describe lab61-cluster --location="$REGION" \
  --format="value(networkConfig.gatewayApiConfig.channel)"
kubectl get gatewayclass
```

The first command prints `CHANNEL_STANDARD`. The second lists the GatewayClasses that the GKE Gateway controller installed, for example `gke-l7-global-external-managed`, `gke-l7-regional-external-managed`, `gke-l7-gxlb`, and `gke-l7-rilb`, with `ACCEPTED` `True`. If the first output is empty, enable the Gateway API, then run the two commands again. The update can take up to 45 minutes.

```bash
gcloud container clusters update lab61-cluster --location="$REGION" --gateway-api=standard
```

5. Deploy the two versions, and wait until they are available.

```bash
kubectl apply -f pcd/labs/61-gke-gateway-canary/app.yaml
kubectl wait --for=condition=Available deployment --all -n lab61 --timeout=10m
kubectl get pods -n lab61 -L version
```

The command can wait a few minutes while Autopilot adds a node. Then you see 3 Pods with `READY 1/1`: two with the label `v1` and one with `v2`. A canary on the Gateway API needs a Service for each version, because the HTTPRoute sends traffic to Services ([Gateway traffic management](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/traffic-management)).

6. Create the Gateway, and wait until it is ready. GKE creates the load balancer and a public IP address. This can take a few minutes. The `Programmed` condition with the status `True` means that the Gateway is ready ([Deploying Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways)).

```bash
kubectl apply -f pcd/labs/61-gke-gateway-canary/gateway.yaml
kubectl wait --for=condition=Programmed gateways.gateway.networking.k8s.io/lab61-gateway \
  -n lab61 --timeout=15m
export GATEWAY_IP=$(kubectl get gateways.gateway.networking.k8s.io lab61-gateway -n lab61 \
  -o jsonpath='{.status.addresses[0].value}')
echo "$GATEWAY_IP"
curl -s -o /dev/null -w "%{http_code}\n" "http://${GATEWAY_IP}/"
```

The last command prints `404`. The Gateway has no routes yet, so all traffic goes to a default backend that returns HTTP 404. If it prints `000` or another code, the load balancer is not ready yet. Wait one minute and run the `curl` line again.

7. Start the canary: give version 2 a weight of 10, and version 1 a weight of 90. Then check that the HTTPRoute is bound to the Gateway.

```bash
set_weights 90 10
kubectl get httproutes.gateway.networking.k8s.io lab61-route -n lab61 \
  -o jsonpath='{range .status.parents[*].conditions[*]}{.type}={.status}{"\n"}{end}'
```

You see `Accepted=True`, which means that the route is bound to the Gateway, and `Reconciled=True`. The Gateway controller now updates the load balancer. Wait about two minutes, then send 100 requests and count the versions:

```bash
count Version
```

About 90 answers show `Version: 1.0.0`, and about 10 show `Version: 2.0.0`. Each request is a separate choice, so the numbers change a little from run to run. If the total is less than 100, some requests got an error such as `no healthy upstream` while the load balancer health checks started. Wait one minute and run `count Version` again.

8. Send test traffic as a tester. Requests with the header `env: canary` match rule 1, so they always reach version 2, whatever the weights are. The GKE docs use this header match to send synthetic test traffic to a new version before real users see it ([Deploy a multi-cluster Gateway for weighted traffic splitting](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploy-gateway-traffic-splitting)).

```bash
for i in $(seq 1 20); do curl -s -H "env: canary" "http://${GATEWAY_IP}/" | grep Version; done | sort | uniq -c
```

All 20 answers show `Version: 2.0.0`.

9. Increase the canary to 50%. Then count the versions and the Pods.

```bash
set_weights 50 50
```

Wait about two minutes, then run:

```bash
count Version
count Hostname
```

About half of the answers come from each version. The `Hostname` lines show the Pod names: the one `lab61-v2` Pod answers about 50 requests, and each of the two `lab61-v1` Pods answers about 25. The weights split the requests between the Services, not between the Pods. Weights are relative: 50 and 50 give the same split as 1 and 1 ([Gateway traffic management](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/traffic-management)).

10. Roll back. Suppose that the canary shows errors. Send all requests to version 1 again with a weight change.

```bash
set_weights 100 0
```

Wait about two minutes, then run:

```bash
count Version
curl -s -H "env: canary" "http://${GATEWAY_IP}/" | grep Version
```

All 100 answers show `Version: 1.0.0`. A weight of 0 sends no requests to `lab61-v2`. The rollback needs no build and no new Pods, because version 1 never stopped. The `lab61-v2` Pod keeps running, and the header rule still reaches it, so testers can examine the problem while users stay on version 1.

11. Complete the release: send all requests to version 2.

```bash
set_weights 0 100
```

Wait about two minutes, then run:

```bash
count Version
```

All 100 answers show `Version: 2.0.0`. In a real release, you keep `lab61-v1` until you are sure about version 2, so that a rollback stays a weight change. Then you delete it.

## Check your work

```bash
kubectl get httproutes.gateway.networking.k8s.io lab61-route -n lab61 \
  -o jsonpath='{range .spec.rules[1].backendRefs[*]}{.name}={.weight}{"\n"}{end}'
kubectl get gateways.gateway.networking.k8s.io lab61-gateway -n lab61 \
  -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}{"\n"}'
gcloud compute forwarding-rules list --global --filter="name~lab61" --format="value(name,IPAddress)"
count Version
```

Expected output:

- `lab61-v1=0` and `lab61-v2=100`: the weights from step 11.
- `True`: the Gateway is programmed.
- One forwarding rule, with the IP address in `$GATEWAY_IP`. GKE created it for the Gateway. The name contains `lab61-lab61-gateway`, the namespace and the name of the Gateway.
- `100 Version: 2.0.0`.

## Explore

1. You want the same canary for a Cloud Run service. What do you use instead of two Deployments, two Services, and weights in an HTTPRoute?

<details><summary>Answer</summary>

Cloud Run splits traffic between the revisions of one service. You deploy the new revision with `--no-traffic` and a tag, and you test it at the tag URL. The tag URL does the job of the header rule in this lab. Then you change the split with `gcloud run services update-traffic SERVICE --to-revisions REVISION=PERCENTAGE`, and you roll back with `--to-revisions OLD_REVISION=100` ([Rollbacks, gradual rollouts, and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)). You do not create a second service, because each revision stays available. [The Cloud Run lab](lab:10-cloud-run-source-deploy) does these steps. One difference is session affinity. On Cloud Run, session affinity takes precedence over the traffic split ([Set session affinity for services](https://docs.cloud.google.com/run/docs/configuring/session-affinity)). On a GKE Gateway, the weights take precedence over session affinity.

</details>

2. For an A/B test, each user must stay on one version. You add session affinity to `lab61-v1` and `lab61-v2`, and you keep the 50/50 weights. Does each user stay on one version? What does GKE recommend for session affinity?

<details><summary>Answer</summary>

No. Weighted traffic splitting takes precedence over session affinity. The load balancer selects the backend Service by weight first, and it applies session affinity after that. So the next request of a user can go to the other version. Google says not to put weights on a route rule that needs session stickiness ([Gateway traffic management](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/traffic-management), [Configure Gateway resources using Policies](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources)). For a sticky A/B test, send each user group to a version with a header match, as rule 1 does for testers. Every request that has the header goes to the same version. GKE recommends a GCPTrafficDistributionPolicy that targets the Service for session affinity. It needs GKE 1.35.2-gke.1269001 or later for `CLIENT_IP`, `HEADER_FIELD`, `GENERATED_COOKIE`, and `HTTP_COOKIE`, and 1.36.3-gke.1767000 or later for `STRONG_COOKIE_AFFINITY`. All types except `STRONG_COOKIE_AFFINITY` and `NONE` need `localityLbAlgorithm` set to `MAGLEV` or `RING_HASH` ([Configure Gateway resources using Policies](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources)).

</details>

3. During the 90/10 stage, all Pods of version 2 crash. What do users see, and what do you do?

<details><summary>Answer</summary>

About 10% of the requests fail. A weight does not change with the health or the load of the backends, so the load balancer still gives 10% of the traffic to `lab61-v2`, and that traffic can be dropped ([Gateway traffic management](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/traffic-management)). Clients can get HTTP 503 with `no healthy upstream` ([Deploying Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways)). Roll back with a weight change, as in step 10. Also check the health check. The Gateway does not copy health check settings from the readiness or liveness probes. If the app does not return HTTP 200 for `GET /`, configure a HealthCheckPolicy with the correct path, or the load balancer marks every Pod unhealthy ([Configure Gateway resources using Policies](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources)).

</details>

4. Why does this lab use the `gke-l7-global-external-managed` GatewayClass, and not `gke-l7-gxlb` or `gke-l7-regional-external-managed`?

<details><summary>Answer</summary>

The `gke-l7-gxlb` GatewayClass uses the classic Application Load Balancer, and it does not support traffic splitting ([Gateway traffic management](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/traffic-management)). For a global external Application Load Balancer, Google recommends `gke-l7-global-external-managed` over `gke-l7-gxlb`, because of its advanced security and traffic management capabilities ([About Gateway API](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/gateway-api)). The regional and cross-region GatewayClasses need a proxy-only subnet in the region, which is one more resource to create and delete ([Deploying Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways)). An app that can run in one region can use the regional external Application Load Balancer, which can cost less ([Cloud Load Balancing pricing](https://cloud.google.com/load-balancing/pricing)). The `gke-l7-rilb` class makes an internal Application Load Balancer, for clients in the VPC network or in networks connected to it.

</details>

## Clean up

```bash
bash pcd/labs/61-gke-gateway-canary/teardown.sh
```

The script deletes, in order:

- The HTTPRoute and the Gateway, while the cluster still runs. The Gateway controller then deletes the load balancer. The script waits until the forwarding rule is gone.
- The `lab61` namespace, with the Deployments and the Services. The NEG controller then deletes the network endpoint groups (NEGs) of the Services. Google says to delete all NEGs before you delete the cluster, because a cluster deletion can leave NEGs behind ([Container-native load balancing through standalone zonal NEGs](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/standalone-neg)).
- The `lab61-cluster` cluster.
- The `lab61-cluster` entries in the lab-only kubeconfig file. The file itself stays, and the 00-setup teardown deletes it.
- The project-level role binding for `lab61-nodes`, and the `lab61-nodes` service account.

At the end, the script lists the forwarding rules and NEGs that have `lab61` in their names. Expect no names. If you see names, delete those resources with the gcloud commands in the "Orphaned Gateway resources after cluster deletion" section of [Deploying Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways). The script leaves the enabled APIs in place.

## Docs used

- [Install kubectl and configure cluster access](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl)
- [Prepare your environment for multi-cluster Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/prepare-environment-multi-cluster-gateways)
- [Configure GKE node service accounts](https://docs.cloud.google.com/kubernetes-engine/security/configure-node-service-accounts)
- [Create an Autopilot cluster](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/creating-an-autopilot-cluster)
- [Deploying Gateways](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways)
- [About Gateway API](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/gateway-api)
- [GatewayClass capabilities](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/gatewayclass-capabilities)
- [Gateway traffic management](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/traffic-management)
- [Deploy a multi-cluster Gateway for weighted traffic splitting](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploy-gateway-traffic-splitting)
- [Configure Gateway resources using Policies](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources)
- [Container-native load balancing through standalone zonal NEGs](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/standalone-neg)
- [Deploy an app to a GKE cluster](https://docs.cloud.google.com/kubernetes-engine/docs/deploy-app-cluster)
- [Exposing applications using services](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/exposing-apps)
- [Rollbacks, gradual rollouts, and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Set session affinity for services](https://docs.cloud.google.com/run/docs/configuring/session-affinity)
- [Google Kubernetes Engine pricing](https://cloud.google.com/kubernetes-engine/pricing)
- [Cloud Load Balancing pricing](https://cloud.google.com/load-balancing/pricing)
