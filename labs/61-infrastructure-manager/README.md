---
id: 61-infrastructure-manager
title: Deploy Terraform with Infrastructure Manager
objectives: ["5.2"]
minutes: 75
cost: "Usually no charge. Infrastructure Manager charges only for the Cloud Build minutes and the Cloud Storage that it uses, and Cloud Build includes free build-minutes each month. The e2-micro VM and its disk are in the Compute Engine Free Tier in us-central1, us-east1, and us-west1. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Deploy a Terraform configuration with Infrastructure Manager (Infra Manager) instead of the Terraform CLI. Use previews, revisions, drift detection, and the state that Infra Manager keeps, and then delete the deployment.

## Exam relevance

- Infra Manager is Google's managed service for Terraform, and it replaces Deployment Manager. See [Infrastructure as Code](note:5.2-infrastructure-as-code).
- The configuration has no backend block, because Infra Manager stores the state for each revision.
- Infra Manager runs Terraform as a service account that you name. That account needs `roles/config.agent` and roles for the resources in the configuration.
- A preview is a `terraform plan` that Infra Manager runs for you. It also reports drift.
- To go back to an earlier state, you apply a configuration again as a new revision. Compare this with lab [60-terraform-basics](lab:60-terraform-basics), where you run the Terraform CLI yourself.

## Before you start

- Complete [lab 00-setup](lab:00-setup). Run every command from the repository root.
- IAM: Owner of the lab project. Owner includes the Infra Manager Admin role (`roles/config.admin`) and permission to act as the service account.
- Tools: the gcloud CLI and Python 3. You do not need Terraform on your machine.
- Infra Manager must support your region. `us-central1` is supported.
- Time: about 75 minutes. Each preview or deployment takes a few minutes while Cloud Build runs Terraform.

Set up the shell and enable the APIs:

```bash
source labs/env.sh
gcloud services enable config.googleapis.com compute.googleapis.com
```

## Steps

1. Create the service account that Infra Manager uses to run Terraform. It needs the Infra Manager Agent role, plus roles for the network, the firewall rule, and the VM in the configuration.

```bash
gcloud iam service-accounts create lab61-infra-sa \
  --display-name="Lab 61 Infrastructure Manager"
export IM_SA_EMAIL="lab61-infra-sa@${PROJECT_ID}.iam.gserviceaccount.com"
export IM_SA="projects/${PROJECT_ID}/serviceAccounts/${IM_SA_EMAIL}"
for ROLE in roles/config.agent roles/compute.networkAdmin roles/compute.securityAdmin roles/compute.instanceAdmin.v1; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${IM_SA_EMAIL}" \
    --role="$ROLE" \
    --condition=None \
    --format=none
done
```

If a binding fails because the service account does not exist yet, wait 30 seconds and run the loop again. `roles/compute.networkAdmin` does not include firewall rules, so the account also needs `roles/compute.securityAdmin`.

2. Read the configuration. It is the same shape as lab 60, but `versions.tf` has no backend block and `providers.tf` has no credentials. Then list the Terraform versions that Infra Manager supports.

```bash
ls -R labs/61-infrastructure-manager/config
cat labs/61-infrastructure-manager/config/versions.tf labs/61-infrastructure-manager/config/providers.tf
gcloud infra-manager terraform-versions list --location="$REGION"
```

3. Preview the new deployment. Infra Manager uploads the local folder and runs `terraform plan` in Cloud Build. Nothing is created yet.

```bash
export IM_PREFIX="projects/${PROJECT_ID}/locations/${REGION}"
gcloud infra-manager previews create "${IM_PREFIX}/previews/lab61-preview-create" \
  --service-account="$IM_SA" \
  --local-source=labs/61-infrastructure-manager/config \
  --input-values="project_id=${PROJECT_ID},region=${REGION},zone=${ZONE}"
gcloud infra-manager resource-changes list \
  --preview="${IM_PREFIX}/previews/lab61-preview-create" \
  --format="table(terraformInfo.address,intent)"
```

You see four resources with the intent `CREATE`.

4. Export the preview. You get the plan as a binary file and as JSON. Policy tools such as `gcloud beta terraform vet` read the JSON form.

```bash
gcloud infra-manager previews export "${IM_PREFIX}/previews/lab61-preview-create" \
  --file=labs/61-infrastructure-manager/lab61-preview
ls -l labs/61-infrastructure-manager/lab61-preview*
```

