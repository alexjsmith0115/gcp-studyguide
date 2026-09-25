---
id: 02-gemini-cloud-assist
title: Explore Gemini Cloud Assist
objectives: ["1.2", "5.1"]
minutes: 45
cost: "About $0. The Gemini Cloud Assist chat has no cost while it is in Preview. The lab creates an empty bucket and a service account; Cloud Storage charges for stored data and IAM is free. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Set up Gemini Cloud Assist in your lab project and use it for architect tasks: inventory, IAM questions, a design draft, a log summary, cost questions, and data-governance settings. Check each answer against a second source, and see where the limits of the tool are.

## Exam relevance

- Who can use Gemini Cloud Assist, with which roles, and why it sees only what the user can see: [Gemini Cloud Assist](note:1.2-gemini-cloud-assist).
- Which projects must not enable it (data residency and CMEK), and what the admin settings control: [Gemini Cloud Assist](note:1.2-gemini-cloud-assist) and [Designing for compliance](note:3.2-compliance).
- Why you validate generated designs and code before a team uses them: [Advising teams: deployment and APIs](note:5.1-deployment-and-apis).
- Why Gemini cost answers are not chargeback numbers: [Cost optimization](note:4.2-cost-optimization).
- Why investigations need more than a project: [Testing and troubleshooting](note:4.1-testing-and-troubleshooting).

## Before you start

- Finish `labs/00-setup`. You are the Owner of the lab project.
- Time: about 45 minutes. Most steps use the Google Cloud console.
- The lab grants five roles to your user. `teardown.sh` removes these five bindings. If you had one of these roles before the lab, grant it again after teardown.

Open a shell in the repo root, then enable the APIs. Gemini Cloud Assist needs its own API and four supporting APIs. The Recommender API lets the chat show recommendations.

```bash
source labs/env.sh
gcloud services enable geminicloudassist.googleapis.com cloudasset.googleapis.com \
  designcenter.googleapis.com appoptimize.googleapis.com apphub.googleapis.com \
  recommender.googleapis.com --project="$PROJECT_ID"
```

What this lab cannot show without an organization or Premium Support:

| Feature | Why the lab skips it |
|---|---|
| Investigations | Since April 10, 2026, they need a Premium Support contract or access from your account team |
| Proactive agents for alerts and cost anomalies | Private Preview for Premium Support customers; the agent identity belongs to an organization |
| Application-level views and folder setup | They need a folder configured for application management, and folders need an organization |
| Design iteration on the Application Design Center canvas | Gemini Cloud Assist does not support the single-project boundary. The design still opens in preview mode, where **Get Code** downloads the Terraform. |

## Steps

1. Grant yourself the roles that the docs name for chat, resource discovery, cost analysis, recommendations, and settings. Gemini Cloud Assist acts with your permissions, so it can answer only about what these roles allow.

```bash
export LAB_USER="$(gcloud config get-value account)"
for ROLE in roles/geminicloudassist.user roles/cloudasset.viewer \
  roles/cloudhub.operator roles/recommender.viewer roles/cloudaicompanion.settingsAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="user:${LAB_USER}" --role="$ROLE" --condition=None --quiet >/dev/null
done
```

2. Create a labeled bucket and a bucket-level IAM grant, so that you have facts to ask about and to check. If the binding fails because the service account is new, wait one minute and run the last command again.

```bash
export LAB_BUCKET="gs://lab02-${PROJECT_ID}"
gcloud storage buckets create "$LAB_BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud storage buckets update "$LAB_BUCKET" --update-labels=team=lab02,env=study
gcloud iam service-accounts create lab02-reader --display-name="Lab 02 reader"
gcloud storage buckets add-iam-policy-binding "$LAB_BUCKET" \
  --member="serviceAccount:lab02-reader@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/storage.objectViewer
```

3. Open the Cloud Assist panel, so that you can confirm the setup. Open the URL that the command prints. In the console toolbar, click **Open or close Gemini Cloud Assist chat** (the spark icon). Read the notice about validation of output.

```bash
echo "https://console.cloud.google.com/home?project=${PROJECT_ID}"
```

4. Ask inventory and IAM questions, then check the answers with Cloud Asset Inventory. Paste the prompts that the command prints, one at a time. The answer often includes an equivalent query; compare it with the command below. New resources can take a few minutes to appear in Cloud Asset Inventory.

