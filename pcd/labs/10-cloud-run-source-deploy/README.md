---
id: 10-cloud-run-source-deploy
title: "Deploy from source to Cloud Run: revisions, tags, traffic splitting, and rollback"
objectives: ["3.1", "1.1"]
minutes: 50
cost: "Less than $0.05 if you run teardown.sh when done. Cloud Run (180,000 vCPU-seconds and 2 million requests each month), Cloud Build (2,500 build-minutes each month), and Artifact Registry (0.5 GiB of storage each month) have free tiers. The minimum instance from step 5 is billed at the idle rate until teardown."
requiresOrg: false
---

## Goal

Deploy a private Python service to Cloud Run from source code, with no Dockerfile. Then release a second revision with no traffic, test it at a tag URL, split traffic, roll back, and send all traffic to the latest revision again.

## Exam relevance

- `gcloud run deploy --source`: Cloud Build, Google Cloud's buildpacks, the `cloud-run-source-deploy` repository, the build service account, and the service identity. See [Deploying to Cloud Run from source code](note:3.1-deploy-from-source).
- Revisions, tags, `--no-traffic`, gradual rollout, and rollback. See [Traffic splitting: gradual rollouts, rollbacks, and A/B tests](note:1.1-traffic-splitting).
- CPU, memory, concurrency, and service-level minimum and maximum instances. See [Sizing resources and controlling cost](note:1.1-resources-and-cost).
- The container runtime contract: listen on `PORT`, and read configuration from environment variables. See [Building and refactoring containers for Cloud Run and GKE](note:1.1-containers).
- A tag URL lets you test a new API version before it gets traffic. See [Versioning, exposing, and securing APIs on Cloud Run](note:3.1-api-versioning-and-exposure).
- A stateless HTTP service with spiky traffic fits Cloud Run. See [Choosing a platform: Compute Engine, GKE, and Cloud Run](note:1.1-platform-choice).

## Before you start

- Complete [the setup lab](lab:00-setup) first, so that `source pcd/labs/env.sh` works.
- **IAM:** you are the Owner of the lab project. A deployer without Owner needs Cloud Run Source Developer (`roles/run.sourceDeveloper`) and Service Usage Consumer (`roles/serviceusage.serviceUsageConsumer`) on the project, and Service Account User (`roles/iam.serviceAccountUser`) on the service identity.
- **Tools:** the gcloud CLI and `curl`. You do not need Docker. Cloud Build makes the image.
- **Time:** about 50 minutes. Each deploy from source takes a few minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs. Source deployments use Cloud Build to make the image and Artifact Registry to store it.

```bash
source pcd/labs/env.sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iam.googleapis.com
```

## Steps

1. Create two service accounts: `lab10-runtime` is the identity of the running service, and `lab10-builder` runs the build. If you do not set them, both jobs use the Compute Engine default service account, which can have the Editor role on the project.

```bash
gcloud iam service-accounts create lab10-runtime --display-name="lab10 service identity"
gcloud iam service-accounts create lab10-builder --display-name="lab10 source deploy builds"
export RUN_SA="lab10-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export BUILD_SA="lab10-builder@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/run.builder --condition=None
```

The Cloud Run Builder role (`roles/run.builder`) has the permissions to read Cloud Storage objects, write logs, and push images to Artifact Registry. The runtime service account gets no roles, because this app calls no Google Cloud API. If the binding fails because the service account does not exist yet, wait one minute and run the last command again. The role grant takes a couple of minutes to take effect, so read the app in step 2 while you wait.

2. Read the app, so that you know what the build does with it. There is no `Dockerfile`, so the build uses Google Cloud's buildpacks. The buildpack finds Python from `requirements.txt` and the version from `.python-version`. The `Procfile` overrides the default start command.

```bash
ls -A pcd/labs/10-cloud-run-source-deploy/app
cat pcd/labs/10-cloud-run-source-deploy/app/Procfile
cat pcd/labs/10-cloud-run-source-deploy/app/main.py
```

