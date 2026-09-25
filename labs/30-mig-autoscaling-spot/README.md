---
id: 30-mig-autoscaling-spot
title: Regional MIG with autohealing, autoscaling, rolling updates, and Spot VMs
objectives: ["2.3", "1.3"]
minutes: 90
cost: "Less than $0.15 for a 90-minute run: 3 to 7 e2-micro VMs (about $0.0084 per VM-hour in us-central1) with 10 GB standard persistent disk boot disks (the default disk type for E2). Run teardown.sh when done."
requiresOrg: false
---

## Goal

Build a regional managed instance group (MIG) that heals itself, updates without capacity loss, and scales on CPU use. Then compare a Spot VM template with a standard template and simulate a Spot preemption.

## Exam relevance

- Regional and zonal MIGs, autohealing health checks, autoscaling signals, and rolling update settings (`maxSurge`, `maxUnavailable`): [Configuring Compute Engine for resilience and operations](note:2.3-compute-engine-ops).
- Spot VMs and standard VMs, the termination action, and small machine types: [Choosing compute resources](note:1.3-compute-resources).
- When a MIG of VMs is the right platform, and when GKE or Cloud Run is better: [Mapping workloads to compute platforms](note:1.3-compute-choice).
- SSH with no external IP through IAP TCP forwarding and OS Login: [Secure remote and workload access](note:3.1-secure-access).
- Health checks for load balancers compared with health checks for autohealing: [Choosing a load balancer](note:1.3-load-balancing).

## Before you start

- Complete `labs/00-setup` once. Run all commands from the repository root.
- IAM: you need Owner on the lab project. The IAP docs state that you have the permissions you need in a project that you created.
- Tools: the gcloud CLI and an SSH client. `gcloud compute ssh` creates an SSH key the first time you use it.
- Quota: at the peak, the lab runs 7 e2-micro VMs in `$REGION`.
- Time: about 90 minutes. Most of the time is waiting for VMs, health checks, and the autoscaler.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com
```

## Steps

1. Create a custom-mode VPC network and a subnet, so that the lab does not depend on the default network.

```bash
gcloud compute networks create lab30-vpc --subnet-mode=custom
gcloud compute networks subnets create lab30-subnet \
    --network=lab30-vpc --region=$REGION --range=10.30.0.0/24
```

2. Allow health-check probes and IAP SSH, because a blocked probe makes the MIG recreate healthy VMs.

```bash
gcloud compute firewall-rules create lab30-allow-health-checks \
    --network=lab30-vpc --direction=INGRESS --action=allow --rules=tcp:80 \
    --source-ranges=130.211.0.0/22,35.191.0.0/16 --target-tags=lab30-web
gcloud compute firewall-rules create lab30-allow-iap-ssh \
    --network=lab30-vpc --direction=INGRESS --action=allow --rules=tcp:22 \
    --source-ranges=35.235.240.0/20 --target-tags=lab30-web
```

Health-check probes come from `130.211.0.0/22` and `35.191.0.0/16`. IAP TCP forwarding uses `35.235.240.0/20`. No rule opens SSH to the internet.

3. Read the startup script, because every VM in a MIG must configure itself when it boots.

```bash
cat labs/30-mig-autoscaling-spot/startup.sh
```

Compute Engine runs the `startup-script` metadata value as `root` at each boot. The script reads the `app-version` metadata value. The v1 and v2 templates differ only in that value.

4. Create the v1 template as a regional template, which Google recommends unless you reuse templates across regions.

```bash
gcloud compute instance-templates create lab30-template-v1 \
    --instance-template-region=$REGION \
    --region=$REGION --subnet=lab30-subnet --no-address \
    --machine-type=e2-micro \
    --image-family=debian-12 --image-project=debian-cloud \
    --tags=lab30-web \
    --no-service-account --no-scopes \
    --metadata=enable-oslogin=TRUE,app-version=v1 \
    --metadata-from-file=startup-script=labs/30-mig-autoscaling-spot/startup.sh
```

- `--no-address`: the VMs get no external IP address.
- `--no-service-account --no-scopes`: the VMs get no Google Cloud identity, because the app calls no Google APIs.
- `enable-oslogin=TRUE`: SSH access uses IAM roles instead of SSH keys in metadata.
- You cannot change a template after you create it. A new version needs a new template (step 10).

5. Create a conservative health check for autohealing, so that a short failure does not make the MIG recreate a VM.

```bash
gcloud compute health-checks create http lab30-hc \
    --global --port=80 --request-path=/ \
    --check-interval=10s --timeout=5s \
    --healthy-threshold=2 --unhealthy-threshold=3
