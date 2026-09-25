---
id: 72-load-test-failure-drill
title: Load test and failure drill
objectives: ["6.6", "4.1"]
minutes: 90
cost: "Less than $0.25 for a 90-minute run: three e2-micro VMs (the Compute Engine Free Tier covers one e2-micro VM each month in us-central1, us-east1, and us-west1), one global forwarding rule ($0.025 per hour), and Cloud Run and Cloud Build usage that fits in their free tiers. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Load test a Cloud Run service with a controlled test harness, watch it scale in Cloud Monitoring, and push it past its capacity limit. Then run a failure drill on a regional managed instance group (MIG) behind a load balancer: delete a VM under load, measure what users see, and inject faults at the load balancer to test client retries.

## Exam relevance

- Load testing, chaos engineering, fault injection, overload protection, and retries with exponential backoff: [Reliability in production](note:6.6-production-reliability).
- Testing and validation of software and infrastructure: [Testing, validation, and root cause analysis](note:4.1-testing-and-troubleshooting).
- Failure drills as part of a disaster recovery plan: [Disaster recovery planning](note:4.1-disaster-recovery).
- Metrics that show scaling and errors: [Google Cloud Observability](note:6.2-observability).
- Related labs: a failover drill for the data tier in [Cloud SQL high availability, backups, and cross-region replica](lab:21-cloud-sql-ha-dr), and autohealing after an app failure plus CPU autoscaling in [Regional MIG with autohealing, autoscaling, rolling updates, and Spot VMs](lab:30-mig-autoscaling-spot).

## Before you start

- Complete `labs/00-setup` once. Run all commands from the repository root, in one shell, because later steps use variables from earlier steps.
- IAM: you need the Owner role on the lab project.
- Tools: the gcloud CLI, `curl`, and `python3` (3.9 or later). The lab scripts use only the Python standard library.
- If Python reports `CERTIFICATE_VERIFY_FAILED` on macOS, run the `Install Certificates.command` file that comes with the python.org installer, or use Cloud Shell.
- Quota: the lab runs up to 10 Cloud Run instances and 3 e2-micro VMs in `$REGION`.
- Time: about 90 minutes. Part of the time is waiting for the build, the VMs, and the load balancer.

```bash
source labs/env.sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com compute.googleapis.com monitoring.googleapis.com
```

## Steps

### Part 1: Load test a Cloud Run service

1. Grant the Cloud Run Builder role to the Compute Engine default service account, because a source deployment uses this account to build the image. If you did lab 70, the binding exists already.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

2. Deploy the app with known limits, so that you can calculate its capacity. If gcloud asks to create the `cloud-run-source-deploy` repository, answer `Y`.

```bash
gcloud run deploy lab72-api --source=labs/72-load-test-failure-drill/app \
  --region="$REGION" --no-invoker-iam-check \
  --concurrency=5 --min=1 --max=10
export URL="$(gcloud run services describe lab72-api --region="$REGION" --format='value(status.url)')"
curl -s "$URL/work?ms=100"
```

- `/work?ms=N` waits N milliseconds, like a call to a slow database, and then returns the ID of the instance that answered.
- `--concurrency=5`: one instance handles at most 5 requests at the same time.
- `--max=10` and `--min=1` set service-level limits. Google recommends service-level maximum instances, and you can change them without a new revision. One warm instance prevents cold starts from distorting the results.
- `--no-invoker-iam-check` makes the service public. This is the method that Google recommends for public services.

3. Read the options of the load generator, because you can interpret a load test only when you control its rate and concurrency.

```bash
python3 labs/72-load-test-failure-drill/loadgen.py --help
```

Each worker sends one request, waits for the answer, and then sends the next request. The number of workers is the number of requests in flight. The latency that the script prints includes time in a server queue, because a user waits for that time too.

4. Measure a baseline with 5 workers for 60 seconds.

```bash
python3 labs/72-load-test-failure-drill/loadgen.py --url "$URL/work?ms=200" \
  --workers 5 --duration 60
```

Expected result: `ok%` is 100. `p50ms` is a little more than 200 (the work plus the network time). The `inst` column shows 1 or 2 instances.

5. Increase the load six times, to 30 workers for 3 minutes, and watch the `inst` column as Cloud Run adds instances.

```bash
python3 labs/72-load-test-failure-drill/loadgen.py --url "$URL/work?ms=200" \
  --workers 30 --duration 180
```