The `Procfile` starts gunicorn on `$PORT` with 8 threads. Cloud Run sends requests to the port in the `PORT` environment variable, 8080 by default. For Python, Google recommends a number of threads that is equal to the concurrency value, so step 3 sets the concurrency to 8.

3. Deploy revision `v1` from source. The service stays private, and the scaling settings limit the cost.

```bash
gcloud run deploy lab10-app \
  --source=pcd/labs/10-cloud-run-source-deploy/app \
  --region="$REGION" \
  --build-service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --service-account="$RUN_SA" \
  --no-allow-unauthenticated \
  --cpu=1 --memory=512Mi --concurrency=8 --max=3 \
  --set-env-vars=APP_VERSION=v1 \
  --revision-suffix=v1
```

If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`. The command uploads the folder, Cloud Build makes the image, and Artifact Registry stores it in that repository in your region. Then Cloud Run creates revision `lab10-app-v1` and sends all traffic to it.

The flags in this command:

| Flag | What it does |
|---|---|
| `--build-service-account` | The identity that runs the build. Google recommends your own service account, for least privilege. |
| `--service-account` | The service identity. Code in the container gets its credentials from this account. |
| `--no-allow-unauthenticated` | Only callers with the `run.routes.invoke` permission can call the service, for example through the Cloud Run Invoker role (`roles/run.invoker`). |
| `--cpu=1 --memory=512Mi` | The limits for each instance. These are also the defaults. |
| `--concurrency=8` | The maximum number of requests that one instance handles at the same time. For a source deployment, Google recommends that you start low, for example at 8. |
| `--max=3` | The service-level maximum number of instances. Google suggests 3 to start, as a cost limit. |
| `--revision-suffix=v1` | Names the revision `lab10-app-v1` instead of a generated name. |

If the deploy fails with a permission error, the Cloud Run Builder role of `lab10-builder` is probably not active yet. A grant of this role takes a couple of minutes to propagate. Run the grant again, wait two minutes, and then run the deploy command again:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/run.builder --condition=None
```

Without `--build-service-account`, the build uses the Compute Engine default service account. The setup lab grants the Cloud Run Builder role to that account.

4. Call the service without and with credentials. A private service rejects calls without a token. Your account gets an ID token from gcloud and has the `run.routes.invoke` permission through the Owner role.

```bash
export URL="$(gcloud run services describe lab10-app --region="$REGION" --format='value(status.url)')"
echo "$URL"
curl -s -o /dev/null -w '%{http_code}\n' "$URL"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
```

The first call prints `403`. The second call prints `revision=lab10-app-v1 version=v1`.

5. Look at the image that the build made, and set the service-level minimum instances. A revision records the resolved image digest, even when you deploy by tag. A service-level scaling change takes effect at once and does not create a revision.

```bash
gcloud artifacts docker images list \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/lab10-app" --include-tags
gcloud run revisions describe lab10-app-v1 --region="$REGION" --format='value(status.imageDigest)'
gcloud run services update lab10-app --region="$REGION" --min=1
gcloud run revisions list --service=lab10-app --region="$REGION"
gcloud run services describe lab10-app --region="$REGION" | grep -i 'scaling'
```

The digest of the revision is the same as the digest in the image list. There is still one revision, and the service shows `Scaling: Auto (Min: 1, Max: 3)`. Cloud Run now tries to keep one instance warm, so fewer requests wait for a cold start. With request-based billing, an idle minimum instance is billed at a lower rate than an active one.

6. Deploy revision `v2` with no traffic and with the tag `green`. The new revision gets its own URL, and users still reach `v1`. The service account, CPU, memory, and concurrency come from the previous revision, so you do not set them again.

```bash
gcloud run deploy lab10-app \
  --source=pcd/labs/10-cloud-run-source-deploy/app \
  --region="$REGION" \
  --build-service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --update-env-vars=APP_VERSION=v2 \
  --revision-suffix=v2 \
  --no-traffic --tag=green
```

In a real release, `v2` has new code. Here, the `APP_VERSION` environment variable marks it.

7. Test the tag URL. The tag URL adds `green---` before the service host name, and it always reaches the tagged revision.

