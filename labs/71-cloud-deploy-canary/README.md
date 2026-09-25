---
id: 71-cloud-deploy-canary
title: Canary releases with Cloud Build and Cloud Deploy
objectives: ["4.1", "6.3"]
minutes: 60
cost: "The first active multiple-target delivery pipeline per billing account has no charge. Each additional active one costs $5.00 for the month. Cloud Build minutes, Artifact Registry and Cloud Storage storage, and Cloud Run requests in this lab cost a few cents. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Build a container image with Cloud Build and store it in Artifact Registry. Then promote two releases through a Cloud Deploy pipeline with a staging target and a prod target that needs approval and uses a canary strategy, and roll back prod.

## Exam relevance

- Canary phases, promotion, approvals, and rollback: [Release management](note:6.3-release-management).
- Cloud Build, Artifact Registry, and one service account for each job: [SDLC and CI/CD](note:4.1-sdlc-cicd).
- Approvals and staged rollouts as quality gates: [Quality control measures](note:6.5-quality-control).

## Before you start

- Run everything from the repo root, in one shell. Later steps use variables from earlier steps.
- You need the Owner role on the lab project (from `labs/00-setup`).
- Tools: gcloud and `curl`.
- Time: about 60 minutes. Each Cloud Deploy render or deploy job takes 1 to 3 minutes.
- The lab creates three service accounts, one for each job: `lab71-builder` runs the builds, `lab71-deployer` runs the Cloud Deploy jobs, and `lab71-runtime` is the identity of the Cloud Run services. No service account gets a key.
- The two Cloud Run services stay private. You call them with your own identity token.
- The two helper functions below print a rollout's status and wait for a status. If a wait does not end after 10 minutes, press Ctrl+C and look at the rollout in the console (**Cloud Deploy > Delivery pipelines**).

```bash
source labs/env.sh
gcloud services enable clouddeploy.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com run.googleapis.com
# rstatus RELEASE ROLLOUT: print the rollout state, approval state, phases, and phase states.
rstatus() {
  gcloud deploy rollouts describe "$2" --release="$1" --delivery-pipeline=lab71-pipeline \
    --region="$REGION" --format='value(state,approvalState,phases[].id.list(),phases[].state.list())'
}
# wait_for RELEASE ROLLOUT PATTERN: print the status every 20 seconds until it matches PATTERN or FAILED.
wait_for() {
  until rstatus "$1" "$2" | tee /dev/stderr | grep -qE "$3|FAILED"; do sleep 20; done
}
```

## Steps

1. Create a Docker repository in Artifact Registry. Cloud Build pushes the images to it, and Cloud Run pulls the images from it.

```bash
gcloud artifacts repositories create lab71-repo --repository-format=docker \
  --location="$REGION" --description="lab71 images"
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/lab71-repo/lab71-app"
```

2. Create the three service accounts and give each one only the roles for its job. The Compute Engine default service account is the default for builds and for Cloud Deploy, but many products use it, so it can have broad permissions.

```bash
for sa in lab71-builder lab71-deployer lab71-runtime; do
  gcloud iam service-accounts create "$sa" --display-name="$sa"
done
sleep 30   # new service accounts can take a few seconds to become usable
export BUILDER="lab71-builder@${PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOYER="lab71-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
export RUNTIME="lab71-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${BUILDER}" \
  --role=roles/cloudbuild.builds.builder --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER}" \
  --role=roles/clouddeploy.jobRunner --condition=None
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${DEPLOYER}" \
  --role=roles/run.developer --condition=None
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --member="serviceAccount:${DEPLOYER}" --role=roles/iam.serviceAccountUser
```

3. Build version v1 with Cloud Build as `lab71-builder`, then read the image digest. A digest identifies one exact image, but someone can move a tag to a different image.

```bash
cat labs/71-cloud-deploy-canary/cloudbuild.yaml
gcloud builds submit labs/71-cloud-deploy-canary/app \
  --config=labs/71-cloud-deploy-canary/cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE},_VERSION=v1" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILDER}"
export IMAGE_V1="$(gcloud artifacts docker images describe "${IMAGE}:v1" \
  --format='value(image_summary.fully_qualified_digest)')"
echo "$IMAGE_V1"
```

