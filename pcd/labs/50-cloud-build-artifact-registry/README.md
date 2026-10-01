---
id: 50-cloud-build-artifact-registry
title: "Build with Cloud Build, store in Artifact Registry, and scan for vulnerabilities"
objectives: ["2.2", "1.2"]
minutes: 50
cost: "About $0.80 if you run teardown.sh when done, plus about $0.50 for the optional rebuild in Explore. Each vulnerability scan costs $0.26, and the steps run two on-demand scans and one automatic scan. Cloud Build (2,500 build-minutes each month) and Artifact Registry (0.5 GiB of storage each month) have free tiers."
requiresOrg: false
---

## Goal

Build a container image with a `cloudbuild.yaml` file and your own build service account. The build scans the image with On-Demand Scanning and pushes it to Artifact Registry only if no vulnerability has a blocked severity. Then you read the results of automatic scanning.

## Exam relevance

- `cloudbuild.yaml` steps, substitutions, the `images` field, and the logging option for a user-specified service account. See [Building containers with Cloud Build and storing them in Artifact Registry](note:2.2-cloud-build-artifact-registry).
- A build service account with only the roles that the build needs, each granted on the smallest resource. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).
- Automatic scanning compared with On-Demand Scanning, effective severity, and the response to a finding. See [Protecting apps and finding vulnerabilities](note:1.2-protect-and-scan).
- A multi-stage Dockerfile with a slim base image and a user other than root. See [Building and refactoring containers for Cloud Run and GKE](note:1.1-containers).
- Images that Cloud Build pushes with the `images` field get build provenance. See [Build provenance and Binary Authorization](note:2.2-provenance-binary-authorization).

## Before you start

- Complete [00-setup](lab:00-setup) first. It makes `source pcd/labs/env.sh` work and enables the base APIs.
- **IAM:** you are the Owner of the lab project. Without Owner, you need roles to start builds (Cloud Build Editor), manage repositories (Artifact Registry Administrator), create buckets and service accounts, and grant roles. You also need the `iam.serviceAccounts.actAs` permission on the build service account, for example through Service Account User (`roles/iam.serviceAccountUser`).
- **Tools:** the gcloud CLI. You do not need Docker. Cloud Build makes the image.
- **Time:** about 50 minutes. Each build takes a few minutes.
- **Scan charges:** while the Container Scanning API is on, Artifact Analysis scans each new image that you push to a Docker repository. Each scan costs $0.26. `teardown.sh` turns the API off.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs. The Container Scanning API turns on automatic scanning, and it also enables the Container Analysis API, which stores the results. The On-Demand Scanning API lets a build scan an image before the push.

```bash
source pcd/labs/env.sh
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com \
  storage.googleapis.com iam.googleapis.com \
  containerscanning.googleapis.com ondemandscanning.googleapis.com
```

## Steps

1. Create a Docker repository in your region. When the Container Scanning API is on, automatic scanning is on for standard Docker repositories, unless you turn it off for a repository.

```bash
export REPO=lab50-repo
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/lab50-app"
gcloud artifacts repositories create "$REPO" --repository-format=docker \
  --location="$REGION" --description="lab50 images"
gcloud artifacts repositories describe "$REPO" --location="$REGION" \
  --format='yaml(name,format,vulnerabilityScanningConfig)'
```

The output shows `enablementState: SCANNING_ACTIVE`. To turn scanning off for one repository, use `--disable-vulnerability-scanning` on `create` or `update`. Labs 51 and 52 do this, so that their images cause no scan charges.

2. Create a bucket for the build source, and a service account for the build. Then check which service account Cloud Build uses when you do not choose one.

```bash
export BUCKET="gs://lab50-${PROJECT_ID}"
gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud iam service-accounts create lab50-builder --display-name="lab50 build service account"
export BUILD_SA="lab50-builder@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud builds get-default-service-account --region="$REGION"
```

`gcloud builds submit` uploads the source folder as an archive to Cloud Storage, and the build reads it from there. Without a flag, gcloud uses the `PROJECT_ID_cloudbuild` bucket. This lab uses its own bucket, so that the build service account gets read access to one bucket only.

The last command prints the default build service account. A project that ran its first build after the change of May and June 2024 uses the Compute Engine default service account. That account can have broad roles, so Google recommends that you specify your own service account for builds.

3. Grant the build service account the roles that this build needs, each on the smallest resource. If a command fails because the service account does not exist yet, wait one minute and run it again.