Expected result: 30 requests in flight need at least 6 instances (30 / 5). Cloud Run targets 60% of the concurrency limit, so it adds instances up to the maximum of 10. The first interval can show a higher `p99ms` while new instances start. After that, `rps` is about six times the baseline and the latency is near the baseline. This is linear scale-out.

6. Wait 3 minutes, then read the instance count from Cloud Monitoring, because the load generator sees only the instances that answered it.

```bash
python3 labs/72-load-test-failure-drill/metrics.py --minutes 15 \
  'sum by (state) (run_googleapis_com:container_instance_count{monitored_resource="cloud_run_revision",service_name="lab72-api"})'
```

Expected result: the `state=active` series goes up to about 10 during step 5. Idle instances stay for some minutes after the load stops. Cloud Monitoring samples this metric every 60 seconds, and a point can take up to 120 more seconds to appear. For charts, open **Cloud Run > lab72-api > Metrics** in the console.

7. Simulate an overload: the dependency becomes slow (5 seconds for each request) and the service can run only 1 instance, as you set it to protect a database with few connections.

```bash
gcloud run services update lab72-api --region="$REGION" --max=1
python3 labs/72-load-test-failure-drill/loadgen.py --url "$URL/work?ms=5000" \
  --workers 40 --duration 90 --interval 15
```

Expected result: one instance has 5 slots, so it completes about 1 request each second. The other requests wait in the pending queue. A request that waits more than about 10 seconds fails with HTTP `429`. The output shows many `429` answers, a low `ok%`, and a `p50ms` near 10000. Cloud Run can run more instances than the maximum for a short time during a load test, so your numbers can differ.

8. Set the maximum back to 10 instances and repeat the test, to confirm that the instance limit caused the errors.

```bash
gcloud run services update lab72-api --region="$REGION" --max=10
python3 labs/72-load-test-failure-drill/loadgen.py --url "$URL/work?ms=5000" \
  --workers 40 --duration 90 --interval 15
```

Expected result: after the first interval, `ok%` is 100 and `p50ms` is a little more than 5000. Ten instances give 50 slots for 40 requests in flight.

### Part 2: Failure drill on a regional MIG

9. Create a VPC network, a subnet, and one firewall rule for the load balancer and its health checks. No rule opens SSH, and the VMs get no external IP address.

```bash
gcloud compute networks create lab72-vpc --subnet-mode=custom
gcloud compute networks subnets create lab72-subnet \
  --network=lab72-vpc --region="$REGION" --range=10.72.0.0/24
gcloud compute firewall-rules create lab72-allow-lb \
  --network=lab72-vpc --direction=INGRESS --action=allow --rules=tcp:80 \
  --source-ranges=130.211.0.0/22,35.191.0.0/16 --target-tags=lab72-web
```

A global external Application Load Balancer sends requests to instance groups from `130.211.0.0/22` and `35.191.0.0/16`. Health check probes come from `35.191.0.0/16`, and the autohealing docs list both ranges.

10. Create an instance template that runs the same app on port 80, so that the MIG can create identical VMs.

```bash
gcloud compute instance-templates create lab72-template \
  --instance-template-region="$REGION" \
  --region="$REGION" --subnet=lab72-subnet --no-address \
  --machine-type=e2-micro \
  --image-family=debian-12 --image-project=debian-cloud \
  --tags=lab72-web --no-service-account --no-scopes \
  --metadata-from-file=startup-script=labs/72-load-test-failure-drill/startup.sh,app-code=labs/72-load-test-failure-drill/app/main.py
```

The startup script reads the app from the `app-code` metadata value. The VMs need no internet access.

11. Create two health checks, because Google recommends separate checks: the load balancer check only moves traffic away from a VM, but the autohealing check recreates the VM, so it must be more conservative.

```bash
gcloud compute health-checks create http lab72-lb-hc --global \
  --port=80 --request-path=/healthz \
  --check-interval=5s --timeout=5s --healthy-threshold=2 --unhealthy-threshold=2
gcloud compute health-checks create http lab72-autoheal-hc --global \
  --port=80 --request-path=/healthz \
  --check-interval=10s --timeout=5s --healthy-threshold=2 --unhealthy-threshold=3
```

12. Create a regional MIG with three VMs, so that each zone runs one VM.

```bash
gcloud compute instance-groups managed create lab72-mig \
  --region="$REGION" --size=3 \
  --template="projects/${PROJECT_ID}/regions/${REGION}/instanceTemplates/lab72-template" \
  --base-instance-name=lab72-web \
  --health-check="projects/${PROJECT_ID}/global/healthChecks/lab72-autoheal-hc" \
  --initial-delay=90
gcloud compute instance-groups managed set-named-ports lab72-mig \
  --region="$REGION" --named-ports=http:80
```

