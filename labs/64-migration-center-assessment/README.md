---
id: 64-migration-center-assessment
title: Assess a sample inventory with Migration Center
objectives: ["1.4"]
minutes: 60
cost: "No charge. Google says that you can run a cost estimate and create an assessment in Migration Center at no cost. Report exports go to your Google Drive or to local files."
requiresOrg: true
---

## Goal

Import a six-server on-premises inventory into Migration Center from CSV files. Group the servers, compare three sets of migration preferences in a TCO report, and export the result.

## Exam relevance

- Migration Center is the Google tool for discovery, assessment, and TCO in the assess phase. A manual CSV or RVTools import gives a first assessment without a collector ([Planning a migration](note:1.4-migration-planning)).
- Groups and waves come from the same inventory. A group is usually one application or one migration wave ([Planning a migration](note:1.4-migration-planning)).
- Tenancy, OS licenses, and the pricing track change the TCO. Windows Server BYOL needs sole-tenant nodes ([Licensing and financial impact of a migration](note:1.4-licensing-and-financials)).
- Rightsizing uses performance data. The sizing strategy changes the cost, and it can change performance ([Licensing and financial impact of a migration](note:1.4-licensing-and-financials), [Cost optimization](note:4.2-cost-optimization)).

## Before you start

- Complete `labs/00-setup`. It creates the lab project and the `pca-lab` gcloud configuration.
- IAM: if you created the project, you already have all the permissions to activate Migration Center and manage its resources ([Migration Center IAM roles and permissions](https://docs.cloud.google.com/migration-center/docs/roles-and-permissions)).
- Organization: the docs say that Migration Center needs an organization. Read the "No organization?" section first.
- Region: Migration Center stores its data in one region that you select at activation. You cannot change the region later ([Get started with Migration Center](https://docs.cloud.google.com/migration-center/docs/get-started-with-migration-center)). Only some regions are available, for example `us-central1` and `europe-west1` ([Migration Center locations](https://docs.cloud.google.com/migration-center/docs/locations)).
- Tools: the gcloud CLI, `python3`, and a browser that is signed in with the same account.
- Time: about 60 minutes.

Migration Center has no gcloud commands. The steps use the console, and the checks and the teardown call the REST API ([Migration Center API](https://docs.cloud.google.com/migration-center/docs/api)).

## No organization?

The get-started page says: "To start using Google Cloud Migration Center, you need to create an organization and a project in Google Cloud" ([Get started with Migration Center](https://docs.cloud.google.com/migration-center/docs/get-started-with-migration-center)). Your account has no organization. Try the activation in step 3. If it fails, do these parts at project level:

1. Do steps 1 and 2. Compare each column in the sample files with the [import file specifications](https://docs.cloud.google.com/migration-center/docs/import-data-tables).
2. Do step 10. The rapid cost estimate does not need activation ([Start a cost estimation](https://docs.cloud.google.com/migration-center/docs/estimate/start-estimation)).
3. Answer the Explore questions from the [server preferences](https://docs.cloud.google.com/migration-center/docs/server-preferences) page.

To get an organization:

- Sign up for Cloud Identity Free. You need a domain name and access to its domain registrar ([Set up Cloud Identity as a Google Cloud admin](https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin)).
- After you associate the account with a domain, Google creates the organization resource. Projects that you created before stay under "No organization", and you can move them into the organization ([Set up a Google Cloud organization resource](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization)).
- A Google Cloud partner can also create a project for you in their organization, or get an Enterprise Trial for you ([Get started with Migration Center](https://docs.cloud.google.com/migration-center/docs/get-started-with-migration-center)).

## Steps

1. Open a lab shell, enable the Migration Center API, and select the Migration Center region. The console and the REST calls in this lab use the API.

```bash
source labs/env.sh
gcloud services enable migrationcenter.googleapis.com
export MC_REGION="$REGION"
export MC_API="https://migrationcenter.googleapis.com/v1/projects/$PROJECT_ID/locations/$MC_REGION"
echo "Select this region when you activate Migration Center: $MC_REGION"
```

If `$REGION` is not on the [Migration Center locations](https://docs.cloud.google.com/migration-center/docs/locations) page, set `MC_REGION` to a listed region, for example `us-central1`. Then run the `export MC_API=...` line again.

2. Read the sample inventory. The files use the Google templates for manual import: `vmInfo.csv` is required, and `perfInfo.csv` and `diskInfo.csv` are optional ([Manually create and upload data tables](https://docs.cloud.google.com/migration-center/docs/import-data-tables)).

```bash
cut -d, -f2,7,10,11,15 labs/64-migration-center-assessment/inventory/vmInfo.csv | column -s, -t
head -3 labs/64-migration-center-assessment/inventory/perfInfo.csv
```

The inventory describes one web application and two back-office servers:

| Server | Role | vCPUs | Memory | Pattern in `perfInfo.csv` |
|---|---|---|---|---|
| `lab64-web-1`, `lab64-web-2` | Web tier, Ubuntu | 4 | 16 GiB | CPU peaks below 20% |
| `lab64-app-1` | Application tier, RHEL | 8 | 32 GiB | CPU peaks at about 40% |
| `lab64-db-1` | MySQL host, RHEL | 16 | 128 GiB | Memory peaks at about 90% |
| `lab64-files-1` | File server, Windows Server 2019 | 4 | 16 GiB | 4,000 GiB of disk, CPU below 10% |
| `lab64-batch-1` | Nightly batch, Ubuntu | 16 | 64 GiB | 3% CPU in the day, 85% from 01:00 to 05:00 |

3. Activate Migration Center in the console. Activation is a one-time action that turns on the APIs and sets the region for your data ([Migration Center IAM roles and permissions](https://docs.cloud.google.com/migration-center/docs/roles-and-permissions)).

```bash
echo "https://console.cloud.google.com/migration?project=$PROJECT_ID"
```

   1. Open the URL. If the page asks you to enable the required APIs, click **Enable APIs**.
   2. From the **Region** list, select the region from step 1. You cannot change it later.
   3. For the Expert Request number, click **Skip**.
   4. To accept the default migration preferences, click **Next**.
   5. Click **Continue**.

4. Upload the three files as one file import job. Migration Center validates the files, and then it creates one asset for each server.

```bash
echo "https://console.cloud.google.com/migration/discovery/dataImport?project=$PROJECT_ID"
ls labs/64-migration-center-assessment/inventory
```

   1. Click **Add data** > **Upload files**.
   2. In **Set up file upload**, enter the name `lab64-inventory`.
   3. From the **File format** list, select **Manually populated CSV templates**.
   4. Click **Select files to upload**. Select `vmInfo.csv`, `perfInfo.csv`, and `diskInfo.csv` from `labs/64-migration-center-assessment/inventory`.
   5. Click **Upload files**, and wait for the validation.
   6. Click **Import data**, and then click **Confirm**.

   If the validation fails, open the import job to read the errors ([Manage file uploads](https://docs.cloud.google.com/migration-center/docs/manage-file-uploads)).

5. List the imported servers. Make sure that all six servers and their performance data arrived before you build a report.

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "$MC_API/assets?view=ASSET_VIEW_FULL" \
  | python3 -c 'import json,sys; [print(a.get("machineDetails",{}).get("machineName",a["name"])) for a in json.load(sys.stdin).get("assets",[])]'
```

   In the console, open **Assets** > **Servers**, and click `lab64-web-1`. The **Performance** tab shows the daily CPU and memory use. The **Insights** tab shows the Google Cloud products that the server can move to, with a fit score ([View the collected assets](https://docs.cloud.google.com/migration-center/docs/view-assets)).

6. Create two groups. A TCO report compares groups, and you usually make one group for each application or migration wave ([Group assets](https://docs.cloud.google.com/migration-center/docs/create-groups)).

```bash
echo "https://console.cloud.google.com/migration/discovery/groups?project=$PROJECT_ID"
```

   1. Click **Create group**. For **Name**, enter `lab64-storefront`. Keep the generated ID, and click **Next**.
   2. Select `lab64-web-1`, `lab64-web-2`, `lab64-app-1`, and `lab64-db-1`. Click **Create**.
   3. Create a second group, `lab64-back-office`, with `lab64-files-1` and `lab64-batch-1`.

   A group name must start and end with a lowercase letter. It can contain only lowercase letters, numbers, and dashes.

7. Create three preference sets. Each set is one scenario, and one TCO report can compare up to four sets for each group ([Create and manage migration preferences](https://docs.cloud.google.com/migration-center/docs/migration-preferences)).

```bash
echo "https://console.cloud.google.com/migration/preferences?project=$PROJECT_ID"
echo "Target region for the VMs: $REGION"
```

   For each row, click **Create migration preferences**. Enter the name, and set **Location** to your region. For the server target product, select **Google Compute Engine**. Set the values in the table, and then click **Create**.

   | Name | Tenancy | Product pricing track | Sizing method | Windows Server license |
   |---|---|---|---|---|
   | `lab64-as-is-on-demand` | Multi-tenant | On demand | No rightsizing | Pay-as-you-go (the only option) |
   | `lab64-rightsized-3y-cud` | Multi-tenant | 3-year resource-based CUD | Moderate | Pay-as-you-go (the only option) |
   | `lab64-sole-tenant-byol` | Sole-tenant, any node type in the list | 3-year resource-based CUD | Moderate | Bring your own license (BYOL) |

   Sources: [Migration preferences for servers](https://docs.cloud.google.com/migration-center/docs/server-preferences).

8. Generate the TCO report. The report prices each group for each preference set, so you compare the scenarios side by side ([Generate TCO reports](https://docs.cloud.google.com/migration-center/docs/generate-tco-report)).

```bash
echo "https://console.cloud.google.com/migration/all-reports?project=$PROJECT_ID"
```

   1. Click **TCO and detailed pricing reports**.
   2. Enter the name `lab64-tco`, and click **Next**.
   3. Select `lab64-storefront` and `lab64-back-office`, and click **Next**.
   4. Assign the three `lab64-` preference sets, and select **Apply to all groups**.
   5. Click **Generate report**. The report can take a few minutes.

9. Read and export the report. The Google Slides export is a summary for decision makers, and the detailed pricing report lists the cost of each asset ([Generate TCO reports](https://docs.cloud.google.com/migration-center/docs/generate-tco-report)).

```bash
echo "https://console.cloud.google.com/migration/reports?project=$PROJECT_ID"
```

   1. Open `lab64-tco`. For each group, compare the total cost of the three preference sets.
   2. Click **Export report** > **Export TCO report to Google Slides**, and then click **Open report**.
   3. Click **Export report** > **Export detailed pricing report to CSV/Google Sheets**, and then click **Download**.
   4. In the CSV file for servers, find the recommended target VM for `lab64-web-1` in each scenario.

10. Optional: make a rapid cost estimate with totals only. A rapid estimate needs no inventory and no activation, so you can compare it with the report that uses data for each server ([Cost estimation overview](https://docs.cloud.google.com/migration-center/docs/estimate/overview), [Start a cost estimation](https://docs.cloud.google.com/migration-center/docs/estimate/start-estimation)).

```bash
echo "https://console.cloud.google.com/migration/spend?project=$PROJECT_ID"
```

   1. Enter the name `lab64-estimate`. On the **On-premise** card, click **Add to estimate**, and then click **Start estimate**.
   2. On the **On-premise** card, click **Start**. For **Location**, select your region, and click **Next**.
   3. For **Number of vCPUs**, enter `52`. For **Total storage (TB)**, enter `7`. Enter `57` for **% File Storage**, `43` for **% Block Storage**, and `0` for **% Object Storage**.
   4. Continue with the default values to the results. Compare the total with the TCO report.

   The inputs come from the sample: 52 vCPUs, about 7,000 GiB of disk, and a 4,000 GiB file server ([Specify infrastructure details](https://docs.cloud.google.com/migration-center/docs/estimate/infrastructure-details)).

## Check your work

1. The six servers exist:

```bash
curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "$MC_API/assets?view=ASSET_VIEW_FULL" \
  | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("assets",[])), "assets")'
```

Expect `6 assets` in a project that has no other Migration Center data.

2. The groups and preference sets exist:

```bash
for c in groups preferenceSets; do
  curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" "$MC_API/$c" \
    | python3 -c 'import json,sys; [print(i["name"].rsplit("/",1)[-1], i.get("displayName","")) for v in json.load(sys.stdin).values() if isinstance(v,list) for i in v]'
done
```

Expect `lab64-storefront` and `lab64-back-office`. Expect the three `lab64-` preference sets and the default set from the activation.

3. On the **Reports** page, open `lab64-tco`. It shows a cost for each group and each preference set. For each group, note which set costs the least. You pay for all the vCPUs and memory of a sole-tenant node, so a small group can cost more on sole-tenant nodes ([Sole-tenancy overview](https://docs.cloud.google.com/compute/docs/nodes/sole-tenant-nodes)).

## Explore

1. Why can only `lab64-sole-tenant-byol` use your own Windows Server licenses for `lab64-files-1`?

   <details><summary>Answer</summary>

   Multi-tenant Compute Engine supports only pay-as-you-go licenses for Windows Server. Sole-tenant nodes support both BYOL and pay-as-you-go. When you select BYOL, Migration Center does not include a license charge ([Migration preferences for servers](https://docs.cloud.google.com/migration-center/docs/server-preferences)). Your license terms must still allow the move; see [Licensing and financial impact of a migration](note:1.4-licensing-and-financials).

   </details>

2. `lab64-batch-1` uses 3% CPU in the day, but 85% during a nightly job. Why does the Moderate sizing method not shrink it to a very small VM?

   <details><summary>Answer</summary>

   The Moderate and Aggressive methods use the 95th percentile as the metrics baseline. The nightly peaks are more than 5% of the samples, so the peak sets the size. A size based on the average would be too small for the nightly job ([Migration preferences for servers](https://docs.cloud.google.com/migration-center/docs/server-preferences)).

   </details>

3. Suppose that you import only `vmInfo.csv`, with no performance data. How does Migration Center size the servers, and how does the report show this?

   <details><summary>Answer</summary>

   Migration Center uses utilization estimates for assets without performance data. The defaults are 70% CPU, 75% memory, and 75% disk. You can also size on the 100% provisioned shape instead ([Migration preferences for servers](https://docs.cloud.google.com/migration-center/docs/server-preferences)). The TCO report shows how many assets use estimates instead of performance data ([Generate TCO reports](https://docs.cloud.google.com/migration-center/docs/generate-tco-report)).

   </details>

4. The application moves in waves over 18 months, and the team can change machine types after the move. Which pricing track is safer for the TCO than a 3-year resource-based CUD?

   <details><summary>Answer</summary>

   A flexible CUD. You commit to a minimum hourly spend that applies across machine types and regions. A resource-based CUD commits to specific resources in one region. Note that the default track, **No preference**, is a 3-year resource-based CUD ([Migration preferences for servers](https://docs.cloud.google.com/migration-center/docs/server-preferences)).

   </details>

## Clean up

```bash
bash labs/64-migration-center-assessment/teardown.sh
```

If you used a region other than `$REGION`, run `MC_REGION=<region> bash labs/64-migration-center-assessment/teardown.sh`.

The script deletes:

- The report `lab64-tco` and its report configuration
- The groups `lab64-storefront` and `lab64-back-office`
- The three `lab64-` preference sets
- The file import job `lab64-inventory`. Deleting a file import job also reverts the asset changes that it made ([Manage file uploads](https://docs.cloud.google.com/migration-center/docs/manage-file-uploads)).
- Any asset whose machine name starts with `lab64-`

The script keeps the activation, the region, the default preference set, and the enabled API. Delete the exported Google Slides and Google Sheets files from your Google Drive yourself.

## Docs used

- [Get started with Migration Center](https://docs.cloud.google.com/migration-center/docs/get-started-with-migration-center)
- [Migration Center IAM roles and permissions](https://docs.cloud.google.com/migration-center/docs/roles-and-permissions)
- [Migration Center locations](https://docs.cloud.google.com/migration-center/docs/locations)
- [Manually create and upload data tables](https://docs.cloud.google.com/migration-center/docs/import-data-tables)
- [Manage file uploads](https://docs.cloud.google.com/migration-center/docs/manage-file-uploads)
- [View the collected assets](https://docs.cloud.google.com/migration-center/docs/view-assets)
- [Group assets](https://docs.cloud.google.com/migration-center/docs/create-groups)
- [Create and manage migration preferences](https://docs.cloud.google.com/migration-center/docs/migration-preferences)
- [Migration preferences for servers](https://docs.cloud.google.com/migration-center/docs/server-preferences)
- [Generate TCO reports](https://docs.cloud.google.com/migration-center/docs/generate-tco-report)
- [Sole-tenancy overview](https://docs.cloud.google.com/compute/docs/nodes/sole-tenant-nodes)
- [Cost estimation overview](https://docs.cloud.google.com/migration-center/docs/estimate/overview)
- [Start a cost estimation](https://docs.cloud.google.com/migration-center/docs/estimate/start-estimation)
- [Specify infrastructure details](https://docs.cloud.google.com/migration-center/docs/estimate/infrastructure-details)
- [Migration Center API](https://docs.cloud.google.com/migration-center/docs/api)
- [Migration Center REST reference: assets.batchDelete](https://docs.cloud.google.com/migration-center/docs/reference/rest/v1/projects.locations.assets/batchDelete)
- [Set up Cloud Identity as a Google Cloud admin](https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin)
- [Set up a Google Cloud organization resource](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization)