| Role | Granted on | Why the build needs it |
|---|---|---|
| Storage Object Viewer (`roles/storage.objectViewer`) | The source bucket | Read the uploaded source archive |
| Artifact Registry Writer (`roles/artifactregistry.writer`) | The `lab50-repo` repository | Push the image through the `images` field |
| Logs Writer (`roles/logging.logWriter`) | The project | Write the build logs to Cloud Logging |
| On-Demand Scanning Admin (`roles/ondemandscanning.admin`) | The project | Call the On-Demand Scanning API in the `scan` step |

```bash
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/storage.objectViewer
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/artifactregistry.writer
for role in roles/logging.logWriter roles/ondemandscanning.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${BUILD_SA}" --role="$role" --condition=None > /dev/null
done
```

You start the build as yourself, so you need permission to act as `lab50-builder`. The Owner role includes it.

4. Read the Dockerfile and the build config while the role grants take effect.

```bash
cat pcd/labs/50-cloud-build-artifact-registry/Dockerfile
cat pcd/labs/50-cloud-build-artifact-registry/cloudbuild.yaml
```

Points to notice:

- **Dockerfile.** The first stage installs the Python packages into a virtual environment. The second stage copies only that environment and `main.py` onto a fresh `python:3.12-slim` image. The `USER 10001` line makes the app run as a user other than root.
- **`build` step.** Each step runs in a container. The `docker` builder builds the image, but no step pushes it.
- **`scan` step.** It scans the local image with On-Demand Scanning and counts the vulnerabilities by effective severity. If one of them matches `_BLOCK_SEVERITY`, the step exits with 1, and the build fails.
- **`images` field.** Cloud Build pushes the image only after all steps succeed. So a failed scan step means no push.
- **Substitutions.** `$PROJECT_ID` and `$LOCATION` are default substitutions. `_TAG` and `_BLOCK_SEVERITY` are user-defined, with defaults in the file. A build from local files has no commit, so `$SHORT_SHA` would be empty here.
- **`options.logging`.** With a user-specified service account, the build logs must go to Cloud Logging (`CLOUD_LOGGING_ONLY`) or to a bucket that you own.

5. Run the build. `--region` selects the region of the build, which sets `$LOCATION`, so the image goes to the repository in your region. `--service-account` selects the build service account.

```bash
gcloud builds submit pcd/labs/50-cloud-build-artifact-registry \
  --config=pcd/labs/50-cloud-build-artifact-registry/cloudbuild.yaml \
  --region="$REGION" \
  --substitutions=_TAG=v1 \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
```

The log shows the two steps. The `scan` step prints the number of vulnerabilities for each effective severity, for example `12 LOW`. Then Cloud Build pushes the image. At the end, gcloud prints a table with the image and the status `SUCCESS`.

If the `scan` step blocks the image, the base image has a vulnerability with effective severity `CRITICAL` today. Read the counts in the log. Then run the command again with `--substitutions=_TAG=v1,_BLOCK_SEVERITY=NONE`, so that you can continue the lab. Explore question 1 shows the usual fix. If the build fails with a permission error, wait one minute and run it again.

6. List the images and tags in the repository, and get the digest of `v1`. A tag is a movable name. The digest identifies one exact image, and scans and attestations belong to the digest.

```bash
gcloud artifacts docker images list "$IMAGE" --include-tags
gcloud artifacts docker tags list "$IMAGE"
export DIGEST_URL="$(gcloud artifacts docker images describe "${IMAGE}:v1" \
  --format='value(image_summary.fully_qualified_digest)')"
echo "$DIGEST_URL"
```

There is one image with the tag `v1`. `DIGEST_URL` has the form `REGION-docker.pkg.dev/PROJECT_ID/lab50-repo/lab50-app@sha256:...`. Deploy by digest when you need exactly this image.

7. Read the results of automatic scanning. Artifact Analysis (formerly Container Analysis) scanned the image when the build pushed it. On-Demand Scanning results from step 5 are separate.

```bash
gcloud artifacts docker images list "$IMAGE" --show-occurrences
gcloud artifacts vulnerabilities list "$DIGEST_URL"
```

The first command shows a `VULNERABILITIES` column with counts for each severity. If the column is empty, the scan has not finished. Wait one minute and run the command again.

The second command lists each vulnerability with its CVE, `EFFECTIVE_SEVERITY`, `CVSS`, `FIX_AVAILABLE`, and `PACKAGE`. Compare the CVSS score with the effective severity. For an OS package, the effective severity comes from the maintainer of the Linux distribution, so a high CVSS score can have effective severity `LOW`. For a language package, it comes from the GitHub Advisory Database. The build gate in step 5 also uses the effective severity.

8. Make the gate block a build. Run the build again with every severity in `_BLOCK_SEVERITY`. This simulates a strict policy.