13. Create a global external Application Load Balancer in front of the MIG, so that users have one IP address and failed VMs get no traffic.

```bash
gcloud compute backend-services create lab72-bs --global \
  --load-balancing-scheme=EXTERNAL_MANAGED --protocol=HTTP \
  --port-name=http --health-checks=lab72-lb-hc
gcloud compute backend-services add-backend lab72-bs --global \
  --instance-group=lab72-mig --instance-group-region="$REGION"
gcloud compute url-maps create lab72-urlmap --global --default-service=lab72-bs
gcloud compute target-http-proxies create lab72-proxy --global --url-map=lab72-urlmap
gcloud compute forwarding-rules create lab72-fr --global \
  --load-balancing-scheme=EXTERNAL_MANAGED --network-tier=PREMIUM \
  --target-http-proxy=lab72-proxy --ports=80
export LB_IP="$(gcloud compute forwarding-rules describe lab72-fr --global --format='value(IPAddress)')"
echo "$LB_IP"
```

14. Wait until the MIG is stable and the load balancer answers, because the VMs and the load balancer need some minutes before they serve traffic.

```bash
gcloud compute instance-groups managed wait-until lab72-mig --stable --region="$REGION"
for i in $(seq 1 45); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://${LB_IP}/healthz")"
  echo "$(date +%T) HTTP ${CODE}"
  [ "$CODE" = "200" ] && break
  sleep 20
done
curl -s "http://${LB_IP}/work?ms=10"
```

15. Write the drill plan before you inject a failure, because a drill tests a hypothesis and needs an abort condition.

```bash
cat > /tmp/lab72-drill-plan.txt <<'EOF'
Steady state: ok% is 100 and p95ms is below 500 with 8 workers.
Hypothesis:   when one of the three VMs fails, ok% stays at 99 or more,
              and the MIG runs three healthy VMs again within 10 minutes.
Blast radius: one VM of lab72-mig, in the lab project only.
Abort:        ok% below 90 in two intervals in a row. Stop and investigate.
EOF
cat /tmp/lab72-drill-plan.txt
```

16. Start the load in the background and record the steady state for about one minute.

```bash
python3 labs/72-load-test-failure-drill/loadgen.py --url "http://${LB_IP}/work?ms=50" \
  --workers 8 --duration 540 --by host > /tmp/lab72-drill.log 2>&1 &
LOADGEN_PID=$!
sleep 70
cat /tmp/lab72-drill.log
```

The `hosts=` list shows which VMs answered. At low request rates, the load balancer can prefer the VMs in one zone, so one VM can get most of the traffic.

17. Inject the failure: delete the VM that served the most requests, directly with the `instances` API, as a crash or an operator error would remove it.

```bash
VM="$(tail -n 1 /tmp/lab72-drill.log | grep -o 'hosts=[^ ]*' | cut -d= -f2 | tr ',' '\n' \
  | sort -t: -k2 -nr | head -n 1 | cut -d: -f1)"
VM_ZONE="$(gcloud compute instances list --filter="name=${VM}" --format='value(zone.basename())')"
echo "Deleting ${VM} in ${VM_ZONE} at $(date +%T)"
gcloud compute instances delete "$VM" --zone="$VM_ZONE" --quiet
```

18. Watch the MIG repair the VM, because the MIG did not start this deletion.

```bash
for i in $(seq 1 10); do
  date +%T
  gcloud compute instance-groups managed list-instances lab72-mig --region="$REGION"
  sleep 30
done
gcloud compute backend-services get-health lab72-bs --global
```

Expected result: the MIG creates a VM with the same name. `ACTION` goes through `CREATING` and `VERIFYING` to `NONE`, and `HEALTH_STATE` becomes `HEALTHY`. In `get-health`, all three VMs are `HEALTHY` at the end.

19. Wait for the load generator to finish, then compare the client view with your hypothesis.

```bash
wait "$LOADGEN_PID"
cat /tmp/lab72-drill.log
```

Expected result: near the deletion time, you see few errors or none. The load balancer sends new requests to the healthy VMs. It also retries a failed `GET` request once when the result is HTTP 502, 503, or 504. The deleted host leaves the `hosts=` list, and it comes back after the MIG recreates it and it passes the health check. Write down whether the result supports the hypothesis, and the time that the MIG needed to recover.

