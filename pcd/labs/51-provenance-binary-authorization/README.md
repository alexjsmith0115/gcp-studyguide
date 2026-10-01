---
id: 51-provenance-binary-authorization
title: "Build provenance and Binary Authorization for Cloud Run"
objectives: ["2.2", "1.2"]
minutes: 50
cost: "Less than $0.05 if you run teardown.sh when done. Binary Authorization for Cloud Run is free of charge. Cloud Run, Cloud Build (2,500 build-minutes each month), and Artifact Registry (0.5 GiB of storage each month) have free tiers. The lab repository has vulnerability scanning turned off, so its images cause no scan charges."
requiresOrg: false
---

## Goal

Build an image with Cloud Build so that it gets SLSA build provenance and the `built-by-cloud-build` attestation. Then make the Binary Authorization policy of the project require that attestation. Cloud Run allows the attested image, blocks an image without the attestation, and logs a breakglass deployment.

## Exam relevance

- Cloud Build generates provenance and the `built-by-cloud-build` attestation only for images that it pushes with the `images` field. An explicit `docker push` step gives neither. See [Build provenance and Binary Authorization](note:2.2-provenance-binary-authorization).
- The Binary Authorization policy model: one policy for each project, the default rule, evaluation and enforcement modes, attestors, breakglass, and dry run. See [Build provenance and Binary Authorization](note:2.2-provenance-binary-authorization).
- Attestations and scans belong to an image digest, not a tag. See [Building containers with Cloud Build and storing them in Artifact Registry](note:2.2-cloud-build-artifact-registry).
- A dedicated build service account and a dedicated service identity for the Cloud Run service. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).

## Before you start

- Complete [00-setup](lab:00-setup) first. It makes `source pcd/labs/env.sh` work and enables the base APIs.
- **IAM:** you are the Owner of the lab project. Without Owner, you need roles to start builds, manage Artifact Registry repositories, and deploy Cloud Run services. To change the Binary Authorization policy, you need Binary Authorization Policy Administrator (`roles/binaryauthorization.policyAdmin`). You also need to act as the two service accounts that the lab creates.
- **Tools:** the gcloud CLI and `curl`. You do not need Docker.
- **Time:** about 50 minutes.
- **Policy scope:** this lab changes the Binary Authorization policy of the whole project. The policy applies to Cloud Run services and GKE clusters that have Binary Authorization turned on. Run `teardown.sh` when you finish, so that the project allows all images again.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs. Enable the Binary Authorization API before the first build: Cloud Build creates the `built-by-cloud-build` attestor when you run a build in the project. The Container Analysis API stores the provenance and the attestations.

```bash
source pcd/labs/env.sh
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com \
  containeranalysis.googleapis.com binaryauthorization.googleapis.com \
  run.googleapis.com storage.googleapis.com iam.googleapis.com
```

## Steps

1. Create a Docker repository with vulnerability scanning turned off, a bucket for the build source, and two service accounts. `lab51-builder` runs the builds. `lab51-run` is the identity of the Cloud Run service, and it gets no roles, because the app calls no Google Cloud API.

```bash
export REPO=lab51-repo
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/lab51-app"
export BUCKET="gs://lab51-${PROJECT_ID}"
export BUILD_SA="lab51-builder@${PROJECT_ID}.iam.gserviceaccount.com"
export RUN_SA="lab51-run@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud artifacts repositories create "$REPO" --repository-format=docker \
  --location="$REGION" --description="lab51 images" --disable-vulnerability-scanning
gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud iam service-accounts create lab51-builder --display-name="lab51 build service account"
gcloud iam service-accounts create lab51-run --display-name="lab51 Cloud Run service identity"
```

2. Grant the build service account only the roles that the build needs. The build reads the uploaded source in the bucket, pushes to the lab repository, and writes logs. If a command fails because the service account does not exist yet, wait one minute and run it again.

```bash
gcloud storage buckets add-iam-policy-binding "$BUCKET" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/storage.objectViewer
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/logging.logWriter --condition=None > /dev/null
```

[Lab 50](lab:50-cloud-build-artifact-registry) explains each of these roles.

3. Read the two build configs and the policy template while the role grants take effect.

```bash
cat pcd/labs/51-provenance-binary-authorization/cloudbuild.yaml
cat pcd/labs/51-provenance-binary-authorization/cloudbuild-docker-push.yaml
cat pcd/labs/51-provenance-binary-authorization/policy.yaml
```

- `cloudbuild.yaml` pushes the image with the `images` field and sets `requestedVerifyOption: VERIFIED`. With this option, the build succeeds only if Cloud Build generates the attestations and the provenance.
- `cloudbuild-docker-push.yaml` builds the same app, but pushes it with a `docker push` step. Many older pipelines do this.
- `policy.yaml` requires an attestation from the `built-by-cloud-build` attestor for every image. Cloud Run uses only the default rule of the policy.