```

Google recommends an autohealing health check that is more conservative than a load-balancing health check. With these values, a VM becomes `UNHEALTHY` after 3 failed checks in a row. This takes about 30 seconds.

6. Create the regional MIG with autohealing, so that it spreads VMs across zones and repairs failed VMs.

```bash
gcloud compute instance-groups managed create lab30-mig \
    --region=$REGION --size=3 \
    --template=projects/$PROJECT_ID/regions/$REGION/instanceTemplates/lab30-template-v1 \
    --base-instance-name=lab30-web \
    --health-check=projects/$PROJECT_ID/global/healthChecks/lab30-hc \
    --initial-delay=120
```

By default, a regional MIG uses three zones and an `EVEN` target distribution shape. During the 120-second initial delay, the MIG ignores failed health checks while the startup script runs. The default initial delay is 0 seconds.

7. Wait until the group is stable, which means that every VM runs and no action is in progress.

```bash
gcloud compute instance-groups managed wait-until lab30-mig --stable --region=$REGION
gcloud compute instance-groups managed list-instances lab30-mig --region=$REGION
gcloud compute instance-groups managed describe lab30-mig --region=$REGION \
    --format="yaml(distributionPolicy,autoHealingPolicies)"
```

You see three VMs in three different zones. `HEALTH_STATE` can show `UNKNOWN` for some minutes, because health monitoring of new VMs can take up to 10 minutes to start.

8. Call the app from inside one VM, because you can reach the VMs only through IAP.

```bash
VM=$(gcloud compute instances list --filter="name~^lab30-web" --limit=1 --format="value(name)")
VM_ZONE=$(gcloud compute instances list --filter="name=$VM" --format="value(zone.basename())")
gcloud compute ssh "$VM" --zone="$VM_ZONE" --tunnel-through-iap --command="curl -s localhost"
```

Expected output: `app-version=v1 vm=lab30-web-xxxx zone=...`. The first `gcloud compute ssh` asks for an SSH key passphrase. You can press Enter.

9. Stop the web server on that VM, so that you see autohealing repair a failed app on a running VM.

```bash
gcloud compute ssh "$VM" --zone="$VM_ZONE" --tunnel-through-iap \
    --command="sudo systemctl stop lab30-web"
for i in $(seq 1 8); do
  gcloud compute instance-groups managed list-instances lab30-mig --region=$REGION
  sleep 30
done
gcloud compute operations list --filter="operationType~compute.instances.repair.*"
```

The VM changes to `UNHEALTHY`, then `ACTION` shows `RECREATING`, then the VM is `HEALTHY` again with the same name. The operations list shows a repair operation.

10. Create the v2 template, because a new app version needs a new template.

```bash
gcloud compute instance-templates create lab30-template-v2 \
    --instance-template-region=$REGION \
    --region=$REGION --subnet=lab30-subnet --no-address \
    --machine-type=e2-micro \
    --image-family=debian-12 --image-project=debian-cloud \
    --tags=lab30-web \
    --no-service-account --no-scopes \
    --metadata=enable-oslogin=TRUE,app-version=v2 \
    --metadata-from-file=startup-script=labs/30-mig-autoscaling-spot/startup.sh
```

11. Roll out v2 with `--max-unavailable=0`, so that the MIG creates each new VM before it deletes an old VM.

```bash
gcloud compute instance-groups managed rolling-action start-update lab30-mig \
    --region=$REGION \
    --version=template=projects/$PROJECT_ID/regions/$REGION/instanceTemplates/lab30-template-v2 \
    --max-surge=3 --max-unavailable=0
gcloud compute instance-groups managed wait-until lab30-mig --version-target-reached --region=$REGION
gcloud compute instance-groups managed wait-until lab30-mig --stable --region=$REGION
gcloud compute instance-groups managed list-instances lab30-mig --region=$REGION
```

For a regional MIG, a fixed `maxSurge` or `maxUnavailable` value must be 0 or at least the number of zones. This group has three zones, so 3 is the smallest surge that works. After the update, every VM uses `lab30-template-v2` and has a new name.

12. Turn on CPU autoscaling, so that the group adds VMs when average CPU use is above the target.

```bash
gcloud compute instance-groups managed set-autoscaling lab30-mig \
    --region=$REGION \
    --min-num-replicas=3 --max-num-replicas=6 \
    --target-cpu-utilization=0.5 \
    --cool-down-period=60 \
    --stabilization-period=300