### Part 3: Inject faults at the load balancer and retry with backoff

20. Validate and apply a URL map with a fault injection policy: 20% of requests get HTTP `429`, and 10% of requests wait 1 extra second. Validation checks the file without a change to the load balancer.

```bash
cat labs/72-load-test-failure-drill/urlmap-fault.yaml
sed "s/PROJECT_ID/${PROJECT_ID}/g" labs/72-load-test-failure-drill/urlmap-fault.yaml \
  > /tmp/lab72-urlmap-fault.yaml
gcloud compute url-maps validate --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --source=/tmp/lab72-urlmap-fault.yaml
gcloud compute url-maps import lab72-urlmap --global \
  --source=/tmp/lab72-urlmap-fault.yaml --quiet
```

21. Run the same load without retries, then with 3 retries, and compare the two summaries. The change can take a short time to reach the load balancer. If the first run shows no `429` answers, run it again.

```bash
python3 labs/72-load-test-failure-drill/loadgen.py --url "http://${LB_IP}/work?ms=50" \
  --workers 8 --duration 60
python3 labs/72-load-test-failure-drill/loadgen.py --url "http://${LB_IP}/work?ms=50" \
  --workers 8 --duration 60 --retries 3
```

Expected result: without retries, `ok%` is about 80 and `p95ms` is more than 1000 (the injected delay). With retries, `ok%` is close to 100, and `att/req` is about 1.25: the service receives about 25% more requests. The retries do not remove the extra delay, and the backoff waits add latency.

22. Remove the faults, because a fault injection policy stays active until you remove it.

```bash
sed "s/PROJECT_ID/${PROJECT_ID}/g" labs/72-load-test-failure-drill/urlmap-clean.yaml \
  > /tmp/lab72-urlmap-clean.yaml
gcloud compute url-maps import lab72-urlmap --global \
  --source=/tmp/lab72-urlmap-clean.yaml --quiet
```

## Check your work

```bash
gcloud run services describe lab72-api --region="$REGION" --format='value(status.url)'
gcloud compute instance-groups managed list-instances lab72-mig --region="$REGION"
gcloud compute backend-services get-health lab72-bs --global
gcloud compute url-maps describe lab72-urlmap --global --format='yaml(defaultService,pathMatchers)'
tail -n 3 /tmp/lab72-drill.log
```

Expected results:

- The Cloud Run service has a `run.app` URL.
- `list-instances` shows three `RUNNING` VMs in three zones, all `HEALTHY`. One VM has the name of the VM that you deleted.
- `get-health` shows three backends with `healthState: HEALTHY`.
- The URL map has a `defaultService` and no `pathMatchers`, so no faults remain.
- The drill summary shows an `ok%` near 100.

## Explore

1. In step 7, the load generator reports many `429` answers. The Cloud Run request count chart shows far fewer failed requests. Why, and what does this mean for your load tests?

   <details><summary>Answer</summary>

   The `run.googleapis.com/request_count` metric excludes requests that do not reach a container instance, for example when the service is at its maximum number of instances. The request latency metric starts when the request reaches the running container, so it does not show the time before that point, such as container startup. Server-side metrics can make an overload look healthy. Google's load testing best practices tell you to check performance as the client experiences it, and to export logs to BigQuery for second-by-second analysis. See [Google Cloud metrics: P through Z](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z) and [Load testing best practices](https://docs.cloud.google.com/run/docs/about-load-testing).

   </details>

