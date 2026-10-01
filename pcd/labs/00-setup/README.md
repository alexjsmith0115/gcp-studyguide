---
id: 00-setup
title: Set up the PCD lab project, billing, budget, and gcloud configuration
objectives: ["4.2"]
minutes: 25
cost: "No cost. This lab creates no billable resources, and the Cloud Billing Budget API is free to use."
requiresOrg: false
---

## Goal

Create one sandbox project for all PCD labs, with a budget alert, the base APIs, and a separate gcloud configuration. Your normal gcloud settings do not change. Every other lab starts from the lab shell that this lab sets up.

## Exam relevance

- **You enable a service before your code calls it.** "Before you can use most Google APIs you must first enable them in a Google Cloud project" ([Service Usage overview](https://docs.cloud.google.com/service-usage/docs/overview)). The `gcloud services enable` command enables a service for the current project ([Enable and disable services](https://docs.cloud.google.com/service-usage/docs/enable-disable)). See [Calling Google Cloud APIs](note:4.2-calling-google-apis).
- **Local code uses Application Default Credentials (ADC) and a quota project.** On a workstation, ADC finds your user credentials in a local file. Python client libraries also read the quota project from the `GOOGLE_CLOUD_QUOTA_PROJECT` environment variable ([Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)). See [Authenticating code to Google Cloud](note:1.2-authenticating-to-google-cloud).
- **Budgets alert; they do not cap.** An alerts-only budget "doesn't automatically cap Google Cloud or Google Maps Platform usage or spending" ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). See [Sizing resources and controlling cost](note:1.1-resources-and-cost).
- **gcloud configurations** are named sets of gcloud properties. The `CLOUDSDK_ACTIVE_CONFIG_NAME` environment variable selects one for the current terminal only ([Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)). See [Developer tools](note:2.1-developer-tools).

## Before you start

- **Tools:** the gcloud CLI, signed in with `gcloud auth login`, and Python 3.12 or later. Run every command from the repository root. Labs 60 and 61 also need kubectl; those labs show how to install it.
- **IAM:** you create the project, so you are its Owner. To link billing, you need a role on the Cloud Billing account, for example Billing Account User. To create the budget, you need Billing Account Administrator or Billing Account Costs Manager ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). If you created the billing account, you are its administrator.
- **Organization:** not needed. Without an organization, the new project is the top of its own resource hierarchy.
- **Time:** about 25 minutes.

> Your default gcloud configuration can point at a real project. This lab never changes it. All lab commands run in a separate configuration named `pcd-lab`, and `pcd/labs/env.sh` refuses any project whose ID does not start with `pcd-lab-`. The lab shell also points kubectl at a lab-only file, `~/.kube/pcd-lab-config`, so lab commands cannot reach the clusters in your normal kubeconfig.

## Steps

1. Record the account that you use now. A new configuration starts empty, so you copy the account into it in step 2.

   ```bash
   export PCD_ACCOUNT="$(gcloud config get-value account)"
   echo "$PCD_ACCOUNT"
   ```

2. Create the `pcd-lab` configuration without activating it. Then select it for this terminal only, with `CLOUDSDK_ACTIVE_CONFIG_NAME`. Other terminals keep your normal configuration.

   ```bash
   gcloud config configurations create pcd-lab --no-activate
   export CLOUDSDK_ACTIVE_CONFIG_NAME=pcd-lab
   gcloud config set account "$PCD_ACCOUNT"
   ```

3. Choose a project ID. A project ID must start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and have 6 to 30 characters. It is permanent after creation ([Create projects](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)). A random suffix makes the ID unique.

   ```bash
   export PROJECT_ID="pcd-lab-$(openssl rand -hex 3)"
   echo "$PROJECT_ID"
   ```

4. Create the project and make it the default project, region, and zone of the `pcd-lab` configuration. The labs use `us-central1`. You can choose another region, but some lab cost notes assume `us-central1`. The `run/region` property lets `gcloud run` commands skip the region prompt.

   ```bash
   gcloud projects create "$PROJECT_ID" --name="PCD lab"
   gcloud config set project "$PROJECT_ID"
   gcloud config set compute/region us-central1
   gcloud config set compute/zone us-central1-a
   gcloud config set run/region us-central1
   ```