```bash
echo "List the Cloud Storage buckets in this project with their locations and labels."
echo "Which principals have roles on the bucket lab02-${PROJECT_ID}, and which roles?"
echo "List all config changes in the last 24 hours."
gcloud asset search-all-resources --scope="projects/${PROJECT_ID}" \
  --query="labels.team:*" --format="table(name.basename(),assetType,location)"
gcloud storage buckets get-iam-policy "$LAB_BUCKET" --format=yaml
```

5. Ask for code, then review it before any use. Paste the prompt. Do not run the answer. Check it against each requirement in the prompt.

```bash
echo "Give me a Terraform configuration for a Cloud Storage bucket in ${REGION} with uniform bucket-level access, a lifecycle rule that deletes objects after 30 days, and the label team=lab02."
export LAB_TF_DIR="$(mktemp -d)"
echo "Save the Terraform answer as ${LAB_TF_DIR}/main.tf"
```

Optional: validate the saved file. The init command downloads the Google provider. `terraform validate` checks syntax only; it does not check your requirements, and it creates no resources.

```bash
terraform -chdir="$LAB_TF_DIR" init -backend=false
terraform -chdir="$LAB_TF_DIR" validate
```

6. Ask for a design draft, so that you see how requirements become an architecture. Paste the prompt. Review the diagram and the purpose of each component. If the answer shows **Edit App Design**, click it: without Application Design Center access, the design opens in preview mode. Click **Get Code** to download the Terraform. Do not deploy it. Write down each requirement that the draft does not meet.

```bash
echo "Help me design a highly available web application with a Java backend on Cloud Run and a Cloud SQL for PostgreSQL database in ${REGION}. Traffic is bursty, so it must scale up and down fast."
```

7. Summarize an audit log entry, so that you see how Gemini explains who did what. The command shows the Admin Activity entries for your bucket and their method names. Open Logs Explorer and find the entry that records the IAM change from step 2. Click **Expand**, and then click **Investigate log**. If your account does not show that button, go to the next step.

```bash
gcloud logging read "resource.type=\"gcs_bucket\" AND logName:\"cloudaudit.googleapis.com%2Factivity\"" \
  --freshness=1d --limit=5 \
  --format="table(timestamp,protoPayload.methodName,protoPayload.authenticationInfo.principalEmail)"
echo "https://console.cloud.google.com/logs/query?project=${PROJECT_ID}"
```

8. Ask cost and optimization questions, so that you see which data the answers use. Open the Cloud Hub **Optimization** page at the URL that the command prints. Then paste the prompts in the chat. A new project has little cost data, so short answers are normal. Note that cost totals use contract prices before committed use discounts and credits.

```bash
echo "https://console.cloud.google.com/cloud-hub/optimization?project=${PROJECT_ID}"
echo "Show me the top 5 resources that cost me the most last month."
echo "Give me recommendations to reduce my resource costs."
```

9. Review the data-governance settings and set a custom instruction, so that you know what an admin controls. In the Cloud Assist panel, click **More actions**, then **Cloud Assist Settings**. Write down the value of each setting: grounding, page context sharing, prompt and response sharing, proactive agents, and custom instructions. Paste the instruction that the command prints into **Custom instructions**, save, and ask the design prompt from step 6 again. Compare the two answers.

```bash
echo "You advise a cost-conscious cloud architect. For each recommendation, name the Google Cloud Well-Architected Framework pillar that it supports, and state one trade-off."
```

## Check your work

```bash
gcloud services list --enabled --filter="config.name=geminicloudassist.googleapis.com" \
  --format="value(config.name)"
```

Expected: `geminicloudassist.googleapis.com`

```bash
gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
  --filter="bindings.members:user:${LAB_USER} AND bindings.role:roles/geminicloudassist.user" \
  --format="value(bindings.role)"
```

Expected: `roles/geminicloudassist.user`

```bash
gcloud storage buckets describe "$LAB_BUCKET" --format="value(labels)"
```

Expected: a line that contains `env` = `study` and `team` = `lab02`.

In step 9, you should see these defaults: Grounding with Google Search, page context sharing enabled, prompt and response sharing disabled, and proactive agents disabled.

## Explore