```

- `--cool-down-period` sets the initialization period (default 60 seconds). For scale-out decisions, the autoscaler ignores data from VMs that are still in this period.
- `--stabilization-period` controls scale-in only. The default is 10 minutes. This lab uses 5 minutes so that you see scale-in sooner.

13. Put CPU load on every VM, so that average CPU use goes far above the 50% target.

```bash
gcloud compute instances list --filter="name~^lab30-web" \
    --format="value(name,zone.basename())" |
while read -r NAME VM_ZONE; do
  gcloud compute ssh "$NAME" --zone="$VM_ZONE" --tunnel-through-iap \
      --command="for i in 1 2; do nohup nice -n 19 timeout 480 yes > /dev/null 2>&1 & done" < /dev/null
done
```

Each VM runs two low-priority `yes` processes for 8 minutes. Then the processes stop. An `e2-micro` VM sustains only 25% of CPU time. The CPU utilization metric measures use of the allocated CPU. On machine types that can burst, the metric can go above 100%.

14. Watch the target size change, because the CPU metric arrives some minutes after the load starts.

```bash
for i in $(seq 1 20); do
  gcloud compute instance-groups managed describe lab30-mig --region=$REGION \
      --format="table(targetSize,autoscaler.recommendedSize)"
  sleep 60
done
```

The loop runs for about 20 minutes. Compute Engine samples the CPU metric every 60 seconds, and the data can take up to 240 seconds to appear. Within some minutes, the target size goes up to 6. After the load stops and the stabilization period ends, the target size goes back to 3.

15. Create a Spot template and compare it with the v2 template, because only the provisioning model changes.

```bash
gcloud compute instance-templates create lab30-template-spot \
    --instance-template-region=$REGION \
    --region=$REGION --subnet=lab30-subnet --no-address \
    --machine-type=e2-micro \
    --image-family=debian-12 --image-project=debian-cloud \
    --tags=lab30-web \
    --no-service-account --no-scopes \
    --provisioning-model=SPOT --instance-termination-action=STOP \
    --metadata=enable-oslogin=TRUE,app-version=spot \
    --metadata-from-file=startup-script=labs/30-mig-autoscaling-spot/startup.sh
for T in lab30-template-v2 lab30-template-spot; do
  echo "== $T"
  gcloud compute instance-templates describe "$T" --region=$REGION \
      --format="yaml(properties.scheduling)"
done
```

The Spot template shows `provisioningModel: SPOT` and `instanceTerminationAction: STOP`. If the termination action is missing, the default is `STOP`.

16. Create one VM from the Spot template and simulate a preemption, so that you see the termination action happen.

```bash
gcloud compute instances create lab30-spot-vm --zone=$ZONE \
    --source-instance-template=projects/$PROJECT_ID/regions/$REGION/instanceTemplates/lab30-template-spot
gcloud compute instances simulate-maintenance-event lab30-spot-vm --zone=$ZONE
sleep 60
gcloud compute instances describe lab30-spot-vm --zone=$ZONE --format="value(status)"
gcloud compute operations list --filter="operationType=compute.instances.preempted"
```

The VM status changes to `TERMINATED`, because the termination action is `STOP`. You do not pay for VM hours while a preempted VM is `TERMINATED`, but its disk still costs money. The preemption operation can take a minute to appear in the list.

## Check your work

```bash
gcloud compute instance-groups managed list-instances lab30-mig --region=$REGION
gcloud compute instance-groups managed describe lab30-mig --region=$REGION \
    --format="yaml(targetSize,autoscaler.autoscalingPolicy)"
gcloud compute operations list --filter="operationType~compute.instances.repair.*"
gcloud compute instances describe lab30-spot-vm --zone=$ZONE \
    --format="yaml(status,scheduling.provisioningModel,scheduling.instanceTerminationAction)"