4. Build and push `v1` with `cloudbuild.yaml`. Then save the digest of the image. Binary Authorization checks attestations for a digest, so you deploy by digest.

```bash
gcloud builds submit pcd/labs/51-provenance-binary-authorization \
  --config=pcd/labs/51-provenance-binary-authorization/cloudbuild.yaml \
  --region="$REGION" --substitutions=_TAG=v1 \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
export ATTESTED="$(gcloud artifacts docker images describe "${IMAGE}:v1" \
  --format='value(image_summary.fully_qualified_digest)')"
echo "$ATTESTED"
```

The build ends with `SUCCESS`. If it fails with a permission error, wait one minute and run it again.

5. Look at the provenance, the attestor, and the attestation of `v1`. Cloud Build stored the provenance in Artifact Analysis (formerly Container Analysis) as an occurrence of kind `BUILD`.

```bash
gcloud artifacts docker images describe "$ATTESTED" --show-provenance --format=yaml \
  | grep -E 'slsa_build_level|predicateType|id: https://cloudbuild|kind:'
gcloud container binauthz attestors describe built-by-cloud-build
gcloud container binauthz attestations list --attestor=built-by-cloud-build \
  --artifact-url="$ATTESTED" --format='table(kind,noteName,createTime)'
```

Expected output:

- `slsa_build_level: 3`, the predicate type `https://slsa.dev/provenance/v1`, the builder ID `https://cloudbuild.googleapis.com/GoogleHostedWorker`, and `kind: BUILD`. The full provenance also records the build ID, the substitutions, and the digests of the builder images. Run the first command without `| grep ...` to read all of it.
- The attestor `projects/PROJECT_ID/attestors/built-by-cloud-build`, with its Artifact Analysis note. Cloud Build created it and signs its attestations.
- One attestation of kind `ATTESTATION` for the `v1` digest.

6. Build the same app with `cloudbuild-docker-push.yaml`. Then compare the new image with `v1`.

```bash
gcloud builds submit pcd/labs/51-provenance-binary-authorization \
  --config=pcd/labs/51-provenance-binary-authorization/cloudbuild-docker-push.yaml \
  --region="$REGION" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
export UNATTESTED="$(gcloud artifacts docker images describe "${IMAGE}:docker-push" \
  --format='value(image_summary.fully_qualified_digest)')"
gcloud artifacts docker images describe "$UNATTESTED" --show-provenance \
  --format='value(image_summary.slsa_build_level)'
gcloud container binauthz attestations list --attestor=built-by-cloud-build \
  --artifact-url="$UNATTESTED"
```

The build succeeds, and the image is in the repository with the tag `docker-push`. But its SLSA build level is `unknown`, and the attestation list is empty. Cloud Build built this image too, but the `docker push` step bypassed the `images` field.

7. Save the current policy, then import a policy that requires the `built-by-cloud-build` attestation. Each project has exactly one Binary Authorization policy, so `teardown.sh` uses the saved copy to restore it.

```bash
[ -s /tmp/lab51-policy-backup.yaml ] || \
  gcloud container binauthz policy export > /tmp/lab51-policy-backup.yaml
cat /tmp/lab51-policy-backup.yaml
sed "s/__PROJECT_ID__/${PROJECT_ID}/g" \
  pcd/labs/51-provenance-binary-authorization/policy.yaml > /tmp/lab51-policy.yaml
gcloud container binauthz policy import /tmp/lab51-policy.yaml
```

In a new project, the saved policy has `evaluationMode: ALWAYS_ALLOW`: every image is allowed. The first line keeps an existing backup, so a second run of this step does not overwrite it. A policy change can take a few minutes to take effect.

8. Deploy the attested image to Cloud Run with Binary Authorization turned on for the service. Then call the private service with an ID token.

```bash
gcloud run deploy lab51-app --image="$ATTESTED" --region="$REGION" \
  --binary-authorization=default --service-account="$RUN_SA" \
  --no-allow-unauthenticated --max=1
export URL="$(gcloud run services describe lab51-app --region="$REGION" --format='value(status.url)')"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
```

The deployment succeeds, and the call prints `Hello World!`. The value `default` means that Cloud Run checks images against the policy of this project.

9. Deploy the image without the attestation. Wait a few minutes after step 7 first. Binary Authorization stays on for the service, so you do not repeat the flag: it checks every update.

```bash
gcloud run deploy lab51-app --image="$UNATTESTED" --region="$REGION"
gcloud run revisions list --service=lab51-app --region="$REGION"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
```

