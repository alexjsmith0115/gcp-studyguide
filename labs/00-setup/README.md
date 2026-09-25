---
id: 00-setup
title: Set up the lab project, billing, budget, and gcloud configuration
objectives: ["4.2", "5.2"]
minutes: 20
cost: "No cost. This lab creates no billable resources, and the Cloud Billing Budget API is free to use."
requiresOrg: false
---

## Goal

Create one sandbox project for all labs, with a budget alert, and a separate gcloud configuration that keeps your normal gcloud settings untouched. Every other lab starts from the lab shell that this lab sets up.

## Exam relevance

- **Projects are the unit of isolation.** A project holds its own IAM policy, enabled APIs, quotas, and billing link. When you shut down a project, billing and resource usage stop ([Delete and restore projects](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects)). A dedicated lab project makes clean-up simple. See [Designing for security: IAM and the resource hierarchy](note:3.1-iam-and-hierarchy).
- **Budgets alert; they do not cap.** An alerts-only budget "doesn't automatically cap Google Cloud or Google Maps Platform usage or spending" ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). The exam often tests this. See [Cost optimization](note:4.2-cost-optimization).
- **gcloud configurations** are named sets of gcloud properties. The `CLOUDSDK_ACTIVE_CONFIG_NAME` environment variable selects one for the current terminal only ([Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)). See [Interacting with Google Cloud programmatically](note:5.2-programmatic-access).

## Before you start

- **Tools:** the gcloud CLI, signed in with `gcloud auth login`. Run every command from the repository root.
- **IAM:** you create the project, so you are its Owner. To link billing, you need a role on the Cloud Billing account, for example Billing Account User. To create the budget, you need Billing Account Administrator or Billing Account Costs Manager ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). If you created the billing account, you are its administrator.
- **Organization:** not needed. Without an organization, the new project is the top of its own resource hierarchy.
- **Time:** about 20 minutes.

> Your default gcloud configuration can point at a real project. This lab never changes it. All lab commands run in a separate configuration named `pca-lab`, and `labs/env.sh` refuses any project whose ID does not start with `pca-lab-`.

## Steps

1. Record the account that you use now. A new configuration starts empty, so you copy the account into it in step 2.

   ```bash
   export PCA_ACCOUNT="$(gcloud config get-value account)"
   echo "$PCA_ACCOUNT"
   ```

2. Create the `pca-lab` configuration without activating it. Then select it for this terminal only, with `CLOUDSDK_ACTIVE_CONFIG_NAME`. Other terminals keep your normal configuration.

   ```bash
   gcloud config configurations create pca-lab --no-activate
   export CLOUDSDK_ACTIVE_CONFIG_NAME=pca-lab
   gcloud config set account "$PCA_ACCOUNT"
   ```

3. Choose a project ID. A project ID must start with a lowercase letter, contain only lowercase letters, digits, and hyphens, and have 6 to 30 characters. It is permanent after creation ([Create projects](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)). A random suffix makes the ID unique.

   ```bash
   export PROJECT_ID="pca-lab-$(openssl rand -hex 3)"
   echo "$PROJECT_ID"
   ```

4. Create the project and make it the default project, region, and zone of the `pca-lab` configuration. The labs use `us-central1`. You can choose another region, but some lab cost notes assume `us-central1`.

   ```bash
   gcloud projects create "$PROJECT_ID" --name="PCA lab"
   gcloud config set project "$PROJECT_ID"
   gcloud config set compute/region us-central1
   gcloud config set compute/zone us-central1-a
   ```