5. Find your Cloud Billing account ID. Use an account that shows `OPEN` as `True`. Then link the project to it. A project must be linked to an active Cloud Billing account before you can use most services ([Enable, disable, or change billing for a project](https://docs.cloud.google.com/billing/docs/how-to/modify-project)).

   ```bash
   gcloud billing accounts list
   export BILLING_ACCOUNT="000000-000000-000000"   # replace with your ACCOUNT_ID
   gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
   ```

6. Open the lab shell. `pcd/labs/env.sh` selects the `pcd-lab` configuration, checks the project ID prefix, and exports `PROJECT_ID`, `PROJECT_NUMBER`, `REGION`, and `ZONE` for the labs. It also sets `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_QUOTA_PROJECT`, and `KUBECONFIG`, and adds `(pcd-lab)` to your prompt.

   ```bash
   source pcd/labs/env.sh
   ```

7. Enable the base APIs that most labs use. Each later lab enables the other APIs that it needs. You must enable the Cloud Billing Budget API in the project that calls it ([Cloud Billing Budget API Setup](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup)). The command can take a minute.

   ```bash
   gcloud services enable \
     serviceusage.googleapis.com cloudresourcemanager.googleapis.com \
     cloudbilling.googleapis.com billingbudgets.googleapis.com \
     iam.googleapis.com iamcredentials.googleapis.com \
     run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
     logging.googleapis.com monitoring.googleapis.com
   ```

8. Create a monthly budget for this project only. The amount is in the currency of your billing account; change `25` to a number that suits you. The rules send email at 50%, 90%, and 100% of actual spend, and when the forecast for the month reaches 100%. By default, the emails go to Billing Account Administrators and Billing Account Users ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). The teardown script finds the billing account from the project, so you do not need to save its ID.

   ```bash
   gcloud billing budgets create \
     --billing-account="$BILLING_ACCOUNT" \
     --display-name="pcd-lab monthly" \
     --budget-amount=25 \
     --calendar-period=month \
     --filter-projects="projects/$PROJECT_ID" \
     --threshold-rule=percent=0.5 \
     --threshold-rule=percent=0.9 \
     --threshold-rule=percent=1.0 \
     --threshold-rule=percent=1.0,basis=forecasted-spend
   ```

9. Prepare deployments from source. `gcloud run deploy --source` builds your code with Cloud Build, and Cloud Build uses the Compute Engine default service account unless you choose another one. That account needs the Cloud Run Builder role (`roles/run.builder`). Google creates the account when you enable the Cloud Run Admin API, and the grant takes a few minutes to propagate ([Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)). If the command says that the account does not exist, wait one minute and run it again.

   ```bash
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/run.builder" --condition=None
   ```

10. Set up ADC for the lab code that runs on your computer. First check whether you already have an ADC file:

    ```bash
    gcloud auth application-default print-access-token >/dev/null && echo "ADC is set up"
    ```

    If the check prints `ADC is set up`, keep your file. Do not run the login again: it would write the lab project into the file as its quota project. In the lab shell, `GOOGLE_CLOUD_QUOTA_PROJECT` already sends the quota and billing of Python client library calls to the lab project. The environment variable takes precedence over the quota project in the credentials file ([Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)).

    If the check fails, create the file. A sign-in screen appears, and gcloud stores your credentials in the local ADC file ([Set up ADC for a local development environment](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)). The `--disable-quota-project` flag keeps the lab project out of the file, so the file stays neutral for your other work.

    ```bash
    gcloud auth application-default login --disable-quota-project
    ```

**Every later lab:** open a new terminal in the repository root and run `source pcd/labs/env.sh`. That is "the lab shell".

## Check your work

1. The project is linked to billing:

   ```bash
   gcloud billing projects describe "$PROJECT_ID" --format="value(billingEnabled)"
   ```

   Expected output: `True`

2. The budget exists:

   ```bash
   gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --format="value(displayName)"
   ```

   Expected output includes: `pcd-lab monthly`

3. The base APIs are enabled:

   ```bash
   gcloud services list --enabled --format="value(config.name)" | sort
   ```

   Expected output includes `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, and `billingbudgets.googleapis.com`.

4. The roles of the Compute Engine default service account:

   ```bash
   gcloud projects get-iam-policy "$PROJECT_ID" \
     --flatten="bindings[].members" \
     --filter="bindings.members:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --format="value(bindings.role)"
   ```

   Expected output includes: `roles/run.builder`. The output can also show `roles/editor`. Depending on organization policy, Google can grant the Editor role to a default service account automatically ([Types of service accounts](https://docs.cloud.google.com/iam/docs/service-account-types)). The labs never run your code as this account. Each lab creates a service account with only the roles that the lab needs.

5. Your normal configuration is unchanged. Open a **new** terminal (without the lab shell) and run:

   ```bash
   gcloud config configurations list
   gcloud config get-value project
   ```

   Expected: the `pcd-lab` row shows `IS_ACTIVE` as `False`, and the project is your usual project, not the lab project. In the lab shell, the same commands show `pcd-lab` as active.

## Explore

1. Your code calls the Pub/Sub API, but nobody enabled Pub/Sub in the project. What happens, and who can fix it?

   <details><summary>Answer</summary>

   The call fails, because you must enable most Google APIs in a project before you use them ([Service Usage overview](https://docs.cloud.google.com/service-usage/docs/overview)). Enable the service with `gcloud services enable pubsub.googleapis.com`. To enable a service, you need the `serviceusage.services.enable` permission, for example through the Service Usage Admin role (`roles/serviceusage.serviceUsageAdmin`) ([Enable and disable services](https://docs.cloud.google.com/service-usage/docs/enable-disable)).

   </details>

2. Your Python code runs on your computer with your user credentials. Which project receives the quota and billing for its API calls?

   <details><summary>Answer</summary>

   The quota project. The client library uses this order: a quota project that the code sets in client options, then the `GOOGLE_CLOUD_QUOTA_PROJECT` environment variable, then the quota project in the local ADC file. When the principal is a service account, also through impersonation, the project of the service account is the quota project. To use a project as the quota project, you need the `serviceusage.services.use` permission on it, for example through the Service Usage Consumer role ([Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)).

   </details>

3. Your budget reaches 100% in the middle of a lab. Does Google Cloud stop your resources?

   <details><summary>Answer</summary>

   No. An alerts-only budget only sends notifications. It does not cap usage or spending ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). To stop costs automatically, you can send budget notifications to Pub/Sub and run a function that disables billing on the project. That shuts down all resources, and "resources might be irretrievably deleted" ([Disable billing usage with notifications](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)).

   </details>

4. Why does the lab use a separate gcloud configuration instead of `gcloud config set project`?

   <details><summary>Answer</summary>

   `gcloud config set project` changes the active configuration, which your other terminals and tools also use. A mistake then runs a command against the wrong project. A named configuration keeps the lab settings apart, and `CLOUDSDK_ACTIVE_CONFIG_NAME` applies it to one terminal only ([Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)). Use the same method for real work: one configuration for each environment.

   </details>

## Clean up

Keep the project while you study. The labs reuse it, and each lab that creates billable resources has its own `teardown.sh`.

When you finish **all** labs, delete everything that this lab created:

```bash
bash pcd/labs/00-setup/teardown.sh
```

The script asks you to type the project ID. Then it:

- deletes the `pcd-lab monthly` budget,
- unlinks the project from the Cloud Billing account, because charges can continue until the billing cycle ends,
- shuts down (deletes) the project. Shutting down a project stops all billing and resource usage, and you can restore it for 30 days ([Delete and restore projects](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects)),
- deletes the `pcd-lab` gcloud configuration and the lab kubeconfig file `~/.kube/pcd-lab-config`.

The script does not touch your ADC file. If you created it in step 10 only for the labs, you can remove it with `gcloud auth application-default revoke`.

## Docs used

- [Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)
- [Create projects](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
- [Delete and restore projects](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects)
- [Enable, disable, or change billing for a project](https://docs.cloud.google.com/billing/docs/how-to/modify-project)
- [Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Cloud Billing Budget API Setup](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup)
- [Disable billing usage with notifications](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)
- [Service Usage overview](https://docs.cloud.google.com/service-usage/docs/overview)
- [Enable and disable services](https://docs.cloud.google.com/service-usage/docs/enable-disable)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Types of service accounts](https://docs.cloud.google.com/iam/docs/service-account-types)
- [Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)
- [Set up ADC for a local development environment](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