The deployment fails with `Revision ... uses an unauthorized container image. Container image ... is not authorized by policy.` The revision list shows the failed revision. The service still serves the first revision, so the call still prints `Hello World!`. If the deployment succeeds, the policy was not in effect yet: run step 8 again, wait a few minutes, and repeat this step.

10. Deploy the blocked image with breakglass. Breakglass is the emergency path: it bypasses the policy for one deployment and always writes an audit log entry with your justification.

```bash
gcloud run services update lab51-app --region="$REGION" --image="$UNATTESTED" \
  --breakglass="lab51 test: emergency deployment of an image without attestation"
gcloud run services describe lab51-app --region="$REGION" --format=yaml \
  | grep -E 'binary-authorization|image:'
```

The update succeeds. Next to `run.googleapis.com/binary-authorization: default`, the service YAML now shows the annotation `run.googleapis.com/binary-authorization-breakglass` with your justification. The `image:` line shows the digest of the image without the attestation.

11. Find the two events in Cloud Audit Logs. Cloud Run writes Binary Authorization events to the system event audit log of the revision. System event audit logs are always on.

```bash
gcloud logging read --order=desc --freshness=1h --limit=1 \
  'resource.type="cloud_run_revision" AND
   logName:"cloudaudit.googleapis.com%2Fsystem_event" AND
   protoPayload.response.status.conditions.reason="ContainerImageUnauthorized"' \
  | grep -E 'revision_name|message'
gcloud logging read --order=desc --freshness=1h --limit=1 \
  'resource.type="cloud_run_revision" AND
   logName:"cloudaudit.googleapis.com%2Fsystem_event" AND
   "breakglass"' \
  | grep -E 'revision_name|breakglass'
```

The first entry names the blocked revision from step 9, and its message says that the image is not authorized by policy. The second entry names the breakglass revision from step 10 and shows your justification. If a command prints nothing, wait one minute and run it again. In production, create an alert on breakglass events.

12. Deploy the attested image again. A normal update or deploy clears the breakglass justification, so breakglass applies to one deployment only.

```bash
gcloud run deploy lab51-app --image="$ATTESTED" --region="$REGION"
gcloud run services describe lab51-app --region="$REGION" --format=yaml \
  | grep -E 'binary-authorization|image:'
```

The deployment succeeds. The breakglass annotation is gone, and `image:` shows the `v1` digest again.

## Check your work

```bash
gcloud container binauthz policy export
gcloud run services describe lab51-app --region="$REGION" --format=yaml \
  | grep -E 'binary-authorization|image:'
gcloud run revisions list --service=lab51-app --region="$REGION"
```

Expected output:

- The policy has `evaluationMode: REQUIRE_ATTESTATION`, `enforcementMode: ENFORCED_BLOCK_AND_AUDIT_LOG`, and `projects/PROJECT_ID/attestors/built-by-cloud-build` under `requireAttestationsBy`.
- The service has `run.googleapis.com/binary-authorization: default`, no breakglass annotation, and the `v1` digest as its image.
- Four revisions, or more if you repeated step 9. They are the first deployment, the blocked revision (not ready), the breakglass revision, and the last deployment. The last deployment serves all traffic.

## Explore

1. A team has one `cloudbuild.yaml` that builds the image, pushes it with the `images` field, and then runs `gcloud run deploy` in a last step. After you add the `built-by-cloud-build` rule, the deploy step fails. Why, and what is the fix?

<details><summary>Answer</summary>

Cloud Build creates the attestation only after the build pipeline completes successfully. Also, Cloud Build pushes the images in the `images` field only after all steps finish. So when the deploy step runs, the image has no attestation yet, and Binary Authorization blocks it. Use separate build config files for the build pipeline and the deployment pipeline. For example, a second build or a Cloud Deploy release deploys the digest after the first build has finished.

</details>

2. You want this policy in a project that already runs many services. How do you find the images that it would block, without blocking anything?

<details><summary>Answer</summary>

Use dry-run mode first. Set `enforcementMode` to `DRYRUN_AUDIT_LOG_ONLY`. Binary Authorization then checks each deployment against the policy, but it does not block it. It logs the result to Cloud Audit Logs. Read these entries, fix the pipelines that produce the images that the policy would block, and then change to `ENFORCED_BLOCK_AND_AUDIT_LOG`. To try it here:

```bash
sed 's/ENFORCED_BLOCK_AND_AUDIT_LOG/DRYRUN_AUDIT_LOG_ONLY/' /tmp/lab51-policy.yaml > /tmp/lab51-dryrun.yaml
gcloud container binauthz policy import /tmp/lab51-dryrun.yaml
```

