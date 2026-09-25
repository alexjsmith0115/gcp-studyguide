---
id: 33-vm-manager-patching
title: Patch and inventory VMs with VM Manager
objectives: ["2.3"]
minutes: 75
cost: "Less than $0.15 for a 90-minute run: two e2-micro VMs (about $0.0084 per VM-hour each in us-central1) with 10 GB standard persistent disk boot disks (the default disk type for E2), and one Cloud NAT gateway ($0.0014 per VM-hour, $0.005 per NAT IP-hour, and $0.045 per GiB of patch downloads). VM Manager is free for up to 100 VMs per billing account each month. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Turn on VM Manager for two private VMs and read their OS inventory. Patch the `dev` VM with a patch job. Schedule weekly patching for the `prod` VM. Keep a package installed with an OS policy.

## Exam relevance

- Patch management, OS inventory, and OS policies for VM fleets (the "patch management" part of objective 2.3): [Configuring Compute Engine for resilience and operations](note:2.3-compute-engine-ops).
- Private VMs that still reach Google APIs and package repositories through Private Google Access and Cloud NAT: [Access to Google APIs, the internet, and cloud-adjacent services](note:2.1-vpc-access-patterns).
- Least privilege for patching, because the role that runs patch jobs can change software on VMs: [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- VMs in a MIG get new images through a rolling update, not in-place patches: [Regional MIG lab](lab:30-mig-autoscaling-spot).

## Before you start

- Complete `labs/00-setup` once. Run all commands from the repository root.
- IAM: you need Owner on the lab project. Project owners have full access to run and manage patch jobs.
- Tools: the gcloud CLI. You do not need SSH in this lab.
- Time: about 75 minutes. The OS Config agent reports inventory about every 10 minutes, so some steps include a wait.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com osconfig.googleapis.com
```

## Steps

1. Create a VPC network and a subnet with Private Google Access, so that private VMs reach the OS Config API.

```bash
gcloud compute networks create lab33-vpc --subnet-mode=custom
gcloud compute networks subnets create lab33-subnet \
    --network=lab33-vpc --region=$REGION --range=10.33.0.0/24 \
    --enable-private-ip-google-access
```

2. Create a Cloud Router and Cloud NAT, because Debian VMs download patches from the Debian CDN on the internet.

```bash
gcloud compute routers create lab33-router --network=lab33-vpc --region=$REGION
gcloud compute routers nats create lab33-nat \
    --router=lab33-router --region=$REGION \
    --nat-all-subnet-ip-ranges --auto-allocate-nat-external-ips
```

The Patch service does not host patches. VMs must reach their package repositories. For full control of the patch baseline, Google recommends your own local repository (or Windows Server Update Services). Cloud NAT or a proxy is the alternative. Traffic from these VMs to Google APIs does not go through NAT: Private Google Access handles it.

3. Create a service account with no roles, because VM Manager only uses it to sign API requests.

```bash
gcloud iam service-accounts create lab33-vm-sa \
    --display-name="Lab 33 VM identity with no roles"
```

The VM Manager setup docs state that each VM needs an attached service account, and that the account needs no IAM roles.

4. Create a `dev` VM and a `prod` VM with `enable-osconfig=TRUE`, which activates the preinstalled OS Config agent.

```bash
for ENV in dev prod; do
  gcloud compute instances create lab33-$ENV-vm \
      --zone=$ZONE --machine-type=e2-micro \
      --subnet=lab33-subnet --no-address \
      --image-family=debian-12 --image-project=debian-cloud \
      --service-account=lab33-vm-sa@$PROJECT_ID.iam.gserviceaccount.com \
      --scopes=cloud-platform \
      --labels=env=$ENV \
      --metadata=enable-osconfig=TRUE
done
```

If the command reports that the service account does not exist, wait one minute and run the loop again. IAM changes can take a short time to apply.

5. Check the VM Manager settings on the `dev` VM and on the subnet, because VM Manager needs all of them.

```bash
gcloud compute instances describe lab33-dev-vm --zone=$ZONE \
    --format="yaml(metadata.items,serviceAccounts)"
gcloud compute networks subnets describe lab33-subnet --region=$REGION \
    --format="value(privateIpGoogleAccess)"
```

The VM has the metadata key `enable-osconfig` with the value `TRUE`, and the service account `lab33-vm-sa`. The subnet command prints `True`. The VM Manager setup docs list these three items for a VM with no public internet access. The `gcloud compute os-config troubleshoot` command also checks a VM. In gcloud 576.0.0, its network check reports `No` for every VM with no external IP, even when the subnet has Private Google Access.

6. Wait about 10 minutes after the VMs start, then read the OS inventory, the data source for patch compliance.

```bash
gcloud compute os-config inventories list --location=$ZONE
gcloud compute os-config inventories describe lab33-dev-vm --location=$ZONE
gcloud compute os-config inventories describe lab33-dev-vm --location=$ZONE --view=full \
    | grep -A 30 "Package Updates Available"
```

The list shows both VMs with their OS and agent version. The `basic` view shows the OS details, and the `full` view adds packages. The last command prints the available updates. It prints nothing if the VM has no updates. The list can be short or empty. On Debian images, the `unattended-upgrades` package also installs Debian security updates daily.

7. Run a dry-run patch job on both VMs, so that you test the filter and the agents safely.

```bash
DRY_RUN_ID=$(gcloud compute os-config patch-jobs execute \
    --instance-filter-name-prefixes=lab33- \
    --display-name=lab33-dry-run --dry-run \
    --format="value(name.basename())")
gcloud compute os-config patch-jobs list-instance-details "$DRY_RUN_ID"
```

In a dry run, the service contacts the agents, but the agents install no updates. Both VMs show `SUCCEEDED`. A VM with `NO_AGENT_DETECTED` has a setup problem. Check its settings as in step 5.

8. Patch only the VMs with the label `env=dev`, so that you test patches on a small group before production.

```bash
PATCH_ID=$(gcloud compute os-config patch-jobs execute \
    --instance-filter-group-labels=env=dev \
    --display-name=lab33-patch-dev \
    --reboot-config=default --duration=45m \
    --rollout-mode=zone-by-zone --rollout-disruption-budget=1 \
    --format="value(name.basename())")
gcloud compute os-config patch-jobs describe "$PATCH_ID" \
    --format="yaml(state,instanceDetailsSummary,percentComplete)"
gcloud compute os-config patch-jobs list-instance-details "$PATCH_ID"
```

- The command waits until the job ends. The job state is `SUCCEEDED`, and only `lab33-dev-vm` is in the details list.
- `--reboot-config=default`: the agent decides if a reboot is necessary.
- `--duration=45m`: the maintenance window. No new patch step starts after 45 minutes.
- `--rollout-mode=zone-by-zone --rollout-disruption-budget=1`: the job patches one zone at a time and disrupts at most one VM in each zone at a time.

9. Create a weekly patch deployment for `env=prod` VMs, because production patching must run in a fixed maintenance window.

```bash
cat labs/33-vm-manager-patching/patch-deployment.yaml
gcloud compute os-config patch-deployments create lab33-weekly-prod \
    --file=labs/33-vm-manager-patching/patch-deployment.yaml
gcloud compute os-config patch-deployments list
gcloud compute os-config patch-deployments describe lab33-weekly-prod \
    --format="yaml(recurringSchedule,rollout,state)"
```

The deployment runs every Sunday at 03:00 UTC and shows its next run time. The service resolves the instance filter each time a job starts. So the next job also patches a new VM with the label `env=prod`.

10. Create an OS policy assignment that keeps the `tree` package installed, because an OS policy enforces a desired state.

```bash
cat labs/33-vm-manager-patching/os-policy-assignment.yaml
gcloud compute os-config os-policy-assignments create lab33-tree \
    --location=$ZONE \
    --file=labs/33-vm-manager-patching/os-policy-assignment.yaml \
    --async
```

An OS policy assignment applies to VMs in one zone. The rollout changes at most one VM at a time and waits 60 seconds after each VM.

11. Wait about 5 minutes, then check the rollout and the compliance report for each target VM.

```bash
gcloud compute os-config os-policy-assignments describe lab33-tree --location=$ZONE \
    --format="yaml(rolloutState,revisionId)"
gcloud compute os-config os-policy-assignment-reports list --location=$ZONE \
    --assignment-id=lab33-tree
```

The rollout state is `SUCCEEDED`. The report shows `lab33-dev-vm` with `1/1 policies compliant`. The `prod` VM is not in the report, because it does not have the label `env=dev`. After the rollout, VM Manager checks and enforces the policy every 60 minutes.

12. Wait about 10 minutes for the next inventory scan, then compare the available updates on the two VMs.

```bash
for VM in lab33-dev-vm lab33-prod-vm; do
  echo "== $VM"
  gcloud compute os-config inventories describe "$VM" --location=$ZONE --view=full \
      | grep -A 30 "Package Updates Available"
done
```

The `dev` VM shows fewer available updates than the `prod` VM, or none. If step 6 showed no updates, both lists can be empty. The Google Cloud console shows the same data on the VM Manager Patch dashboard. The dashboard needs about 30 minutes after a patch job starts to show its data.

## Check your work

```bash
gcloud compute os-config patch-jobs list --filter="displayName~^lab33-"
gcloud compute os-config patch-deployments list
gcloud compute os-config os-policy-assignment-reports list --location=$ZONE \
    --assignment-id=lab33-tree
gcloud compute os-config inventories describe lab33-dev-vm --location=$ZONE --view=full \
    | grep -w tree
```

Expected results:

- Two patch jobs, `lab33-dry-run` and `lab33-patch-dev`, both with the state `SUCCEEDED`.
- The patch deployment `lab33-weekly-prod` with a weekly schedule and a next run time.
- `lab33-dev-vm` with `1/1 policies compliant` for `lab33-tree`.
- The `tree` package in the installed packages of `lab33-dev-vm`.

## Explore

1. The web tier runs in a MIG. A critical OS patch is out. Do you run a patch job on the MIG VMs?

   <details><summary>Answer</summary>

   No. By default, VM Manager does not patch VMs that are part of a MIG. A MIG creates and recreates VMs from its instance template, for example when autohealing repairs a VM or the autoscaler adds VMs. A patch that you install in place is not in the template, so a recreated VM does not have it. Put the patch into a new image, for example in a custom image family. Then replace the VMs with a rolling update. See [Create patch jobs](https://docs.cloud.google.com/compute/vm-manager/docs/patch/create-patch-job) and [Performing one-click OS image upgrades in MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/upgrading-images-in-migs).

   </details>

2. A bank runs VMs in a VPC network with no internet access. The security team wants to approve every patch before it reaches production. What do you recommend?

   <details><summary>Answer</summary>

   Host a local package repository (or Windows Server Update Services) inside the network. Google recommends this for full control over the patch baseline. The VMs reach the repository privately, and the team adds only approved packages. Cloud NAT or a proxy to the public repositories is the alternative, but it gives less control. See [About Patch](https://docs.cloud.google.com/compute/vm-manager/docs/patch).

   </details>

3. A developer asks for the Patch Job Executor role (`roles/osconfig.patchJobExecutor`) on the production project. What is the risk?

   <details><summary>Answer</summary>

   The role contains the `osconfig.patchJobs.exec` permission, which gives access to manage software packages on VMs. The docs warn that this role can give users unintended access to run code on VMs. Follow least privilege. Where read-only access is enough, grant the Patch Job Viewer role (`roles/osconfig.patchJobViewer`). Monitor use of the permission. See [Create patch jobs](https://docs.cloud.google.com/compute/vm-manager/docs/patch/create-patch-job).

   </details>

4. When do you use a patch job, and when do you use an OS policy?

   <details><summary>Answer</summary>

   Use a patch job to apply OS updates with a rollout plan, a maintenance window, and reboot control. Use a patch deployment to run patch jobs on a schedule. Use an OS policy to keep a desired state: install or remove packages, add repositories, manage files, or run scripts. An OS policy in `ENFORCEMENT` mode corrects drift. In `VALIDATION` mode it only reports. VM Manager checks OS policies every 60 minutes and reports compliance. See [About OS policies](https://docs.cloud.google.com/compute/vm-manager/docs/os-policies) and [OS policy and OS policy assignment](https://docs.cloud.google.com/compute/vm-manager/docs/os-policies/working-with-os-policies).

   </details>

## Clean up

```bash
bash labs/33-vm-manager-patching/teardown.sh
```

The script deletes these resources:

- The OS policy assignment `lab33-tree`.
- The patch deployment `lab33-weekly-prod`.
- The VMs `lab33-dev-vm` and `lab33-prod-vm`.
- The Cloud NAT gateway `lab33-nat` and the Cloud Router `lab33-router`.
- The subnet `lab33-subnet` and the VPC network `lab33-vpc`.
- The service account `lab33-vm-sa`.

The patch job records `lab33-dry-run` and `lab33-patch-dev` stay in the project history. The OS Config API has no delete method for patch jobs.

## Docs used

- [VM Manager overview](https://docs.cloud.google.com/compute/vm-manager/docs/overview)
- [Set up VM Manager](https://docs.cloud.google.com/compute/vm-manager/docs/setup)
- [About Patch](https://docs.cloud.google.com/compute/vm-manager/docs/patch)
- [Create patch jobs](https://docs.cloud.google.com/compute/vm-manager/docs/patch/create-patch-job)
- [Manage patch jobs](https://docs.cloud.google.com/compute/vm-manager/docs/patch/manage-patch-jobs)
- [Schedule patch jobs](https://docs.cloud.google.com/compute/vm-manager/docs/patch/schedule-patch-jobs)
- [View OS inventory data](https://docs.cloud.google.com/compute/vm-manager/docs/os-inventory/view-os-details)
- [About OS policies](https://docs.cloud.google.com/compute/vm-manager/docs/os-policies)
- [OS policy and OS policy assignment](https://docs.cloud.google.com/compute/vm-manager/docs/os-policies/working-with-os-policies)
- [Create an OS policy assignment](https://docs.cloud.google.com/compute/vm-manager/docs/os-policies/create-os-policy-assignment)
- [View OS policy reports](https://docs.cloud.google.com/compute/vm-manager/docs/os-policies/view-compliance)
- [Operating system details: Debian](https://docs.cloud.google.com/compute/docs/images/os-details)
- [REST reference: patchDeployments](https://docs.cloud.google.com/compute/docs/osconfig/rest/v1/projects.patchDeployments), [patchJobs](https://docs.cloud.google.com/compute/docs/osconfig/rest/v1/projects.patchJobs), and [OSPolicyAssignment](https://docs.cloud.google.com/compute/docs/osconfig/rest/Shared.Types/OSPolicyAssignment)
- [Cloud NAT product interactions: Private Google Access](https://docs.cloud.google.com/nat/docs/nat-product-interactions)
- [Quickstart: Set up Public NAT](https://docs.cloud.google.com/nat/docs/set-up-manage-network-address-translation)
- [VM Manager pricing](https://cloud.google.com/compute/vm-manager/pricing), [Cloud NAT pricing](https://cloud.google.com/nat/pricing), [General-purpose VM pricing](https://cloud.google.com/products/compute/pricing/general-purpose), and [Disk and image pricing](https://cloud.google.com/compute/disks-image-pricing)