1. A hospital wants Gemini Cloud Assist for its operations team. Its patient-records project must keep data in one country and use CMEK. What do you recommend?

<details><summary>Answer</summary>

Keep the Gemini Cloud Assist API disabled in the patient-records project. Gemini Cloud Assist can store data in any Google Cloud data center, and it supports neither CMEK nor data residency at rest. Enable it in projects without these requirements. A VPC Service Controls perimeter or Web Grounding for Enterprise does not change this.

</details>

2. You granted yourself five roles. Which roles do you give to 50 developers, and why not Gemini Cloud Assist Admin?

<details><summary>Answer</summary>

Give Gemini Cloud Assist User and Cloud Asset Viewer, plus product roles for their tasks (for example Cloud Hub Operator for cost analysis). Gemini acts with each developer's own permissions. The Admin role also controls data sharing and proactive agents, so keep it for a small admin group.

</details>

3. The design draft from step 6 missed a requirement. How do you stop a team from deploying drafts like this without review?

<details><summary>Answer</summary>

Treat the draft as input to a governed process. In an organization, platform teams publish approved Application Design Center templates in a catalog, assess designs against security policies, and deploy through a reviewed pipeline. Custom instructions can add standards to every answer. `terraform validate` checks syntax, not requirements.

</details>

4. A company with Premium Support runs one application across three projects. It wants one investigation for the whole application. What must be true?

<details><summary>Answer</summary>

The three projects must be in a folder that is configured for application management, and the resources must be registered as one App Hub application. An investigation covers one project or one App Hub application. Application-level results go to the management project. Folders need an organization.

</details>

## Clean up

First, do these steps in the console, while the API is still enabled:

1. In the Cloud Assist panel, open **More actions** > **Show chat history**, and delete the lab chats. Otherwise, chats are deleted after 180 days.
2. In **Cloud Assist Settings**, delete the custom instruction.

Then delete the temporary Terraform folder and run the script:

```bash
rm -rf "${LAB_TF_DIR:-/nonexistent}"
bash labs/02-gemini-cloud-assist/teardown.sh
```

The script deletes:

- the bucket `lab02-<project ID>` and its IAM policy
- the service account `lab02-reader`
- the five project role bindings for your user from step 1
- the Gemini Cloud Assist API enablement (`geminicloudassist.googleapis.com`)

The other APIs from "Before you start" stay enabled. Service Usage, which enables APIs, is free of charge.

## Docs used

- [Gemini Cloud Assist overview](https://docs.cloud.google.com/cloud-assist/overview)
- [Set up Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/set-up-gemini)
- [IAM requirements for using Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/iam-requirements)
- [Use Gemini Cloud Assist in the Google Cloud console](https://docs.cloud.google.com/cloud-assist/chat-panel)
- [Design an application with Gemini assistance](https://docs.cloud.google.com/cloud-assist/design-application)
- [Troubleshoot issues with Gemini Cloud Assist investigations](https://docs.cloud.google.com/cloud-assist/investigations)
- [Set up Proactive Mode](https://docs.cloud.google.com/cloud-assist/proactive-agents-setup)
- [Set up Application Design Center](https://docs.cloud.google.com/application-design-center/docs/setup)
- [Configure administrator settings](https://docs.cloud.google.com/cloud-assist/admin-settings)
- [Configure custom instructions](https://docs.cloud.google.com/cloud-assist/custom-instructions)
- [Configure grounding](https://docs.cloud.google.com/cloud-assist/configure-grounding)
- [Turn off Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/turn-off)
- [Certifications and security for Gemini products](https://docs.cloud.google.com/gemini/docs/discover/certifications)
- [View and analyze log entries](https://docs.cloud.google.com/logging/docs/view/logs-explorer-interface)
- [Cloud Audit Logs with Cloud Storage](https://docs.cloud.google.com/storage/docs/audit-logging)
- [Search for resources](https://docs.cloud.google.com/asset-inventory/docs/search-resources)
- [Optimize costs with Gemini assistance](https://docs.cloud.google.com/hub/docs/optimize-gemini)
- [Set up Cloud Hub](https://docs.cloud.google.com/hub/docs/setup-cloud-hub)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
- [IAM pricing](https://cloud.google.com/iam/pricing)
- [Service Usage pricing](https://cloud.google.com/service-usage/pricing)