4. Put your project ID and region into the Cloud Deploy files, then register the pipeline and the two targets. The prod stage has a canary strategy with 25% and 50% phases, and the prod target needs approval for every rollout.

```bash
mkdir -p /tmp/lab71-deploy
for f in skaffold.yaml run-staging.yaml run-prod.yaml; do
  sed -e "s/__PROJECT_ID__/${PROJECT_ID}/g" "labs/71-cloud-deploy-canary/deploy/$f" > "/tmp/lab71-deploy/$f"
done
sed -e "s/__PROJECT_ID__/${PROJECT_ID}/g" -e "s/__REGION__/${REGION}/g" \
  labs/71-cloud-deploy-canary/clouddeploy.yaml > /tmp/lab71-clouddeploy.yaml
cat /tmp/lab71-clouddeploy.yaml
gcloud deploy apply --file=/tmp/lab71-clouddeploy.yaml --region="$REGION"
```

5. Create release `lab71-r1`, wait for its rollout to staging, and call the staging service. A release freezes the rendered manifests and the image digest, and Cloud Deploy starts a rollout to the first target at once.

```bash
gcloud deploy releases create lab71-r1 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --source=/tmp/lab71-deploy --images="lab71-app=${IMAGE_V1}"
export R1_STAGING="$(gcloud deploy rollouts list --release=lab71-r1 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --filter='targetId="lab71-staging"' --format='value(name.basename())')"
wait_for lab71-r1 "$R1_STAGING" '^SUCCEEDED'
export STAGING_URL="$(gcloud run services describe lab71-app-staging --region="$REGION" --format='value(status.url)')"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$STAGING_URL"
```

6. Promote `lab71-r1` to prod. The rollout waits for approval because the prod target has `requireApproval: true`.

```bash
gcloud deploy releases promote --release=lab71-r1 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --to-target=lab71-prod --rollout-id=lab71-r1-prod
rstatus lab71-r1 lab71-r1-prod    # expect PENDING_APPROVAL and NEEDS_APPROVAL
```

7. Approve the rollout, then advance it to the `stable` phase. This is the first deployment to prod, so there is no old revision to split traffic with, and Cloud Deploy skips the canary phases.

```bash
gcloud deploy rollouts approve lab71-r1-prod --release=lab71-r1 \
  --delivery-pipeline=lab71-pipeline --region="$REGION"
wait_for lab71-r1 lab71-r1-prod 'APPROVED'    # canary-25 and canary-50 show SKIPPED
gcloud deploy rollouts advance lab71-r1-prod --release=lab71-r1 \
  --delivery-pipeline=lab71-pipeline --region="$REGION"
wait_for lab71-r1 lab71-r1-prod '^SUCCEEDED'
export PROD_URL="$(gcloud run services describe lab71-app-prod --region="$REGION" --format='value(status.url)')"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$PROD_URL"
```

8. Build version v2, create release `lab71-r2`, and wait for staging. The same pipeline takes the new release to staging first, with no change to the pipeline.

```bash
gcloud builds submit labs/71-cloud-deploy-canary/app \
  --config=labs/71-cloud-deploy-canary/cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE},_VERSION=v2" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILDER}"
export IMAGE_V2="$(gcloud artifacts docker images describe "${IMAGE}:v2" \
  --format='value(image_summary.fully_qualified_digest)')"
gcloud deploy releases create lab71-r2 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --source=/tmp/lab71-deploy --images="lab71-app=${IMAGE_V2}"
export R2_STAGING="$(gcloud deploy rollouts list --release=lab71-r2 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --filter='targetId="lab71-staging"' --format='value(name.basename())')"
wait_for lab71-r2 "$R2_STAGING" '^SUCCEEDED'
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$STAGING_URL"
```

9. Promote `lab71-r2` to prod and approve it. Prod already runs v1, so this rollout starts with the `canary-25` phase: the new revision gets 25% of the requests.

