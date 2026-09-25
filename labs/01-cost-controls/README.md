---
id: 01-cost-controls
title: Budgets, labels, and cost recommendations
objectives: ["4.2", "1.1"]
minutes: 45
cost: "About $0. The Cloud Billing Budget API is free, and budget messages stay far below the monthly Pub/Sub free tier (10 GiB). The optional e2-micro VM can fall under the Compute Engine Free Tier in us-west1, us-central1, or us-east1. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Create two budgets for the lab project: one scoped to the project that publishes to Pub/Sub, and one scoped to a cost-center label. Then read cost recommendations and walk through the Cloud Billing export to BigQuery.

## Exam relevance

- An alerts-only budget warns. It doesn't stop spend. A stop needs your own automation from the Pub/Sub messages ([Cost optimization](note:4.2-cost-optimization)).
- Budgets live on the Cloud Billing account, so billing IAM roles decide who can create them ([Cost optimization](note:4.2-cost-optimization)).
- Labels are the key for chargeback and for label-scoped budgets ([Cost optimization](note:4.2-cost-optimization)).
- Recommenders need usage history before they produce results. This affects when you can rightsize ([Cost optimization](note:4.2-cost-optimization)).
- Cost is a business requirement from the start of a design ([Business requirements](note:1.1-business-requirements), [Well-Architected Framework](note:1.2-well-architected-framework)).

## Before you start