5. Find your Cloud Billing account ID. Use an account that shows `OPEN` as `True`. Then link the project to it. A project must be linked to an active Cloud Billing account before you can use most services ([Enable, disable, or change billing for a project](https://docs.cloud.google.com/billing/docs/how-to/modify-project)).

   ```bash
   gcloud billing accounts list
   export BILLING_ACCOUNT="000000-000000-000000"   # replace with your ACCOUNT_ID
   gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
   ```

6. Open the lab shell. `labs/env.sh` selects the `pca-lab` configuration, checks the project ID prefix, and exports `PROJECT_ID`, `PROJECT_NUMBER`, `REGION`, and `ZONE` for the labs. It also adds `(pca-lab)` to your prompt.

   ```bash
   source labs/env.sh
   ```

7. Enable the Cloud Billing Budget API. gcloud charges quota to the current project, and you must enable the Budget API in the project that calls it ([Cloud Billing Budget API Setup](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup)).

   ```bash
   gcloud services enable billingbudgets.googleapis.com
   ```

8. Create a monthly budget for this project only. The amount is in the currency of your billing account; change `25` to a number that suits you. The rules send email at 50%, 90%, and 100% of actual spend, and when the forecast for the month reaches 100%. By default, the emails go to Billing Account Administrators and Billing Account Users ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). Later labs find the billing account from the project, so you do not need to save its ID.

   ```bash
   gcloud billing budgets create \
     --billing-account="$BILLING_ACCOUNT" \
     --display-name="pca-lab monthly" \
     --budget-amount=25 \
     --calendar-period=month \
     --filter-projects="projects/$PROJECT_ID" \
     --threshold-rule=percent=0.5 \
     --threshold-rule=percent=0.9 \
     --threshold-rule=percent=1.0 \
     --threshold-rule=percent=1.0,basis=forecasted-spend
   ```

**Every later lab:** open a new terminal in the repository root and run `source labs/env.sh`. That is "the lab shell".

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

   Expected output includes: `pca-lab monthly`

3. Your normal configuration is unchanged. Open a **new** terminal (without the lab shell) and run:

   ```bash
   gcloud config configurations list
   gcloud config get-value project
   ```

   Expected: the `pca-lab` row shows `IS_ACTIVE` as `False`, and the project is your usual project, not the lab project. In the lab shell, the same commands show `pca-lab` as active.

## Explore

1. Your budget reaches 100% in the middle of a lab. Does Google Cloud stop your resources?

   <details><summary>Answer</summary>

   No. An alerts-only budget only sends notifications. It does not cap usage or spending ([Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)). To stop costs automatically, you can send budget notifications to Pub/Sub and run a function that disables billing on the project. That shuts down all resources, and "resources might be irretrievably deleted" ([Disable billing usage with notifications](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)). For some API-based services (for example the Gemini API, Agent Platform, and Cloud Run), a spend cap budget (Preview) pauses new usage of one service in one project ([Manage spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)).

   </details>

2. Why does the lab use a separate gcloud configuration instead of `gcloud config set project`?

   <details><summary>Answer</summary>

   `gcloud config set project` changes the active configuration, which your other terminals and tools also use. A mistake then runs a command against the wrong project. A named configuration keeps the lab settings apart, and `CLOUDSDK_ACTIVE_CONFIG_NAME` applies it to one terminal only ([Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)). The same idea applies to production work: one configuration for each environment.

   </details>

3. You finish all labs and shut down the project. What happens to billing and data?

   <details><summary>Answer</summary>

   Shutting down a project stops billing and resource usage and disconnects the Cloud Billing account. The project stays in a 30-day recovery period. After 30 days, Google deletes it permanently. Some services, such as Cloud Storage and Pub/Sub, can delete resources sooner. Google also recommends that you disable billing manually before shutdown, because charges can continue until the current billing cycle ends ([Delete and restore projects](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects)). The teardown script unlinks billing first for that reason.

   </details>

4. Your account has no organization resource. How do you get one for the labs that need it?

   <details><summary>Answer</summary>

   An organization resource is available for Google Workspace and Cloud Identity customers. After you create the account and associate it with a domain, Google creates the organization resource. For an existing Google Cloud user, it appears when you create a new project or billing account, and older projects stay under "No organization" ([Set up a Google Cloud organization resource](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization)).

   </details>

## Clean up

Keep the project while you study. The labs reuse it, and each lab has its own `teardown.sh`.

When you finish **all** labs, delete everything that this lab created:

```bash
bash labs/00-setup/teardown.sh
```

The script asks you to type the project ID. Then it:

- deletes the `pca-lab monthly` budget,
- unlinks the project from the Cloud Billing account,
- shuts down (deletes) the project, which you can restore for 30 days,
- deletes the `pca-lab` gcloud configuration.

## Docs used

- [Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)
- [Create projects](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)
- [Delete and restore projects](https://docs.cloud.google.com/resource-manager/docs/delete-restore-projects)
- [Enable, disable, or change billing for a project](https://docs.cloud.google.com/billing/docs/how-to/modify-project)
- [Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Cloud Billing Budget API Setup](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup)
- [Manage spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
- [Disable billing usage with notifications](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)
- [Set up a Google Cloud organization resource](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization)
