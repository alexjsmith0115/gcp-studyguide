---
id: 32-cloud-run-networking
title: Cloud Run revisions, traffic splitting, ingress, and Direct VPC egress
objectives: ["2.3"]
minutes: 60
cost: "Less than $0.05. The e2-micro VM costs about $0.01 per hour (or nothing inside the Compute Engine free tier), and the Cloud Run usage fits in the Cloud Run free tier. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Deploy two revisions of a private Cloud Run service, test the new one with a revision tag, and split traffic between them. Then close the service to the internet with internal ingress. Finally, call the service and a private-only VM from a Cloud Run job that uses Direct VPC egress.

## Exam relevance

- Cloud Run uses revisions, tags, and traffic splits for gradual rollouts, for tests of a new revision before it serves users, and for rollbacks. See [Configuring Cloud Run, Cloud Run functions, and VMware Engine networking](note:2.3-serverless) and, for release strategy, [Deployment and release management](note:6.3-release-management).
- Two separate controls protect a service. Ingress settings decide which network paths can reach it. The invoker IAM check decides which identities can call it. The exam often offers one control where the requirement needs the other.
- Direct VPC egress is the recommended way for Cloud Run to reach private IP addresses in a VPC. It needs no Serverless VPC Access connector. See [Cloud-native network design](note:1.3-network-design).
- A call from one Cloud Run resource to another service with internal ingress counts as internal only when it goes through the VPC. See [Mapping workloads to compute platforms](note:1.3-compute-choice).

## Before you start

Run all commands from the repository root, in one shell. Enable the APIs:

```bash
source labs/env.sh
gcloud services enable run.googleapis.com compute.googleapis.com iam.googleapis.com logging.googleapis.com
```

You need:

- IAM: Owner on the lab project. Without Owner, you need Cloud Run Admin, Compute Network Admin, Compute Instance Admin (v1), Service Account Admin, Service Account User, and Logs Viewer. Your account also needs the `run.routes.invoke` permission to call the private service. Owner and Cloud Run Admin include it.
- Tools: the gcloud CLI and `curl`.
- Time: about 60 minutes. Cloud Run keeps the IP addresses in the Direct VPC egress subnet for 1 to 2 hours after you delete the job. You run `teardown.sh` a second time after that wait to delete the subnet and the VPC. They cost nothing while they wait.

## Steps

1. Create a custom-mode VPC with two subnets. The VM and Cloud Run get IP addresses from different subnets, so a firewall rule can allow only the Cloud Run subnet. A Direct VPC egress subnet must be `/26` or larger, and it needs Private Google Access for step 12.

```bash
source labs/env.sh

gcloud compute networks create lab32-vpc --subnet-mode=custom

gcloud compute networks subnets create lab32-vm-subnet \
  --network=lab32-vpc \
  --region=$REGION \
  --range=10.32.0.0/28

gcloud compute networks subnets create lab32-run-subnet \
  --network=lab32-vpc \
  --region=$REGION \
  --range=10.32.1.0/26 \
  --enable-private-ip-google-access
```

2. Allow traffic from the Cloud Run subnet to the VM on port 8080. Ingress firewall rules cannot match the network tags or the service identity of Cloud Run traffic. So the rule uses the subnet range as the source.

```bash
gcloud compute firewall-rules create lab32-allow-run-to-backend \
  --network=lab32-vpc \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:8080 \
  --source-ranges=10.32.1.0/26 \
  --target-tags=lab32-backend
```

3. Create a backend VM that has only a private IP address. It has no external IP address and no service account. Its startup script serves one page on port 8080.

```bash
gcloud compute instances create lab32-backend \
  --zone=$ZONE \
  --machine-type=e2-micro \
  --subnet=lab32-vm-subnet \
  --no-address \
  --no-service-account \
  --no-scopes \
  --tags=lab32-backend \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --metadata-from-file=startup-script=labs/32-cloud-run-networking/backend-startup.sh

export BACKEND_IP=$(gcloud compute instances describe lab32-backend --zone=$ZONE \
  --format="value(networkInterfaces[0].networkIP)")
echo "Backend private IP: $BACKEND_IP"
```