```bash
export TAG_URL="https://green---${URL#https://}"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$TAG_URL"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
gcloud run services describe lab10-app --region="$REGION" --format='yaml(status.traffic)'
```

The tag URL prints `revision=lab10-app-v2 version=v2`, and the service URL still prints `v1`. The traffic list gives 100 percent to `lab10-app-v1`, and an entry with the tag `green` for `lab10-app-v2`.

8. Send 10 percent of the traffic to the tagged revision. This is the first step of a gradual rollout. The `count` function sends 20 requests and counts the answers.

```bash
count() {  # usage: count URL
  local token; token="$(gcloud auth print-identity-token)"
  for i in $(seq 20); do curl -s -H "Authorization: Bearer ${token}" "$1"; done | sort | uniq -c
}
gcloud run services update-traffic lab10-app --region="$REGION" --to-tags=green=10
count "$URL"
```

Most answers come from `v1`, and about 2 come from `v2`. The numbers change from run to run. When you give a percentage to one target, gcloud scales the other targets so that the total is 100.

9. Move to a 50/50 split with revision names instead of the tag. You do not deploy again to change a split.

```bash
gcloud run services update-traffic lab10-app --region="$REGION" \
  --to-revisions=lab10-app-v1=50,lab10-app-v2=50
count "$URL"
```

About half of the answers come from each revision.

10. Roll back: send all traffic to `v1`. A rollback is only a traffic change. There is no build and no new revision, because `lab10-app-v1` still exists and cannot change.

```bash
gcloud run services update-traffic lab10-app --region="$REGION" --to-revisions=lab10-app-v1=100
count "$URL"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$TAG_URL"
```

All 20 answers come from `v1`. The tag URL still reaches `v2`, so you can continue to test it.

11. Make a configuration change. Every configuration change creates a new revision. Since step 6, the traffic goes to named revisions, not to the latest revision, so the new revision gets no traffic.

```bash
gcloud run services update lab10-app --region="$REGION" \
  --update-env-vars=APP_VERSION=v3 --revision-suffix=v3
gcloud run revisions list --service=lab10-app --region="$REGION"
count "$URL"
```

There are three revisions now, and all answers still come from `v1`. This command did not run a build. It made `lab10-app-v3` from the current configuration of the service, with one changed setting.

12. Send all traffic to the latest revision with `--to-latest`. From now on, each new revision gets all traffic as soon as it is ready.

```bash
gcloud run services update-traffic lab10-app --region="$REGION" --to-latest
count "$URL"
gcloud run services describe lab10-app --region="$REGION" --format='yaml(status.traffic)'
```

All answers come from `lab10-app-v3`. The traffic list shows `latestRevision: true` with 100 percent, and the `green` tag still points to `lab10-app-v2`.

## Check your work

```bash
gcloud run services describe lab10-app --region="$REGION" --format='yaml(status.traffic)'
gcloud run revisions list --service=lab10-app --region="$REGION" --format='value(metadata.name)'
gcloud run services get-iam-policy lab10-app --region="$REGION"
curl -s -o /dev/null -w '%{http_code}\n' "$URL"
```

Expected output:

- The latest revision, `lab10-app-v3`, has 100 percent of the traffic. The tag `green` points to `lab10-app-v2`.
- Three revisions: `lab10-app-v1`, `lab10-app-v2`, and `lab10-app-v3`.
- The IAM policy of the service has no binding for `allUsers`. The service is still private.
- `403` for the call without a token.

## Explore

1. Revisions are immutable. What does that give you during an incident, and what does a rollback not undo?

<details><summary>Answer</summary>

Each deploy or configuration change creates a new, immutable revision. The revision also records the resolved image digest. So a rollback is only a traffic change to a revision that you already tested: no build, no new image, and no new revision. When you change traffic, Cloud Run does not drop requests that are in progress. A rollback changes only the traffic. It does not undo data that the bad revision wrote.

</details>

2. What does `--no-traffic` protect against, and what must you remember after you use it?

<details><summary>Answer</summary>

