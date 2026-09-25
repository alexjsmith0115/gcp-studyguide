---
id: 60-terraform-basics
title: Terraform with remote state
objectives: ["5.2"]
minutes: 60
cost: "Usually no charge. The Compute Engine Free Tier covers one e2-micro VM and 30 GB-months of standard persistent disk in us-central1, us-east1, and us-west1. Outside the Free Tier, you pay the e2-micro rate while the VM runs. The state bucket holds a few KB. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Deploy a small VPC and VM with Terraform, and keep the state in a versioned Cloud Storage bucket. Then detect drift and bring a resource that you created by hand under Terraform management.

## Exam relevance

- The Cloud Storage backend with Object Versioning is the Google-recommended state store for teams. It locks the state. See [Infrastructure as Code](note:5.2-infrastructure-as-code).
- The code follows Google's structure rules: a reusable module without provider or backend blocks, and a root module that pins the provider version.
- You plan first, save the plan, and apply the saved plan, as Google's operations guide recommends.
- You see that Terraform finds drift only when you run it, and you compare an `import` block with recreation.
- The VM has no external IP address, and SSH is open only to the IAP range. See [Secure remote and workload access](note:3.1-secure-access).

## Before you start

- Complete [lab 00-setup](lab:00-setup). Run every command from the repository root unless a step says otherwise.
- Tools: Terraform 1.5 or later and the gcloud CLI. Cloud Shell has Terraform preinstalled.
- IAM: Owner of the lab project, or Compute Admin and Storage Admin.
- Time: about 60 minutes.

Set up the shell and enable the APIs:

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com storage.googleapis.com
```

## Steps

1. Terraform authenticates with Application Default Credentials (ADC). Create ADC for your user account. Skip this step in Cloud Shell.

```bash
gcloud auth application-default login
```

2. The state bucket must exist before `terraform init`, so create it first with gcloud. Turn on Object Versioning to keep every earlier version of the state. (Google's tutorial creates the bucket with Terraform instead, and then migrates the local state into it.)

```bash
export TF_STATE_BUCKET="lab60-tfstate-${PROJECT_ID}"
gcloud storage buckets create "gs://${TF_STATE_BUCKET}" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --public-access-prevention
gcloud storage buckets update "gs://${TF_STATE_BUCKET}" --versioning
gcloud storage buckets describe "gs://${TF_STATE_BUCKET}" --format="default(versioning_enabled)"
```

3. Read the code before you run it. The root module pins the provider in `versions.tf`. The module in `modules/network` declares only a minimum provider version and has no provider or backend block. Run the remaining steps from the lab folder.

```bash
cd labs/60-terraform-basics
ls -R
cat backend.tf versions.tf modules/network/versions.tf
```

4. The `gcs` backend in `backend.tf` has no bucket name. Give the bucket name at init time (a partial configuration), so the code holds no project-specific value.

```bash
terraform init -backend-config="bucket=${TF_STATE_BUCKET}"
```

Look for `Successfully configured the backend "gcs"!` in the output.

5. Run the least expensive tests first. These static checks deploy nothing.

```bash
terraform fmt -check -recursive
terraform validate
```

6. Create a plan and save it to a file. Read what Terraform will create before anything changes.

```bash
terraform plan -out=tfplan
```

The last line is `Plan: 4 to add, 0 to change, 0 to destroy.`

7. Apply the saved plan. Terraform applies exactly what you reviewed and then writes the state to the bucket.

```bash
terraform apply tfplan
terraform output
```

8. Inspect the state. `terraform state` commands are the safe way to read state; never edit the file by hand. Each apply writes a new object generation in the bucket.

```bash
terraform state list
terraform state show module.network.google_compute_firewall.allow_iap_ssh
gcloud storage ls --all-versions "gs://${TF_STATE_BUCKET}/lab60/state/"
```

9. Create drift: change the firewall rule outside Terraform, as a person in the console might. Terraform finds the change only when you run it.

```bash
gcloud compute firewall-rules update lab60-vpc-allow-iap-ssh \
  --source-ranges=35.235.240.0/20,10.60.0.0/24
terraform plan -out=tfplan
```

The plan shows `~ source_ranges` and `Plan: 0 to add, 1 to change, 0 to destroy.` Apply it to put the rule back to the code:

```bash
terraform apply tfplan
```

10. Bring an existing resource under Terraform. First create a firewall rule with gcloud. Then add an `import` block and a matching resource block, so that the plan shows the import before anything changes.

```bash
gcloud compute firewall-rules create lab60-allow-icmp-internal \
  --network=lab60-vpc \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=icmp \
  --source-ranges=10.60.0.0/24 \
  --priority=1000