5. Create the deployment. This is revision `r-0`.

```bash
export IM_DEPLOYMENT="${IM_PREFIX}/deployments/lab61-deployment"
gcloud infra-manager deployments apply "$IM_DEPLOYMENT" \
  --service-account="$IM_SA" \
  --local-source=labs/61-infrastructure-manager/config \
  --input-values="project_id=${PROJECT_ID},region=${REGION},zone=${ZONE}"
```

6. Inspect the deployment, its revision, and its resources. The revision records the Cloud Build job and the location of its logs.

```bash
gcloud infra-manager deployments describe "$IM_DEPLOYMENT" \
  --format="yaml(state,latestRevision,tfVersion,serviceAccount)"
gcloud infra-manager revisions list --deployment="$IM_DEPLOYMENT" \
  --format="table(name.basename(),action,state,tfVersion)"
gcloud infra-manager revisions describe "${IM_DEPLOYMENT}/revisions/r-0" \
  --format="yaml(build,logs)"
gcloud infra-manager resources list --revision="${IM_DEPLOYMENT}/revisions/r-0" \
  --format="table(terraformInfo.address,intent,state)"
```

7. Find the state. Infra Manager keeps its artifacts in a bucket that it created. Download the state file of `r-0` through a signed URL and list the resources in it.

```bash
gcloud storage ls "gs://${PROJECT_NUMBER}-${REGION}-blueprint-config/"
STATE_URL=$(gcloud infra-manager revisions export-statefile "${IM_DEPLOYMENT}/revisions/r-0" --format="get(signedUri)")
curl -s -o labs/61-infrastructure-manager/lab61-r0.tfstate "$STATE_URL"
python3 -c "import json; s = json.load(open('labs/61-infrastructure-manager/lab61-r0.tfstate')); print(s['terraform_version']); [print(r.get('module', 'root'), r['type'], r['name']) for r in s['resources']]"
```

8. Change the configuration through an input value, and preview the update first. Only the VM label changes.

```bash
gcloud infra-manager previews create "${IM_PREFIX}/previews/lab61-preview-update" \
  --deployment="$IM_DEPLOYMENT" \
  --service-account="$IM_SA" \
  --local-source=labs/61-infrastructure-manager/config \
  --input-values="project_id=${PROJECT_ID},region=${REGION},zone=${ZONE},environment=test"
gcloud infra-manager resource-changes list \
  --preview="${IM_PREFIX}/previews/lab61-preview-update" \
  --format="table(terraformInfo.address,intent)"
```

The VM shows `UPDATE`. Apply the same change to create revision `r-1`:

```bash
gcloud infra-manager deployments apply "$IM_DEPLOYMENT" \
  --service-account="$IM_SA" \
  --local-source=labs/61-infrastructure-manager/config \
  --input-values="project_id=${PROJECT_ID},region=${REGION},zone=${ZONE},environment=test"
```

9. Create drift. Change the firewall rule outside Infra Manager, then run a preview. The preview reports the drift and plans to put the rule back.

```bash
gcloud compute firewall-rules update lab61-vpc-allow-iap-ssh \
  --source-ranges=35.235.240.0/20,10.61.0.0/24
gcloud infra-manager previews create "${IM_PREFIX}/previews/lab61-preview-drift" \
  --deployment="$IM_DEPLOYMENT" \
  --service-account="$IM_SA" \
  --local-source=labs/61-infrastructure-manager/config \
  --input-values="project_id=${PROJECT_ID},region=${REGION},zone=${ZONE},environment=test"
gcloud infra-manager resource-drifts list --preview="${IM_PREFIX}/previews/lab61-preview-drift"
```

Apply the configuration again. Infra Manager returns the rule to the configured state as revision `r-2`:

```bash
gcloud infra-manager deployments apply "$IM_DEPLOYMENT" \
  --service-account="$IM_SA" \
  --local-source=labs/61-infrastructure-manager/config \
  --input-values="project_id=${PROJECT_ID},region=${REGION},zone=${ZONE},environment=test"
```

10. Delete the deployment. The default delete policy removes the resources and the deployment metadata. Infra Manager uses the service account again for this step.

```bash
gcloud infra-manager deployments delete "$IM_DEPLOYMENT" --quiet
gcloud compute instances list --filter="name=lab61-vm"
```

The second command lists no instances.

## Check your work