Without `--no-traffic`, the new revision gets 100 percent of the traffic when the deploy finishes, if the traffic goes to the latest revision. The deployment health check only confirms that an instance starts and passes its startup probe. With `--no-traffic` and `--tag`, you test the real revision in production at its tag URL first, then move traffic in steps. After you use `--no-traffic`, or after any split, later deployments keep that traffic split. Run `gcloud run services update-traffic --to-latest` to make new revisions get the traffic again.

</details>

3. Why does the lab use `--min` and `--max` (service level) and not `--min-instances` and `--max-instances` (revision level)?

<details><summary>Answer</summary>

Google recommends service-level minimum and maximum instances. A service-level change takes effect at once, without a new revision. With revision-level minimum instances, Cloud Run starts the minimum instances for every revision in the traffic split and for every tagged revision, and bills them even when they are idle. Service-level minimum instances are divided across the revisions in proportion to the traffic split, and tags do not get minimum instances. Revision-level scaling is only available for services that had it configured before.

</details>

4. When do you use a `Dockerfile`, or `gcloud builds submit` and `--image`, instead of buildpacks?

<details><summary>Answer</summary>

If the source folder has a `Dockerfile`, `gcloud run deploy --source` builds with it. Otherwise it uses Google Cloud's buildpacks. Deploy from source is a convenience feature, and you cannot fully customize the build. For more control, build the image with Cloud Build (for example with `gcloud builds submit`) and deploy it with `gcloud run deploy --image`. Google recommends that you deploy automatically from a Git repository instead of from local source. Source deployments with buildpacks can also use automatic base image updates (`--base-image` with `--automatic-updates`). Google then patches the operating system and language runtime without a redeploy and without a new revision.

</details>

## Clean up

```bash
bash pcd/labs/10-cloud-run-source-deploy/teardown.sh
```

The script deletes, in order:

- The `lab10-app` service, with all its revisions and the `green` tag.
- The `lab10-app` image, with all its versions and tags, from the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The project-level Cloud Run Builder binding for `lab10-builder`.
- The `lab10-builder` and `lab10-runtime` service accounts.

It leaves the enabled APIs in place.

## Docs used

- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Quickstart: Build and deploy a Python (Flask) web app to Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-service)
- [Build a Python application](https://docs.cloud.google.com/docs/buildpacks/python)
- [The Python runtime](https://docs.cloud.google.com/run/docs/runtimes/python)
- [Set build service account (source deploy)](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account)
- [Introduction to service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)
- [Cloud Run IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles)
- [Cloud Run roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/run)
- [Access control with IAM](https://docs.cloud.google.com/run/docs/securing/managing-access)
- [Container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)
- [Optimize Python applications for Cloud Run](https://docs.cloud.google.com/run/docs/tips/python)
- [Maximum concurrent requests for services](https://docs.cloud.google.com/run/docs/about-concurrency)
- [Set maximum concurrent requests per instance](https://docs.cloud.google.com/run/docs/configuring/concurrency)
- [Configure CPU limits for services](https://docs.cloud.google.com/run/docs/configuring/services/cpu)
- [Configure memory limits for services](https://docs.cloud.google.com/run/docs/configuring/services/memory-limits)
- [Set minimum instances for services](https://docs.cloud.google.com/run/docs/configuring/min-instances)
- [Set maximum instances for services](https://docs.cloud.google.com/run/docs/configuring/max-instances)
- [Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)
- [Invoke with an HTTPS Request](https://docs.cloud.google.com/run/docs/triggering/https-request)
- [Manage revisions](https://docs.cloud.google.com/run/docs/managing/revisions)
- [REST Resource: namespaces.revisions](https://docs.cloud.google.com/run/docs/reference/rest/v1/namespaces.revisions)
- [Rollbacks, gradual rollouts, and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Configure automatic base image updates](https://docs.cloud.google.com/run/docs/configuring/services/automatic-base-image-updates)
- [Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)
- [Manage images (Artifact Registry)](https://docs.cloud.google.com/artifact-registry/docs/docker/manage-images)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