sed "s/PROJECT_ID/${PROJECT_ID}/" import.tf.example > import.tf
cat import.tf
terraform plan -out=tfplan
```

The last line is `Plan: 1 to import, 0 to add, 0 to change, 0 to destroy.` Apply it, and confirm that the code and the resource now match:

```bash
terraform apply tfplan
terraform plan
```

The second command reports `No changes.` Terraform can also write the resource block for you: keep only the `import` block and run `terraform plan -generate-config-out=generated.tf`. Always review generated code.

11. Destroy everything that Terraform manages, including the imported rule. The state bucket stays, because Terraform does not manage it.

```bash
terraform destroy
```

Type `yes`. The output ends with `Destroy complete! Resources: 5 destroyed.`

## Check your work

Run these commands after step 10, from `labs/60-terraform-basics`.

```bash
terraform state list
```

Expected output:

```text
google_compute_firewall.allow_icmp_internal
google_compute_instance.main
module.network.google_compute_firewall.allow_iap_ssh
module.network.google_compute_network.main
module.network.google_compute_subnetwork.main
```

The VM runs and has no external IP address:

```bash
gcloud compute instances describe lab60-vm --zone="$ZONE" \
  --format="value(status,networkInterfaces[0].accessConfigs)"
```

Expected output: `RUNNING` and nothing after it.

The bucket keeps older state versions:

```bash
gcloud storage ls --all-versions "gs://${TF_STATE_BUCKET}/lab60/state/"
```

Expected output: several lines like `gs://lab60-tfstate-.../lab60/state/default.tfstate#1727...`, one line for each generation.

Optional lock test: in one shell, run `terraform apply` and do not answer the prompt. In a second shell, run `source labs/env.sh`, go to the lab folder, and run `terraform plan`. The second command fails with `Error acquiring the state lock`. Answer `no` in the first shell.

## Explore

1. Why does `modules/network` have no `provider` or `backend` block?

<details><summary>Answer</summary>

Google's module guide says shared modules must not configure providers or backends. The root module configures them. A reusable module only declares the minimum provider version in `required_providers`. This lets each caller choose the provider settings and the state location.

</details>

2. Another team needs the self link of `lab60-vpc` in its own Terraform configuration. How should the team get it?

<details><summary>Answer</summary>

Expose the value as an output of this root module. The other team reads it with a `terraform_remote_state` data source that points at this `gcs` backend. Google recommends remote state for sharing between configurations. Data sources are for resources that no Terraform configuration manages.

</details>

3. You need development and production copies of this stack. Do you use Terraform CLI workspaces?

<details><summary>Answer</summary>

No. Google recommends an `environments/` directory with one root configuration for each environment. Each environment has its own `backend.tf` and calls the shared module. One shared backend with several CLI workspaces becomes a single point of failure, and the code is harder to read.

</details>

4. When is an import the right choice instead of recreating the resource through Terraform?

<details><summary>Answer</summary>

Google prefers to create a new resource through Terraform and delete the old one. Import only when recreation causes significant toil, and get explicit approval. An `import` block lets reviewers see the import in the plan. After the import, change the resource only through Terraform.

</details>

## Clean up

```bash
bash labs/60-terraform-basics/teardown.sh
```

The script deletes:

- the resources in the Terraform state, with `terraform destroy`, if they still exist
- any lab 60 resource that is left: the VM `lab60-vm`, the firewall rules `lab60-vpc-allow-iap-ssh` and `lab60-allow-icmp-internal`, the subnet `lab60-subnet`, and the network `lab60-vpc`
- the state bucket `lab60-tfstate-PROJECT_ID`, with all object versions
- the local files `.terraform/`, `.terraform.lock.hcl`, `tfplan`, `import.tf`, and `generated.tf`

## Docs used

- [Store Terraform state in a Cloud Storage bucket](https://docs.cloud.google.com/docs/terraform/resource-management/store-state)
- [Authentication for Terraform](https://docs.cloud.google.com/docs/terraform/authentication)
- [Best practices for root modules](https://docs.cloud.google.com/docs/terraform/best-practices/root-modules)
- [Best practices for reusable modules](https://docs.cloud.google.com/docs/terraform/best-practices/reusable-modules)
- [Best practices for Terraform operations](https://docs.cloud.google.com/docs/terraform/best-practices/operations)
- [Best practices for security](https://docs.cloud.google.com/docs/terraform/best-practices/security)
- [Best practices for cross-configuration communication](https://docs.cloud.google.com/docs/terraform/best-practices/cross-config-communication)
- [Import your Google Cloud resources into Terraform state](https://docs.cloud.google.com/docs/terraform/resource-management/import)
- [Use Object Versioning](https://docs.cloud.google.com/storage/docs/using-object-versioning)
- [Free Google Cloud features and trial offer](https://docs.cloud.google.com/free/docs/free-cloud-features)