```

Expected results:

- `list-instances`: 3 to 6 VMs in three zones. Each VM uses `lab30-template-v2` and is `HEALTHY`.
- `describe`: the autoscaling policy has `minNumReplicas: 3`, `maxNumReplicas: 6`, and a CPU utilization target of `0.5`.
- `operations list`: at least one `compute.instances.repair` operation from step 9.
- The Spot VM: `status: TERMINATED`, `provisioningModel: SPOT`, and `instanceTerminationAction: STOP`.

## Explore

1. A colleague runs the rolling update with `--max-surge=1` to save money. What happens with this regional MIG?

   <details><summary>Answer</summary>

   The request fails. For a regional MIG, a fixed `maxSurge` or `maxUnavailable` value must be 0 or equal to or greater than the number of zones. The Updater must create an additional VM in each zone. With three zones, the smallest non-zero value is 3. You can use a percentage only when the group has 10 or more VMs. See [Automatically apply VM configuration updates in a MIG](https://docs.cloud.google.com/compute/docs/instance-groups/rolling-out-updates-to-managed-instance-groups).

   </details>

2. You later put this MIG behind a load balancer. Do you reuse `lab30-hc` for the load balancer?

   <details><summary>Answer</summary>

   No. Google recommends separate health checks. A load-balancing health check detects unresponsive VMs and sends traffic away from them. An autohealing health check recreates VMs, so it must be more conservative. An aggressive autohealing check can mistake busy VMs for failed VMs and reduce availability. See [Set up an application-based health check and autohealing](https://docs.cloud.google.com/compute/docs/instance-groups/autohealing-instances-in-migs).

   </details>

3. The templates use `--image-family=debian-12`. Next month, autohealing recreates one VM. Which image does the new VM use, and why can that be a problem?

   <details><summary>Answer</summary>

   When a template points to an image family, the MIG creates VMs from the latest image in the family. This includes VMs that the autoscaler adds and VMs that autohealing recreates. The group can then run a mix of image versions. Google recommends custom image families: you add an image only after you test it with your app. For full control, point the template to a specific image. Roll out a new template for each new image. See [Performing one-click OS image upgrades in MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/upgrading-images-in-migs).

   </details>

4. The finance team asks you to run this web tier on Spot VMs only. What do you recommend?

   <details><summary>Answer</summary>

   Compute Engine can preempt Spot VMs at any time, and the shutdown period is best effort and up to 30 seconds. A MIG recreates preempted Spot VMs only when capacity is available again. Spot VMs fit fault-tolerant work such as batch jobs. For a serving tier, keep a base of standard VMs. The Spot docs suggest that you can combine standard VMs and Spot VMs so that work continues at an adequate pace. See [Spot VMs](https://docs.cloud.google.com/compute/docs/instances/spot) and [Create and use Spot VMs](https://docs.cloud.google.com/compute/docs/instances/create-use-spot).

   </details>

## Clean up

```bash
bash labs/30-mig-autoscaling-spot/teardown.sh
```

The script deletes these resources:

- The Spot VM `lab30-spot-vm`.
- The MIG `lab30-mig`, with its autoscaler and its VMs.
- The instance templates `lab30-template-v1`, `lab30-template-v2`, and `lab30-template-spot`.
- The health check `lab30-hc`.
- The firewall rules `lab30-allow-health-checks` and `lab30-allow-iap-ssh`.
- The subnet `lab30-subnet` and the VPC network `lab30-vpc`.

## Docs used

- [About regional MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/regional-migs)
- [Instance templates](https://docs.cloud.google.com/compute/docs/instance-templates)
- [Create instance templates](https://docs.cloud.google.com/compute/docs/instance-templates/create-instance-templates)
- [Set up an application-based health check and autohealing](https://docs.cloud.google.com/compute/docs/instance-groups/autohealing-instances-in-migs)
- [Autoscaling groups of instances](https://docs.cloud.google.com/compute/docs/autoscaler)
- [Scaling based on CPU utilization](https://docs.cloud.google.com/compute/docs/autoscaler/scaling-cpu)
- [Automatically apply VM configuration updates in a MIG](https://docs.cloud.google.com/compute/docs/instance-groups/rolling-out-updates-to-managed-instance-groups)
- [Performing one-click OS image upgrades in MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/upgrading-images-in-migs)
- [Spot VMs](https://docs.cloud.google.com/compute/docs/instances/spot)
- [Create and use Spot VMs](https://docs.cloud.google.com/compute/docs/instances/create-use-spot)
- [Simulate a host maintenance event](https://docs.cloud.google.com/compute/docs/instances/simulating-host-maintenance)
- [Use startup scripts on Linux VMs](https://docs.cloud.google.com/compute/docs/instances/startup-scripts/linux)
- [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [Set up OS Login](https://docs.cloud.google.com/compute/docs/oslogin/set-up-oslogin)
- [General-purpose machine family: shared-core VMs](https://docs.cloud.google.com/compute/docs/general-purpose-machines)
- [Google Cloud metrics: compute (instance/cpu/utilization)](https://docs.cloud.google.com/monitoring/api/metrics_gcp_c)
- [General-purpose VM pricing](https://cloud.google.com/products/compute/pricing/general-purpose) and [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
- [Free Google Cloud features (Compute Engine Free Tier)](https://docs.cloud.google.com/free/docs/free-cloud-features)