```bash
gcloud deploy releases promote --release=lab71-r2 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --to-target=lab71-prod --rollout-id=lab71-r2-prod
gcloud deploy rollouts approve lab71-r2-prod --release=lab71-r2 \
  --delivery-pipeline=lab71-pipeline --region="$REGION"
wait_for lab71-r2 lab71-r2-prod 'SUCCEEDED,PENDING,PENDING'    # canary-25 is done
gcloud run services describe lab71-app-prod --region="$REGION" --format='yaml(status.traffic)'
export ID_TOKEN="$(gcloud auth print-identity-token)"
for i in $(seq 1 40); do curl -s -H "Authorization: Bearer ${ID_TOKEN}" "$PROD_URL"; done | sort | uniq -c
```

10. Advance the canary to 50%, compare the versions again, then advance to `stable`. In production, you check the canary's error rate and latency before each advance.

```bash
gcloud deploy rollouts advance lab71-r2-prod --release=lab71-r2 \
  --delivery-pipeline=lab71-pipeline --region="$REGION"
wait_for lab71-r2 lab71-r2-prod 'SUCCEEDED,SUCCEEDED,PENDING'  # canary-50 is done
for i in $(seq 1 40); do curl -s -H "Authorization: Bearer ${ID_TOKEN}" "$PROD_URL"; done | sort | uniq -c
gcloud deploy rollouts advance lab71-r2-prod --release=lab71-r2 \
  --delivery-pipeline=lab71-pipeline --region="$REGION"
wait_for lab71-r2 lab71-r2-prod '^SUCCEEDED'
```

11. Roll back prod to `lab71-r1`, as if v2 had a defect. A rollback creates a new rollout of the earlier release on the target. The script approves it only if the target asks for approval.

```bash
gcloud deploy targets rollback lab71-prod --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --release=lab71-r1 --rollout-id=lab71-rollback
rstatus lab71-r1 lab71-rollback
if [ "$(gcloud deploy rollouts describe lab71-rollback --release=lab71-r1 \
      --delivery-pipeline=lab71-pipeline --region="$REGION" --format='value(approvalState)')" = "NEEDS_APPROVAL" ]; then
  gcloud deploy rollouts approve lab71-rollback --release=lab71-r1 \
    --delivery-pipeline=lab71-pipeline --region="$REGION"
fi
wait_for lab71-r1 lab71-rollback '^SUCCEEDED'
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$PROD_URL"
```

## Check your work

```bash
gcloud deploy rollouts list --release=lab71-r1 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --format='table(name.basename(),targetId,state,approvalState)'
gcloud deploy rollouts list --release=lab71-r2 --delivery-pipeline=lab71-pipeline \
  --region="$REGION" --format='table(name.basename(),targetId,state,approvalState)'
gcloud run services describe lab71-app-prod --region="$REGION" --format='yaml(status.traffic)'
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$PROD_URL"
```

Expected results:

- Release `lab71-r1` has three rollouts in state `SUCCEEDED`: one to `lab71-staging`, `lab71-r1-prod`, and `lab71-rollback`.
- Release `lab71-r2` has two rollouts in state `SUCCEEDED`: one to `lab71-staging`, and `lab71-r2-prod` with approval state `APPROVED`.
- In step 9, about 10 of the 40 responses start with `v2`. In step 10, about 20 of the 40 responses start with `v2`. The traffic block shows the same split between two revisions.
- After the rollback, one revision has 100% of the traffic, and prod returns a line that starts with `v1`.

## Explore

1. The first rollout of `lab71-r1` to prod skipped both canary phases. Why? Is that a risk?

<details><summary>Answer</summary>