2. In step 17, you deleted the VM with `gcloud compute instances delete`, and the MIG recreated it. What happens if you use `gcloud compute instance-groups managed delete-instances` instead?

   <details><summary>Answer</summary>

   The MIG repairs a VM that fails or that an action outside the MIG deletes. It does not repair a VM that it removes on purpose. `delete-instances` reduces the target size of the group, so the MIG does not create a replacement VM. A drill that uses `delete-instances` tests nothing about repair. See [About repairing VMs for high availability](https://docs.cloud.google.com/compute/docs/instance-groups/about-repair) and [Add and remove VMs from a MIG](https://docs.cloud.google.com/compute/docs/instance-groups/add-remove-vms-in-mig).

   </details>

3. A regulator asks the company to prove that the web tier and the Cloud SQL database survive a zone failure. What do you recommend?

   <details><summary>Answer</summary>

   Run the drill first in a staging environment that copies production. If you test in production, prepare monitoring and a manual rollback, and tell the stakeholders. Size the regional MIG so that two zones can carry all the traffic: Google recommends at least 150% of the needed VMs across three zones. Fault Injection Testing (Preview) has faults that fail Compute Engine or GKE resources and fail over an HA Cloud SQL instance, limited to one project and one region. For the database tier, also see lab 21. See [Perform testing for recovery from failures](https://docs.cloud.google.com/architecture/framework/reliability/perform-testing-for-recovery-from-failures), [About regional MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/regional-migs), and [Fault Injection Testing overview](https://docs.cloud.google.com/fault-injection-testing/overview).

   </details>

4. In part 3, retries raised the success rate. When do retries make an outage worse, and how do you prevent it?

   <details><summary>Answer</summary>

   When a backend fails because of overload, retries add more load. The retry volume can grow until the backend crashes, and the crash moves its load to the other backends. The SRE book recommends randomized exponential backoff, a limit on retries for each request, a retry budget for each server, and retries at one layer only: three retries at each of three layers can turn one user action into 64 attempts. Servers must return a clear status for overload, so that clients back off. See [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).

   </details>

## Clean up

```bash
bash labs/72-load-test-failure-drill/teardown.sh
```

The script deletes these resources:

- The forwarding rule `lab72-fr`, the target proxy `lab72-proxy`, the URL map `lab72-urlmap`, and the backend service `lab72-bs`.
- The MIG `lab72-mig` and its VMs.
- The instance template `lab72-template` and the health checks `lab72-lb-hc` and `lab72-autoheal-hc`.
- The firewall rule `lab72-allow-lb`, the subnet `lab72-subnet`, and the VPC network `lab72-vpc`.
- The Cloud Run service `lab72-api` and its image in the `cloud-run-source-deploy` repository.
- The temporary files `/tmp/lab72-*`.

The script keeps the `roles/run.builder` binding, the `cloud-run-source-deploy` repository, and the Cloud Build source bucket, because other labs use them. They cost nothing or almost nothing when idle.

## Docs used

- [Load testing best practices (Cloud Run)](https://docs.cloud.google.com/run/docs/about-load-testing)
- [About instance autoscaling in Cloud Run services](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
- [Set maximum instances for services](https://docs.cloud.google.com/run/docs/configuring/max-instances)
- [Maximum concurrent requests for services](https://docs.cloud.google.com/run/docs/about-concurrency)
- [Allowing public (unauthenticated) access](https://docs.cloud.google.com/run/docs/authenticating/public)
- [Google Cloud metrics: P through Z](https://docs.cloud.google.com/monitoring/api/metrics_gcp_p_z)
- [PromQL for Cloud Monitoring](https://docs.cloud.google.com/monitoring/promql)
- [Query using the Prometheus API or UI](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus/query-api-ui)
- [About regional MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/regional-migs)
- [About repairing VMs for high availability](https://docs.cloud.google.com/compute/docs/instance-groups/about-repair)
- [Set up an application-based health check and autohealing](https://docs.cloud.google.com/compute/docs/instance-groups/autohealing-instances-in-migs)
- [Add and remove VMs from a MIG](https://docs.cloud.google.com/compute/docs/instance-groups/add-remove-vms-in-mig)
- [Set up a global external Application Load Balancer with VM instance group backends](https://docs.cloud.google.com/load-balancing/docs/https/setup-global-ext-https-compute)
- [External Application Load Balancer overview](https://docs.cloud.google.com/load-balancing/docs/https)
- [Health checks overview](https://docs.cloud.google.com/load-balancing/docs/health-check-concepts)
- [Request distribution for external Application Load Balancers](https://docs.cloud.google.com/load-balancing/docs/https/request-distribution)
- [Traffic management overview for global external Application Load Balancers](https://docs.cloud.google.com/load-balancing/docs/https/traffic-management-global)
- [Set up traffic management for global external Application Load Balancers](https://docs.cloud.google.com/load-balancing/docs/https/setting-up-global-traffic-mgmt)
- [Perform testing for recovery from failures](https://docs.cloud.google.com/architecture/framework/reliability/perform-testing-for-recovery-from-failures)
- [Fault Injection Testing overview](https://docs.cloud.google.com/fault-injection-testing/overview)
- [Addressing Cascading Failures (SRE book)](https://sre.google/sre-book/addressing-cascading-failures/)
- [Network pricing](https://cloud.google.com/vpc/network-pricing), [Cloud Run pricing](https://cloud.google.com/run/pricing), [Cloud Build pricing](https://cloud.google.com/build/pricing), and [Free Google Cloud features](https://docs.cloud.google.com/free/docs/free-cloud-features)