4. Create two service accounts. `lab32-hello-sa` is the runtime identity of the service and gets no roles. `lab32-caller` is the identity of the job and later gets only the Cloud Run Invoker role on the service.

```bash
gcloud iam service-accounts create lab32-hello-sa --display-name="Lab 32 service identity"
gcloud iam service-accounts create lab32-caller --display-name="Lab 32 caller job identity"
```

5. Deploy revision `v1` as a private service. Cloud Run enforces the invoker IAM check by default. `--no-allow-unauthenticated` makes sure that no public binding is added.

```bash
gcloud run deploy lab32-hello \
  --image=us-docker.pkg.dev/google-samples/containers/gke/hello-app:1.0 \
  --region=$REGION \
  --service-account="lab32-hello-sa@$PROJECT_ID.iam.gserviceaccount.com" \
  --no-allow-unauthenticated \
  --revision-suffix=v1 \
  --max-instances=2

export URL=$(gcloud run services describe lab32-hello --region=$REGION --format="value(status.url)")
echo "$URL"
```

6. Call the service without and with an identity token. A call without a token gets `403`. Your own token works because your account has the `run.routes.invoke` permission.

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$URL"

export TOKEN=$(gcloud auth print-identity-token)
curl -s -H "Authorization: Bearer $TOKEN" "$URL"
```

The second command prints `Hello, world!` and `Version: 1.0.0`. An ID token expires about one hour after gcloud creates it. If a later call fails with an authentication error, run the `export TOKEN` line again.

7. Deploy revision `v2` with no traffic and the tag `green`. The tag gives the new revision its own URL, so you can test it before it serves users.

```bash
gcloud run deploy lab32-hello \
  --image=us-docker.pkg.dev/google-samples/containers/gke/hello-app:2.0 \
  --region=$REGION \
  --revision-suffix=v2 \
  --no-traffic \
  --tag=green

export TAG_URL="https://green---${URL#https://}"
curl -s -H "Authorization: Bearer $TOKEN" "$TAG_URL"
curl -s -H "Authorization: Bearer $TOKEN" "$URL"
```

The tag URL prints `Version: 2.0.0`. The main URL still prints `Version: 1.0.0`.

8. Send 50% of the traffic to the tagged revision, as in a canary release. The other 50% stays on `v1`.

```bash
gcloud run services update-traffic lab32-hello --region=$REGION --to-tags=green=50

for i in $(seq 1 20); do
  curl -s -H "Authorization: Bearer $TOKEN" "$URL" | grep Version
done | sort | uniq -c
```

The counts for `Version: 1.0.0` and `Version: 2.0.0` are both near 10.

9. Send all traffic to the latest revision. After a traffic split, new deployments keep the split pattern until you send all traffic to the latest revision again.

```bash
gcloud run services update-traffic lab32-hello --region=$REGION --to-latest
gcloud run services describe lab32-hello --region=$REGION
```

The traffic section shows 100% on the latest revision, `lab32-hello-v2`, and the `green` tag URL.

10. Set ingress to `internal` and call the service again from your machine. A request that does not meet the ingress setting never reaches the container, and Cloud Run returns `404`, even with a valid token.

```bash
gcloud run services update lab32-hello --region=$REGION --ingress=internal