Run these commands after step 9.

```bash
gcloud infra-manager revisions list --deployment="$IM_DEPLOYMENT" \
  --format="table(name.basename(),action,state)"
```

Expected output: `r-0` with `CREATE`, then `r-1` and `r-2` with `UPDATE`. All three have the state `APPLIED`.

```bash
gcloud compute instances describe lab61-vm --zone="$ZONE" --format="value(labels)"
gcloud compute firewall-rules describe lab61-vpc-allow-iap-ssh --format="value(sourceRanges)"
```

Expected output: labels that include `environment=test`, and only the IAP range `35.235.240.0/20`.

```bash
gcloud infra-manager deployments describe "$IM_DEPLOYMENT" --format="value(state)"
```

Expected output: `ACTIVE`.

## Explore

1. A team moves its Terraform root modules to Infra Manager. Each module has a `backend "gcs"` block. What must the team change?

<details><summary>Answer</summary>

Remove the backend blocks. Infra Manager requires that a configuration defines no backend, because Infra Manager stores the state for each deployment and revision. The configuration must also be a valid root module that a supported Terraform version can run.

</details>

2. Revision `r-5` deleted a database by mistake. Can you roll back to `r-4`?

<details><summary>Answer</summary>

You roll forward: you apply the `r-4` configuration again, and Infra Manager creates a new revision. This recreates the database resource, but it does not restore the data. Infra Manager does not migrate data. Protect stateful resources with deletion protection, and keep backups.

</details>

3. When do you delete a deployment with `--delete-policy=abandon`?

<details><summary>Answer</summary>

When the resources must stay, but Infra Manager must stop managing them. Infra Manager deletes only its metadata, the configuration copy, and the state file. The migration from Deployment Manager uses the same idea: you abandon the old deployment so that the resources stay.

</details>

4. Why does `lab61-infra-sa` need compute roles in addition to `roles/config.agent`?

<details><summary>Answer</summary>

Infra Manager runs Terraform as this service account. `roles/config.agent` covers only Infra Manager's own work, such as the bucket, the logs, and the state. The account also needs permissions for every resource in the configuration. For an update that removes resources, it also needs permission to delete them.

</details>

## Clean up

```bash
bash labs/61-infrastructure-manager/teardown.sh
```

The script deletes:

- the deployment `lab61-deployment` and the resources that it manages
- the previews `lab61-preview-create`, `lab61-preview-update`, and `lab61-preview-drift`
- any lab 61 resource that is left: `lab61-vm`, `lab61-vpc-allow-iap-ssh`, `lab61-subnet`, and `lab61-vpc`
- the IAM bindings and the service account `lab61-infra-sa`
- the Infra Manager artifact bucket `PROJECT_NUMBER-REGION-blueprint-config`, but only when no deployment is left in the region
- the local files `lab61-preview*` and `lab61-r0.tfstate`

## Docs used

- [Infrastructure Manager overview](https://docs.cloud.google.com/infrastructure-manager/docs/overview)
- [Terraform and Infrastructure Manager](https://docs.cloud.google.com/infrastructure-manager/docs/infra-manager-terraform)
- [Configure the service account](https://docs.cloud.google.com/infrastructure-manager/docs/configure-service-account)
- [Deploy a VPC with Terraform](https://docs.cloud.google.com/infrastructure-manager/docs/deploy-vpc-with-terraform)
- [Deploy infrastructure using Infrastructure Manager](https://docs.cloud.google.com/infrastructure-manager/docs/deploy-resources)
- [Preview a deployment](https://docs.cloud.google.com/infrastructure-manager/docs/preview-deployment)
- [Export and view preview results](https://docs.cloud.google.com/infrastructure-manager/docs/export-view-preview-results)
- [Deployments, revisions, and previews overview](https://docs.cloud.google.com/infrastructure-manager/docs/deployments-revisions)
- [View deployments](https://docs.cloud.google.com/infrastructure-manager/docs/view-deployments)
- [Manage the Terraform state file](https://docs.cloud.google.com/infrastructure-manager/docs/state-file)
- [Delete a deployment](https://docs.cloud.google.com/infrastructure-manager/docs/delete-deployments)
- [Infrastructure Manager locations](https://docs.cloud.google.com/infrastructure-manager/docs/locations)
- [Infrastructure Manager pricing](https://cloud.google.com/infrastructure-manager/pricing)