```bash
gcloud builds submit pcd/labs/50-cloud-build-artifact-registry \
  --config=pcd/labs/50-cloud-build-artifact-registry/cloudbuild.yaml \
  --region="$REGION" \
  --substitutions='_TAG=v1-strict,_BLOCK_SEVERITY=CRITICAL|HIGH|MEDIUM|LOW' \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
gcloud artifacts docker tags list "$IMAGE"
```

The `scan` step prints `Blocked: ...`, and the build ends with `FAILURE`. The tag list still shows only `v1`. Cloud Build did not push `v1-strict`, because a step failed. If the image has no vulnerabilities at all, this build passes. Then the gate has nothing to block.

## Check your work

```bash
gcloud builds list --region="$REGION" --limit=2 \
  --format='table(id,status,substitutions._TAG,serviceAccount)'
gcloud artifacts docker tags list "$IMAGE"
gcloud projects get-iam-policy "$PROJECT_ID" --flatten=bindings \
  --filter="bindings.members:serviceAccount:${BUILD_SA}" --format='value(bindings.role)'
gcloud artifacts repositories get-iam-policy "$REPO" --location="$REGION"
```

Expected output:

- Two builds: `v1-strict` with status `FAILURE`, and `v1` with status `SUCCESS`. Both ran as `lab50-builder`.
- One tag: `v1`.
- Two project-level roles for `lab50-builder`: `roles/logging.logWriter` and `roles/ondemandscanning.admin`.
- The repository policy grants `roles/artifactregistry.writer` to `lab50-builder`. The service account can push to this repository only.

## Explore

1. Automatic scanning reports a vulnerability with a fix in an OS package of `v1`. How do you respond, and why does a new tag on the same image not help?

<details><summary>Answer</summary>

Scans belong to the image digest. A new tag on the same digest does not start a new scan, and the image does not change. Fix the source instead:

1. Read the package, the effective severity, and the fixed version (`FIX_AVAILABLE` and the details in the console).
2. Change the `FROM` line to a base image version that has the fix, or update the package version in `requirements.txt`. Then build a new image.
3. The new image has a new digest, so automatic scanning scans it on push. Compare the results.
4. Deploy the new digest, and move all traffic to it. In Security Command Center, the finding for a Cloud Run service stays until no traffic goes to the revision with the vulnerable image.

For example, rebuild as `v2` and compare the two digests (about $0.52 for two more scans):

```bash
gcloud builds submit pcd/labs/50-cloud-build-artifact-registry \
  --config=pcd/labs/50-cloud-build-artifact-registry/cloudbuild.yaml \
  --region="$REGION" --substitutions=_TAG=v2 \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
gcloud artifacts docker images list "$IMAGE" --include-tags --show-occurrences
```

The on-demand scan in the build is the prevention: it stops the next vulnerable image before the push.

</details>

2. Every build adds an image version to the repository. How do you delete old versions safely?

<details><summary>Answer</summary>

Use cleanup policies on the repository. The file `cleanup-policy.json` has two policies. The delete policy matches untagged versions older than 7 days. The keep policy matches the 3 most recent versions. When a version matches both a delete policy and a keep policy, Artifact Registry keeps it. Test the policies with a dry run first:

```bash
gcloud artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" \
  --policy=pcd/labs/50-cloud-build-artifact-registry/cleanup-policy.json --dry-run
gcloud artifacts repositories list-cleanup-policies "$REPO" --location="$REGION"
```

A background job runs the policies, and changes take effect in about one day. A dry run deletes nothing. It writes the versions that it would delete to the Data Access audit logs. For this, turn on the data write type of Data Access audit logs for Artifact Registry. When the results are correct, apply the policies with `--no-dry-run`. To apply cleanup policies, you need the Artifact Registry Administrator role. You can apply them only to standard repositories, not to virtual repositories.

</details>

3. Why does the build use On-Demand Scanning, when automatic scanning also scans every pushed image?

<details><summary>Answer</summary>

Automatic scanning starts only after the push, so it cannot stop a vulnerable image from reaching the repository. On-Demand Scanning scans a local image during the build, so the build can fail before the push. Use each for its job:

| | Automatic scanning | On-Demand Scanning |
|---|---|---|
| Starts | On push to Artifact Registry | When you run `gcloud artifacts docker images scan` |
| Results over time | Updated with new vulnerability data while the image is pulled at least once in 30 days | Available for 48 hours, not updated |
| Typical use | Watch stored and deployed images | Gate a pipeline before the push |

The gate blocks only the severities that you list in `_BLOCK_SEVERITY`. You can also scan an image from your own shell with `gcloud artifacts docker images scan IMAGE --remote`. That command needs the gcloud `local-extract` component.