export TOKEN=$(gcloud auth print-identity-token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$URL"
```

If you still get `200`, wait one minute and run the `curl` command again.

11. Give the caller identity the Cloud Run Invoker role on this one service. Grant the role on the service, not on the project, for least privilege.

```bash
gcloud run services add-iam-policy-binding lab32-hello \
  --region=$REGION \
  --member="serviceAccount:lab32-caller@$PROJECT_ID.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```

12. Create and run a Cloud Run job that uses Direct VPC egress with `all-traffic`. The job calls the VM at its private IP address. Then it gets an ID token from the metadata server and calls the internal service. The call to `run.app` counts as internal because it goes through the VPC subnet, which has Private Google Access.

```bash
gcloud run jobs create lab32-probe \
  --region=$REGION \
  --image=gcr.io/google.com/cloudsdktool/google-cloud-cli:slim \
  --service-account="lab32-caller@$PROJECT_ID.iam.gserviceaccount.com" \
  --network=lab32-vpc \
  --subnet=lab32-run-subnet \
  --vpc-egress=all-traffic \
  --set-env-vars="TARGET_URL=$URL,BACKEND_IP=$BACKEND_IP" \
  --max-retries=0 \
  --task-timeout=5m \
  --command=bash \
  --args='-c,echo "== private VM =="; curl -sS --retry 6 --retry-all-errors --retry-delay 10 --connect-timeout 5 -w "\nHTTP %{http_code}\n" "http://$BACKEND_IP:8080/"; TOKEN=$(curl -sS -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=$TARGET_URL"); echo "== internal Cloud Run service =="; curl -sS --retry 6 --retry-all-errors --retry-delay 10 --connect-timeout 5 -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$TARGET_URL"'

export START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gcloud run jobs execute lab32-probe --region=$REGION --wait
```

The job can take a minute or more to connect to the VPC when it starts. The `curl` retries cover this delay.

13. Read the job output in Cloud Logging. The filter shows only log entries from the execution that you started in step 12. Logs can take up to a minute to appear.

```bash
export FILTER="resource.type=cloud_run_job AND resource.labels.job_name=lab32-probe AND timestamp>=\"$START\""
gcloud logging read "$FILTER" --order=asc --limit=50 --format="value(textPayload)"
```

The output shows the page from `lab32-backend` with `HTTP 200`, then `Version: 2.0.0` from the internal service with `HTTP 200`.

14. Change the job egress to `private-ranges-only` and run it again. Now only traffic to private IP addresses goes through the VPC. The call to `run.app` takes the default path, so the service sees it as external traffic and returns `404`.

```bash
gcloud run jobs update lab32-probe --region=$REGION --vpc-egress=private-ranges-only

export START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gcloud run jobs execute lab32-probe --region=$REGION --wait

export FILTER="resource.type=cloud_run_job AND resource.labels.job_name=lab32-probe AND timestamp>=\"$START\""
gcloud logging read "$FILTER" --order=asc --limit=50 --format="value(textPayload)"
```

The VM still answers with `HTTP 200`. The service call now ends with `HTTP 404`.

## Check your work

```bash
gcloud run services describe lab32-hello --region=$REGION --format=export | grep "run.googleapis.com/ingress"
gcloud run services get-iam-policy lab32-hello --region=$REGION
gcloud run revisions list --service=lab32-hello --region=$REGION
gcloud run jobs describe lab32-probe --region=$REGION
gcloud compute addresses list --filter="purpose=SERVERLESS"
```

Expected output:

- `run.googleapis.com/ingress: internal`.
- The IAM policy has one binding: `roles/run.invoker` for `serviceAccount:lab32-caller@...`. There is no `allUsers` member.
- Two revisions: `lab32-hello-v1` and `lab32-hello-v2`.
- The job description shows network `lab32-vpc` and subnet `lab32-run-subnet`.
- The address list can show addresses with purpose `SERVERLESS` in `lab32-run-subnet`. Cloud Run reserves these IP addresses for Direct VPC egress, in blocks of 16.

If step 13 shows no page from the VM, confirm that the startup script ran:

```bash
gcloud compute instances get-serial-port-output lab32-backend --zone=$ZONE | grep -i "startup-script"
```

## Explore

1. A developer says: "The service needs a token to call it, so internal ingress adds nothing." Why is that wrong?

<details><summary>Answer</summary>

Ingress and IAM check different things. Ingress checks the network path, and IAM checks the identity. In step 10, a valid token from outside the allowed paths still got `404`. With both controls, a stolen token does not work from the internet. A caller inside the VPC still needs the Cloud Run Invoker role.

</details>

2. In step 14, the VM still answered but the service returned `404`. What are the options to reach a service with internal ingress from another Cloud Run resource?

<details><summary>Answer</summary>

The traffic must go through a VPC network. First, the calling resource uses Direct VPC egress or a connector. Then use one of these options:

- Route all traffic to the VPC, and enable Private Google Access on the egress subnet. This lab does this in step 12.
- Put Private Service Connect or an internal Application Load Balancer in front of the service, and call it at an internal IP address.
- Enable Private Google Access, and configure DNS to resolve `run.app` to the `private.googleapis.com` or `restricted.googleapis.com` ranges.

</details>

3. You must open `lab32-hello` to internet users behind Google Cloud Armor, and keep the `run.app` URL closed. What do you change?

<details><summary>Answer</summary>

Put an external Application Load Balancer with Cloud Armor in front of the service. Set ingress to `internal-and-cloud-load-balancing`. This setting allows requests from the external Application Load Balancer and blocks direct internet requests to the `run.app` URL. You can also disable the default `run.app` URL. See [Choosing a load balancer](note:1.3-load-balancing).

</details>

4. When is a Serverless VPC Access connector still a reasonable choice instead of Direct VPC egress?

<details><summary>Answer</summary>

Google recommends Direct VPC egress: no connector VMs to manage or pay for, lower latency, and higher throughput. A connector uses fewer IP addresses, which helps when the subnet space is small. Also, with Cloud NAT, Direct VPC egress can add cold start delays of 30 seconds or more. For better startup performance with Cloud NAT, Google recommends connectors.

</details>

## Clean up

```bash
bash labs/32-cloud-run-networking/teardown.sh
```

The script deletes:

- The Cloud Run job `lab32-probe` and the service `lab32-hello` with all revisions.
- The VM `lab32-backend` and the firewall rule `lab32-allow-run-to-backend`.
- The service accounts `lab32-caller` and `lab32-hello-sa`.
- The subnets `lab32-vm-subnet` and `lab32-run-subnet`, and the VPC `lab32-vpc`.

Cloud Run releases the Direct VPC egress IP addresses 1 to 2 hours after you delete the job and the service. Until then, the delete of `lab32-run-subnet` and `lab32-vpc` fails, and the script tells you. Run the script again after the wait. The subnet and the VPC cost nothing while they wait.

## Docs used

- [Direct VPC with a VPC network](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Compare Direct VPC egress and VPC connectors](https://docs.cloud.google.com/run/docs/configuring/connecting-vpc)
- [Restrict network endpoint ingress for Cloud Run services and instances](https://docs.cloud.google.com/run/docs/securing/ingress)
- [Private networking and Cloud Run](https://docs.cloud.google.com/run/docs/securing/private-networking)
- [Rollbacks, gradual rollouts, and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Invoke with an HTTPS request](https://docs.cloud.google.com/run/docs/triggering/https-request) (tag URL format)
- [Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)
- [Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Allowing public (unauthenticated) access](https://docs.cloud.google.com/run/docs/authenticating/public) (the invoker IAM check)
- [Deploy container images to Cloud Run services](https://docs.cloud.google.com/run/docs/deploying) (supported registries)
- [Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting) (`404` for blocked ingress)
- [Logging and viewing logs in Cloud Run](https://docs.cloud.google.com/run/docs/logging) and [Logging query language](https://docs.cloud.google.com/logging/docs/view/logging-query-language)
- [Exposing applications using services](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/exposing-apps) (the `hello-app:2.0` sample output)
- [Example Dockerfiles](https://docs.cloud.google.com/sdk/docs/dockerfile_example) (the Google Cloud CLI image path)
- [Cloud Run pricing](https://cloud.google.com/run/pricing) and [General-purpose VM pricing](https://cloud.google.com/products/compute/pricing/general-purpose)
- [Free Google Cloud features and trial offer](https://docs.cloud.google.com/free/docs/free-cloud-features)