Wait a few minutes. Then deploy `$UNATTESTED` without breakglass: the deployment succeeds. To find the event, run the query from step 11 with `"dry run"` in place of `"breakglass"`. A dry run never blocks anything, so do not expect it to protect production.

</details>

3. A developer redeploys the service with `--clear-binary-authorization`, and then deploys any image. How do you prevent this?

<details><summary>Answer</summary>

Binary Authorization on a Cloud Run service is a setting of the service, so a developer with permission to deploy can turn it off. Google recommends an organization policy that requires it. Set the constraint `run.allowedBinaryAuthorizationPolicies` to the value `default` on the organization, a folder, or a project. For example, run `gcloud resource-manager org-policies allow run.allowedBinaryAuthorizationPolicies default --organization=ORGANIZATION_ID`. Then Cloud Run services in that scope must use Binary Authorization with the policy of their project. This setting can affect running services. If services already run, Google recommends dry-run mode in the Binary Authorization policy first, and a review of the audit logs.

</details>

4. Why does breakglass write an audit log entry every time, and why must you not add the breakglass annotation to the service YAML file?

<details><summary>Answer</summary>

Breakglass bypasses the policy, so every use must be visible and justified. Cloud Run logs a breakglass event to Cloud Audit Logs even when the image satisfies the policy, so you can alert on every use. A normal deployment clears the justification, so the bypass applies to one deployment only. If you add the `run.googleapis.com/binary-authorization-breakglass` annotation to the service YAML file, every later deployment from that file bypasses enforcement. Use `--breakglass` on one command instead.

</details>

## Clean up

```bash
bash pcd/labs/51-provenance-binary-authorization/teardown.sh
```

The script, in order:

- Restores the Binary Authorization policy from `/tmp/lab51-policy-backup.yaml`. If that file is missing, it imports the default policy, which allows all images.
- Deletes the `lab51-app` Cloud Run service with all revisions.
- Deletes the `lab51-repo` repository with all images. Deleting an image also deletes its provenance.
- Deletes the `gs://lab51-PROJECT_ID` bucket with the uploaded build sources.
- Removes the project-level Logs Writer binding for `lab51-builder`.
- Deletes the `lab51-builder` and `lab51-run` service accounts.

The APIs stay enabled. The `built-by-cloud-build` attestor stays, because Cloud Build manages it.

## Docs used

- [Securing image deployments to Cloud Run and Google Kubernetes Engine](https://docs.cloud.google.com/build/docs/securing-builds/secure-deployments-to-run-gke)
- [Generate and validate build provenance](https://docs.cloud.google.com/build/docs/securing-builds/generate-validate-build-provenance)
- [Build configuration file schema](https://docs.cloud.google.com/build/docs/build-config-file-schema)
- [Build container images](https://docs.cloud.google.com/build/docs/building/build-containers)
- [Configure user-specified service accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
- [Binary Authorization overview](https://docs.cloud.google.com/binary-authorization/docs/overview)
- [Binary Authorization concepts](https://docs.cloud.google.com/binary-authorization/docs/key-concepts)
- [Policy YAML reference](https://docs.cloud.google.com/binary-authorization/docs/policy-yaml-reference)
- [Configure a policy using the gcloud CLI](https://docs.cloud.google.com/binary-authorization/docs/configuring-policy-cli)
- [REST Resource: projects.policy](https://docs.cloud.google.com/binary-authorization/docs/reference/rest/v1/projects.policy)
- [Enable Binary Authorization for Cloud Run](https://docs.cloud.google.com/binary-authorization/docs/run/enabling-binauthz-cloud-run)
- [Use breakglass (Cloud Run)](https://docs.cloud.google.com/binary-authorization/docs/run/using-breakglass-cloud-run)
- [View audit logs for Cloud Run events](https://docs.cloud.google.com/binary-authorization/docs/run/viewing-audit-logs-cloud-run)
- [Require Binary Authorization for Cloud Run](https://docs.cloud.google.com/binary-authorization/docs/run/requiring-binauthz-cloud-run)
- [Enable dry-run mode](https://docs.cloud.google.com/binary-authorization/docs/enabling-dry-run)
- [Cloud Audit Logs overview](https://docs.cloud.google.com/logging/docs/audit)
- [Binary Authorization IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/binaryauthorization)
- [gcloud container binauthz attestations list](https://docs.cloud.google.com/sdk/gcloud/reference/container/binauthz/attestations/list)
- [Artifact Analysis overview](https://docs.cloud.google.com/artifact-analysis/docs/artifact-analysis)
- [Optimize Python applications for Cloud Run](https://docs.cloud.google.com/run/docs/tips/python)
- [Binary Authorization pricing](https://cloud.google.com/binary-authorization/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