A canary splits traffic between the old version and the new version. On the first deployment to a target, there is no old version, so Cloud Deploy skips the canary phases and runs only the `stable` phase ([Manage rollouts](https://docs.cloud.google.com/deploy/docs/deployment-strategies/manage-rollout)). The risk is small because no users depend on the service yet. Staging tested the same release before prod.

</details>

2. The rollback sent 100% of the traffic to v1 at once, with no canary. Why is that a good default, and how can you change it?

<details><summary>Answer</summary>

During an incident, the first goal is to stop the damage, and the earlier release already ran in prod. A rollback rollout starts in the `stable` phase unless you set a starting phase ([rollbackTarget API](https://docs.cloud.google.com/deploy/docs/api/reference/rest/v1/projects.locations.deliveryPipelines/rollbackTarget)). To start at a canary phase, add `--starting-phase-id` to `gcloud deploy targets rollback`.

</details>

3. You ran `advance` by hand after you looked at the responses. How can Cloud Deploy advance the canary and roll back without a person, and stay safe?

<details><summary>Answer</summary>

Add checks that decide for you. A verify job runs your test container after each phase ([Verify your deployment](https://docs.cloud.google.com/deploy/docs/verify-deployment)). An analysis job watches Cloud Monitoring alerting policies during a phase ([Run analysis jobs](https://docs.cloud.google.com/deploy/docs/analysis)). Then an `advanceRolloutRule` advances the phases, and a `repairRolloutRule` retries a failed job and can roll back the target ([Using automation rules](https://docs.cloud.google.com/deploy/docs/automation-rules)).

</details>

4. Why did the releases use the image digest (`@sha256:...`) and not the `v1` or `v2` tag?

<details><summary>Answer</summary>

Google recommends SHA-qualified image names at release creation ([Canary-deploy an application to a target](https://docs.cloud.google.com/deploy/docs/deploy-app-canary)). A tag can move to a different image after staging tests it. With a digest, prod runs exactly the image that staging tested, and a rollback restores exactly the earlier image.

</details>

## Clean up

```bash
bash labs/71-cloud-deploy-canary/teardown.sh
```

The script deletes, in order:

- The delivery pipeline `lab71-pipeline` with its releases and rollouts, and the targets `lab71-staging` and `lab71-prod`.
- The Cloud Run services `lab71-app-staging` and `lab71-app-prod`.
- The Artifact Registry repository `lab71-repo` and its images.
- The two Cloud Storage buckets that Cloud Deploy created: `<pipeline UID>_clouddeploy` (release sources) and `<region>.deploy-artifacts.<project ID>.appspot.com` (rendered manifests).
- The project role bindings of `lab71-builder` and `lab71-deployer`, then the three service accounts.
- The files in `/tmp` that step 4 created.

It keeps the Cloud Build source bucket (`gs://<project ID>_cloudbuild`), because other labs can use it.

## Docs used

- [Canary-deploy an application to a target](https://docs.cloud.google.com/deploy/docs/deploy-app-canary)
- [Deploy an app to Cloud Run using Cloud Deploy](https://docs.cloud.google.com/deploy/docs/deploy-app-run)
- [Canary Deployments to Cloud Run](https://docs.cloud.google.com/deploy/docs/deployment-strategies/canary/cloud-run)
- [Manage rollouts](https://docs.cloud.google.com/deploy/docs/deployment-strategies/manage-rollout)
- [Promote your release and manage approvals](https://docs.cloud.google.com/deploy/docs/promote-release)
- [Roll back a target](https://docs.cloud.google.com/deploy/docs/roll-back)
- [Cloud Deploy service accounts](https://docs.cloud.google.com/deploy/docs/cloud-deploy-service-account)
- [Configuration schema reference](https://docs.cloud.google.com/deploy/docs/config-files)
- [Using Cloud Deploy execution environments](https://docs.cloud.google.com/deploy/docs/execution-environment)
- [Configure user-specified service accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
- [Build container images](https://docs.cloud.google.com/build/docs/building/build-containers)
- [Store Docker container images in Artifact Registry](https://docs.cloud.google.com/artifact-registry/docs/docker/store-docker-container-images)
- [Authenticate developers (Cloud Run)](https://docs.cloud.google.com/run/docs/authenticating/developers)
- [Cloud Deploy pricing](https://cloud.google.com/deploy/pricing)