- Complete `labs/00-setup`. It creates the lab project and the `pca-lab` gcloud configuration.
- IAM on the Cloud Billing account: Billing Account Costs Manager (`roles/billing.costsManager`) or Billing Account Administrator (`roles/billing.admin`). If you created the billing account yourself, you are already its administrator ([Cloud Billing access control](https://docs.cloud.google.com/billing/docs/how-to/billing-access)).
- IAM on the lab project: Owner, from the setup lab. A budget that publishes to a topic needs `pubsub.topics.setIamPolicy` on that topic ([Programmatic notifications](https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications)).
- For step 9 (console only): BigQuery User on the lab project ([Set up billing export](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup)).
- Time: about 45 minutes of work. The first budget message can take several hours to arrive, so do step 7 later.

## Steps

1. Open a lab shell and enable the APIs. The Budget API must be enabled in the project that calls it, and gcloud charges quota to the current project.

```bash
source labs/env.sh
gcloud services enable billingbudgets.googleapis.com cloudbilling.googleapis.com \
  pubsub.googleapis.com recommender.googleapis.com
```

2. Find the billing account that pays for the lab project. Budgets belong to the billing account, not to the project. The list command also proves that you can read budgets.

```bash
export BILLING_ACCOUNT="$(gcloud billing projects describe "$PROJECT_ID" \
  --format='value(billingAccountName)' | sed 's|^billingAccounts/||')"
echo "Billing account: $BILLING_ACCOUNT"
gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
  --format="table(displayName,amount.specifiedAmount.units)"
```

If the list fails with `PERMISSION_DENIED`, you don't have a billing role that can read budgets. Stop here and get one of the roles in "Before you start".

3. Create a Pub/Sub topic and a pull subscription, both with cost labels. Cloud Billing publishes budget status to the topic. The labels mark these resources in billing data.

```bash
gcloud pubsub topics create lab01-budget-alerts \
  --labels=cost-center=cc-lab01,env=sandbox
gcloud pubsub subscriptions create lab01-budget-alerts-sub \
  --topic=lab01-budget-alerts \
  --labels=cost-center=cc-lab01,env=sandbox
```

4. Create a monthly budget for the lab project only. The actual-spend rules report what happened. The forecasted rule warns before the month ends. The amount has no currency code, so the budget uses the currency of your billing account.

```bash
gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="lab01-project-budget" \
  --budget-amount=10 \
  --calendar-period=month \
  --filter-projects="projects/$PROJECT_ID" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0,basis=forecasted-spend \
  --notifications-rule-pubsub-topic="projects/$PROJECT_ID/topics/lab01-budget-alerts"
```

5. Create a second budget for the cost center label. A label-scoped budget follows a team's resources across all projects on the billing account. Label scope works only for budgets at the billing account level.

```bash
gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="lab01-costcenter-budget" \
  --budget-amount=5 \
  --calendar-period=month \
  --filter-labels=cost-center=cc-lab01 \
  --threshold-rule=percent=0.8
```

6. Read back both budgets. Check the scope, the rules, and the topic of each budget.

```bash
gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
  --filter="displayName~^lab01-" \
  --format="yaml(name,displayName,budgetFilter,thresholdRules,notificationsRule)"
```

7. After a few hours, pull the budget messages. Cloud Billing sends the current budget status several times per day, even with no usage. The DATA column holds the JSON status.

```bash
gcloud pubsub subscriptions pull lab01-budget-alerts-sub --auto-ack --limit=5
```

8. List cost recommendations for the lab project. Each recommender needs usage history, so a new project usually returns nothing. Note which history each one needs.

```bash
# Unattended project recommender: looks at the last 30 days of project use.
gcloud recommender recommendations list --project="$PROJECT_ID" --location=global \
  --recommender=google.resourcemanager.projectUtilization.Recommender \
  --format="table(description,primaryImpact.category,stateInfo.state)"

# Idle VM recommender: needs a VM that ran at least one day.
gcloud recommender recommendations list --project="$PROJECT_ID" --location="$ZONE" \
  --recommender=google.compute.instance.IdleResourceRecommender --format=yaml

# Machine type (rightsizing) recommender: uses the previous 8 days of metrics.
gcloud recommender recommendations list --project="$PROJECT_ID" --location="$ZONE" \
  --recommender=google.compute.instance.MachineTypeRecommender --format=yaml
```

Optional: create a small labeled VM and leave it idle for one to two days. Then run the idle VM command again. The VM uses a 10 GB standard persistent disk and no external IP address, to stay inside the Free Tier limits. This step uses the `default` network. Skip it if your lab project has no `default` network.

```bash
gcloud services enable compute.googleapis.com
gcloud compute instances create lab01-idle-vm \
  --zone="$ZONE" \
  --machine-type=e2-micro \
  --no-address \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-type=pd-standard \
  --boot-disk-size=10GB \
  --labels=cost-center=cc-lab01,env=sandbox
```

Don't expect a machine type recommendation for this VM. Compute Engine doesn't show one when the estimated saving is very small.

9. Walk through the Cloud Billing export to BigQuery in the console. The setup guide uses the console, and the gcloud CLI has no billing export command. The export is a setting of the whole billing account, so change it only if it is not set up yet.

   1. In the console, open **Billing**, select your billing account, and open **Billing export**.
   2. If a **Standard usage cost** export is already enabled, note its project and dataset, and don't change it. Skip to step 5 of this list and use that dataset.
   3. If no export exists, create a dataset named `lab01_billing_export` in the lab project. Use the **US** or **EU** multi-region, so that the export also loads data from the start of the previous month.
   4. On **Billing export**, enable **Standard usage cost** and select that dataset. Google recommends a dedicated FinOps project for a long-lived export. Move the export there later if you keep it.
   5. After data arrives, query cost by label. Replace `PROJECT.DATASET` with your export dataset. The first backfill can take up to five days.

```bash
bq query --use_legacy_sql=false '
SELECT l.key, l.value, ROUND(SUM(cost), 2) AS cost
FROM `PROJECT.DATASET.gcp_billing_export_v1_*`, UNNEST(labels) AS l
WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
GROUP BY l.key, l.value
ORDER BY cost DESC'
```

## Check your work

1. Both budgets exist:

```bash
gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
  --filter="displayName~^lab01-" --format="value(displayName)"
```

Expect `lab01-project-budget` and `lab01-costcenter-budget`. In the YAML from step 6, the project budget has three `thresholdRules`. The last rule has `spendBasis: FORECASTED_SPEND`. Its `notificationsRule.pubsubTopic` is your topic. The API can show the project filter with the project number instead of the project ID.

2. The topic has its labels:

```bash
gcloud pubsub topics describe lab01-budget-alerts --format="yaml(labels)"
```

Expect `cost-center: cc-lab01` and `env: sandbox`.

3. Cloud Billing can publish to the topic:

```bash
gcloud pubsub topics get-iam-policy lab01-budget-alerts --format=yaml
```

Look for a `roles/pubsub.publisher` binding for a Cloud Billing service account. The budget connection needs your permission to grant this role.

4. After a few hours, step 7 returns messages. The attributes include `billingAccountId` and `budgetId`. The data includes `budgetDisplayName`, `costAmount`, and `budgetAmount`. `alertThresholdExceeded` appears only after actual cost passes a threshold.

## Explore

1. A startup wants spend in a sandbox project to stop at a fixed amount. What do you configure, and what is the risk?

<details><summary>Answer</summary>

An alerts-only budget can't stop spend. Connect the budget to Pub/Sub and run a function that disables billing on the project when the cost passes the amount. This stops all services, and resources might be deleted. Cost data also arrives late, so set the amount below the real limit. For Gemini API, Agent Platform, Cloud Run, or Cloud Run functions, a spend cap budget (Preview) pauses one service in one project ([Disable billing usage with notifications](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications), [Spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)).

</details>

2. Finance wants monthly cost per team across 40 projects, including last quarter. Teams have never used labels. What do you set up, and what can't you deliver?

<details><summary>Answer</summary>

Define a label standard (for example `cost-center`), enforce it in Terraform, and enable the billing export to BigQuery. Label data starts only when you add a label, so last quarter can't be split by label. If each team owns its own projects, you can split past cost by project instead ([Billing reports](https://docs.cloud.google.com/billing/docs/how-to/reports), [Labels overview](https://docs.cloud.google.com/resource-manager/docs/labels-overview)).

</details>

3. A FinOps analyst must create budgets and export cost data. The analyst must not link projects or change payment details. Which role do you grant?

<details><summary>Answer</summary>

Billing Account Costs Manager on the billing account. It manages budgets and cost export, but it can't link projects or manage the account ([Cloud Billing access control](https://docs.cloud.google.com/billing/docs/how-to/billing-access)).

</details>

4. Why must the function that reads budget messages be idempotent?

<details><summary>Answer</summary>

Cloud Billing sends budget status several times per day, not once per threshold. Pub/Sub delivery is at-least-once, so the same message can arrive twice or out of order ([Programmatic notifications](https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications)).

</details>

## Clean up

```bash
bash labs/01-cost-controls/teardown.sh
```

The script deletes:

- Every budget on the billing account whose display name starts with `lab01-`
- The optional VM `lab01-idle-vm`
- The subscription `lab01-budget-alerts-sub` and the topic `lab01-budget-alerts`

The script doesn't change the billing export, because the export is a setting of the whole billing account. If you enabled it only for this lab, disable it on the **Billing export** page first. Then delete the dataset:

```bash
bq rm -r -f -d "$PROJECT_ID:lab01_billing_export"
```

## Docs used

- [Create, edit, or delete budgets and budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Set up programmatic notifications](https://docs.cloud.google.com/billing/docs/how-to/budgets-programmatic-notifications)
- [Cloud Billing Budget API setup](https://docs.cloud.google.com/billing/docs/how-to/budget-api-setup)
- [Manage spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
- [Disable billing usage with notifications](https://docs.cloud.google.com/billing/docs/how-to/disable-billing-with-notifications)
- [Cloud Billing access control and permissions](https://docs.cloud.google.com/billing/docs/how-to/billing-access)
- [Set up Cloud Billing data export to BigQuery](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-setup)
- [Understand the Cloud Billing data tables in BigQuery](https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables)
- [Labels overview](https://docs.cloud.google.com/resource-manager/docs/labels-overview)
- [Unattended project recommender](https://docs.cloud.google.com/recommender/docs/unattended-project-recommender)
- [View and apply idle VM recommendations](https://docs.cloud.google.com/compute/docs/instances/viewing-and-applying-idle-vm-recommendations)
- [Apply machine type recommendations to VM instances](https://docs.cloud.google.com/compute/docs/instances/apply-machine-type-recommendations-for-instances)
- [Free Google Cloud features and trial offer](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)