</details>

4. A teammate changes the tag in `cloudbuild.yaml` from `${_TAG}` to `${SHORT_SHA}`. Builds from a trigger work, but `gcloud builds submit` fails. Why?

<details><summary>Answer</summary>

`$SHORT_SHA`, `$COMMIT_SHA`, and `$BRANCH_NAME` are default substitutions only for builds that a trigger starts. A build from local files uploads an archive to Cloud Storage and has no commit, so Cloud Build replaces `$SHORT_SHA` with an empty string. The image name then ends with `:`, which is not a valid tag. For a manual build, pass the value yourself, for example `--substitutions=SHORT_SHA=abc1234`, or use a value that every build has, such as `$BUILD_ID`. Also remember: a manual build fails when a substitution is missing or unused, but trigger builds always use `ALLOW_LOOSE`.

</details>

## Clean up

```bash
bash pcd/labs/50-cloud-build-artifact-registry/teardown.sh
```

The script deletes, in order:

- The `lab50-repo` repository, with all images, tags, and cleanup policies.
- The `gs://lab50-PROJECT_ID` bucket with the uploaded build sources.
- The project-level Logs Writer and On-Demand Scanning Admin bindings for `lab50-builder`.
- The `lab50-builder` service account.

Then it disables the Container Scanning API, so that new images in the project are not scanned and billed. On-Demand Scanning charges only for the scans that you run, so its API stays on. On-Demand Scanning results expire after 48 hours. The build history and the build logs stay.

## Docs used

- [Build and push a Docker image with Cloud Build](https://docs.cloud.google.com/build/docs/build-push-docker-image)
- [Build configuration file schema](https://docs.cloud.google.com/build/docs/build-config-file-schema)
- [Substituting variable values](https://docs.cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Running bash scripts](https://docs.cloud.google.com/build/docs/configuring-builds/run-bash-scripts)
- [Configure user-specified service accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
- [Cloud Build service account](https://docs.cloud.google.com/build/docs/cloud-build-service-account)
- [Cloud Build service account change](https://docs.cloud.google.com/build/docs/cloud-build-service-account-updates)
- [Submit a build via the CLI and API](https://docs.cloud.google.com/build/docs/running-builds/submit-build-via-cli-api)
- [Store artifacts in Artifact Registry](https://docs.cloud.google.com/build/docs/building/store-artifacts-in-artifact-registry)
- [Practicing the principle of least privilege with Cloud Build and Artifact Registry](https://cloud.google.com/blog/topics/developers-practitioners/practicing-principle-least-privilege-cloud-build-and-artifact-registry)
- [Cloud Run roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/run)
- [Manage images](https://docs.cloud.google.com/artifact-registry/docs/docker/manage-images)
- [Configure cleanup policies](https://docs.cloud.google.com/artifact-registry/docs/repositories/cleanup-policy)
- [REST Resource: projects.locations.repositories](https://docs.cloud.google.com/artifact-registry/docs/reference/rest/v1/projects.locations.repositories)
- [Artifact Analysis overview](https://docs.cloud.google.com/artifact-analysis/docs/artifact-analysis)
- [Container scanning overview](https://docs.cloud.google.com/artifact-analysis/docs/container-scanning-overview)
- [Enable or disable automatic scanning](https://docs.cloud.google.com/artifact-analysis/docs/enable-automatic-scanning)
- [Scan OS packages automatically](https://docs.cloud.google.com/artifact-analysis/docs/scan-os-automatically)
- [Scan OS packages manually](https://docs.cloud.google.com/artifact-analysis/docs/scan-os-on-demand)
- [Use On-Demand Scanning in your Cloud Build pipeline](https://docs.cloud.google.com/artifact-analysis/docs/ods-cloudbuild)
- [Severity levels in Artifact Analysis](https://docs.cloud.google.com/artifact-analysis/docs/severity-levels)
- [gcloud artifacts vulnerabilities list](https://docs.cloud.google.com/sdk/gcloud/reference/artifacts/vulnerabilities/list)
- [Enable and use Artifact Registry vulnerability assessment](https://docs.cloud.google.com/security-command-center/docs/vulnerability-assessment-ar-overview)
- [General development tips (Cloud Run)](https://docs.cloud.google.com/run/docs/tips/general)
- [Optimize Python applications for Cloud Run](https://docs.cloud.google.com/run/docs/tips/python)
- [Quickstart: Build and deploy a Python (Flask) web app to Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-service)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
- [Artifact Analysis pricing](https://cloud.google.com/artifact-analysis/pricing)
