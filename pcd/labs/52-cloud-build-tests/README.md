---
id: 52-cloud-build-tests
title: "Unit and integration tests in a Cloud Build pipeline"
objectives: ["2.3"]
minutes: 45
cost: "Less than $0.05 if you run teardown.sh when done. Cloud Build (2,500 build-minutes each month), Artifact Registry (0.5 GiB of storage each month), and Secret Manager (6 active secret versions each month) have free tiers. The lab repository has vulnerability scanning turned off, so its images cause no scan charges."
requiresOrg: false
---

## Goal

Run a Cloud Build pipeline that runs unit tests, builds an image, and starts the app and a Redis container inside the build. Integration tests then call the app, and Cloud Build pushes the image and uploads the test reports only when all tests pass. Then you add a bug that only the integration tests find, and you see that nothing is pushed.

## Exam relevance

- Test steps in `cloudbuild.yaml`: `id` and `waitFor` for parallel steps, a step `timeout`, and a failed test that stops the push. See [Automated integration tests in Cloud Build](note:2.3-integration-tests-cloud-build).
- A dependency and the app as containers on the `cloudbuild` Docker network, so that the integration tests run inside the build. See the same page.
- Unit tests with a fake client compared with integration tests against a real dependency. See [Emulating Google Cloud services for local development and unit tests](note:2.1-emulators).
- The `images` and `artifacts` fields, and pull request triggers with comment control. See [Building containers with Cloud Build and storing them in Artifact Registry](note:2.2-cloud-build-artifact-registry).
- A build service account with only the roles that the build needs, and the extra permission that a trigger needs. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).
- Secrets for tests, in Explore. See [Secrets, credentials, and keys: Secret Manager, Cloud KMS, and Workload Identity Federation](note:1.2-secrets-and-keys).

## Before you start

- Complete [00-setup](lab:00-setup) first. It makes `source pcd/labs/env.sh` work and enables the base APIs.
- **IAM:** you are the Owner of the lab project. Without Owner, you need roles to start builds (Cloud Build Editor), manage repositories (Artifact Registry Administrator), create buckets and service accounts, and grant roles. You also need the `iam.serviceAccounts.actAs` permission on the build service account, for example through Service Account User (`roles/iam.serviceAccountUser`). For the optional step 8, you also need Cloud Build Connection Admin (`roles/cloudbuild.connectionAdmin`).
- **Tools:** the gcloud CLI. You do not need Docker or Python on your computer. For the optional step 8, you need git and a GitHub account.
- **Time:** about 45 minutes, plus about 20 minutes for the optional step 8. Each build takes a few minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs.

```bash
source pcd/labs/env.sh
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com \
  storage.googleapis.com iam.googleapis.com
```

## Steps

1. Create a Docker repository with vulnerability scanning turned off, a bucket, and a service account for the build. The bucket holds the uploaded build source and the test reports.

```bash
export REPO=lab52-repo
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/lab52-app"
export BUCKET="gs://lab52-${PROJECT_ID}"
export BUILD_SA="lab52-builder@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud artifacts repositories create "$REPO" --repository-format=docker \
  --location="$REGION" --description="lab52 images" --disable-vulnerability-scanning
gcloud storage buckets create "$BUCKET" --location="$REGION" --uniform-bucket-level-access
gcloud iam service-accounts create lab52-builder --display-name="lab52 build service account"
```

2. Grant the build service account the roles that this build needs, each on the smallest resource. If a command fails because the service account does not exist yet, wait one minute and run it again.

| Role | Granted on | Why the build needs it |
|---|---|---|
| Storage Object Viewer (`roles/storage.objectViewer`) | The `lab52-PROJECT_ID` bucket | Read the uploaded source archive |
| Storage Object Creator (`roles/storage.objectCreator`) | The `lab52-PROJECT_ID` bucket | Upload the JUnit XML reports through the `artifacts` field |
| Artifact Registry Writer (`roles/artifactregistry.writer`) | The `lab52-repo` repository | Push the image through the `images` field |
| Logs Writer (`roles/logging.logWriter`) | The project | Write the build logs to Cloud Logging |

```bash
for role in roles/storage.objectViewer roles/storage.objectCreator; do
  gcloud storage buckets add-iam-policy-binding "$BUCKET" \
    --member="serviceAccount:${BUILD_SA}" --role="$role" > /dev/null
done
gcloud artifacts repositories add-iam-policy-binding "$REPO" --location="$REGION" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/artifactregistry.writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/logging.logWriter --condition=None > /dev/null
```

3. Read the build config while the role grants take effect. The folder also has the app (`main.py`), the unit tests (`test_unit.py`), and the integration tests (`test_integration.py`).

```bash
cat pcd/labs/52-cloud-build-tests/cloudbuild.yaml
```

Points to notice:

- **Parallel steps.** `install`, `build`, and `start-redis` have `waitFor: ['-']`, so they start when the build starts. A step without `waitFor` waits until all earlier steps complete successfully.
- **Two branches.** `unit-tests` waits for `install`. `start-app` waits for `build` and `start-redis`. `integration-tests` waits for both branches.
- **Shared packages.** Each step runs in a new container. The `install` step uses `pip install --user`, so that the later test steps can use the packages.
- **Containers inside the build.** `start-redis` and `start-app` run `docker run -d --network=cloudbuild`. The `-d` flag starts the container in the background, so the step ends and the container keeps running. Cloud Build attaches each step container to the `cloudbuild` Docker network, and the steps can communicate over it. So the `integration-tests` step calls the app at `http://lab52-app:8080`, and the app finds Redis by the container name `lab52-redis`.
- **Where this pattern comes from.** No single docs page shows it in a build. It combines three documented parts. Build steps communicate over the `cloudbuild` network ([Overview of Cloud Build](https://docs.cloud.google.com/build/docs/overview)). A `docker` step can run a nested container with `docker run --network=cloudbuild` ([Build container images](https://docs.cloud.google.com/build/docs/building/build-containers)). A dependency container runs in the background with `docker run -d`. The app container reaches it by its container name ([Deploying the Cloud Spanner Emulator locally](https://cloud.google.com/blog/topics/developers-practitioners/deploying-cloud-spanner-emulator-locally)).
- **Timeouts.** The two test steps have a step `timeout`. The build `timeout` is 900 seconds, and a step timeout must not be more than the build timeout.
- **Push and upload.** The `images` field pushes the image, and the `artifacts` field uploads the JUnit XML reports. Both act only after all steps succeed.
- **Image tag.** `$BUILD_ID` has a value in every build. `$SHORT_SHA` is empty in a build that you start with `gcloud builds submit`.

4. Run the build. `--region` sets `$LOCATION`, so the image goes to the repository in your region. `--service-account` selects the build service account.

```bash
gcloud builds submit pcd/labs/52-cloud-build-tests \
  --config=pcd/labs/52-cloud-build-tests/cloudbuild.yaml \
  --region="$REGION" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
```

Lines from parallel steps mix in the log. Each line starts with the step number and the step `id`, for example `Step #1 - "unit-tests"`. The unit tests show `3 passed`, and the integration tests show `2 passed`. At the end, gcloud prints the image and the status `SUCCESS`. If the build fails with a permission error, wait one minute and run it again.

5. Look at the pushed image and the uploaded test reports.

```bash
gcloud artifacts docker images list "$IMAGE" --include-tags
gcloud storage ls --recursive "${BUCKET}/reports/"
gcloud storage cat "${BUCKET}/reports/*/integration.xml"
```

There is one image. Its tag is the build ID. The bucket has one folder for the build, with `unit.xml`, `integration.xml`, and a manifest file `artifacts-BUILD_ID.json` that Cloud Build adds. The report shows `tests="2"` and `failures="0"`.

6. Add a bug that the unit tests cannot find. In a copy of the lab folder, change the default Redis port in `main.py` from 6379 to 6380. The unit tests replace the Redis client with a fake, so they still pass. The app container cannot reach Redis, so an integration test fails.

```bash
rm -rf /tmp/lab52-broken
cp -R pcd/labs/52-cloud-build-tests /tmp/lab52-broken
sed -i.bak 's/6379/6380/' /tmp/lab52-broken/main.py
grep -n REDISPORT /tmp/lab52-broken/main.py
gcloud builds submit /tmp/lab52-broken \
  --config=/tmp/lab52-broken/cloudbuild.yaml \
  --region="$REGION" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
```

The unit tests show `3 passed`. The integration tests show `1 failed, 1 passed`: `test_counter_is_stored_in_redis` fails, because the app cannot connect to Redis. The build ends with `FAILURE`, and gcloud prints an error.

7. Find what the failed build did. Get the ID of the newest build, and list the status of each step. Then look at the tags and the reports again.

```bash
export LAST_BUILD="$(gcloud builds list --region="$REGION" --sort-by=~createTime \
  --limit=1 --format='value(id)')"
gcloud builds describe "$LAST_BUILD" --region="$REGION" --flatten=steps \
  --format='table(steps.id,steps.status)'
gcloud artifacts docker tags list "$IMAGE"
gcloud storage ls "${BUCKET}/reports/"
```

`integration-tests` has the status `FAILURE`, and the other five steps have `SUCCESS`. The repository still has one tag, and the bucket still has one report folder. Cloud Build did not push the image and did not upload the reports, because a step failed. To find the cause of a failed test, read the log of the failed step. The log is in the terminal and on the build details page in the console.

8. **Optional:** run the same pipeline for each GitHub pull request. This step connects the lab project to GitHub. The connection gives Cloud Build access to the repositories that you select. If you do not want this, go to "Check your work".

   a. On GitHub, create a new private repository, for example `lab52-tests`, with a README file, so that it has a `main` branch. Then copy the app, the tests, and the build config to the root of the repository. Replace `OWNER` with your GitHub user name.

```bash
export GITHUB_REPO_URL=https://github.com/OWNER/lab52-tests.git
git clone "$GITHUB_REPO_URL" /tmp/lab52-github
cp pcd/labs/52-cloud-build-tests/{Dockerfile,cloudbuild.yaml,*.py,*.txt} /tmp/lab52-github/
git -C /tmp/lab52-github add .
git -C /tmp/lab52-github commit -m "Add the lab52 app, tests, and build config"
git -C /tmp/lab52-github push
```

   b. Create a connection to GitHub. The connection keeps its GitHub token in Secret Manager, so enable that API first.

```bash
gcloud services enable secretmanager.googleapis.com
gcloud builds connections create github lab52-conn --region="$REGION"
```

   The command prints a link. Open it, sign in to GitHub, and authorize the Cloud Build GitHub App. Cloud Build stores the authorization token as a secret in Secret Manager in your project. Then install the Cloud Build GitHub App on your GitHub account, and give it access to the `lab52-tests` repository only. Check the state of the connection:

```bash
gcloud builds connections describe lab52-conn --region="$REGION" \
  --format='value(installationState.stage,installationState.actionUri)'
```

   Continue when the stage is `COMPLETE`. If it is not, open the link in the output, complete the steps there, and run the command again.

   c. Link the repository to the connection. Then let `lab52-builder` create builds. A trigger uses its service account to create each build, so that service account needs the `cloudbuild.builds.create` permission. Cloud Build Editor has this permission and no access to Cloud Storage or Artifact Registry. The troubleshooting page suggests the Cloud Build Service Account role, which has many more permissions.

```bash
gcloud builds repositories create lab52-github --remote-uri="$GITHUB_REPO_URL" \
  --connection=lab52-conn --region="$REGION"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/cloudbuild.builds.editor --condition=None > /dev/null
```

   d. Create a pull request trigger.

```bash
gcloud builds triggers create github --name=lab52-pr-tests --region="$REGION" \
  --repository="projects/${PROJECT_ID}/locations/${REGION}/connections/lab52-conn/repositories/lab52-github" \
  --pull-request-pattern='^main$' \
  --comment-control=COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY \
  --build-config=cloudbuild.yaml \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --include-logs-with-status
```

   - `--pull-request-pattern` is a regular expression search on the base branch, the branch that the pull request merges into. `^main$` matches only `main`.
   - `--comment-control` decides who can start a build. The default, `COMMENTS_ENABLED`, needs a `/gcbrun` comment from an owner or collaborator on each pull request. With `COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY`, only pull requests from other users wait for that comment. Any user with read access can open a pull request, and its build runs the changed code.
   - For public repositories, Google recommends manual approvals. With `--require-approval`, a user with the Cloud Build Approver role must approve each build.
   - The build runs as the service account on the trigger. A trigger build ignores a service account in the build config. Give the trigger a service account with only the roles that the tests need.
   - `--include-logs-with-status` sends the build logs to GitHub.

   e. Push a change on a new branch.

```bash
git -C /tmp/lab52-github switch -c lab52-change
echo "A change to start the lab52 trigger." >> /tmp/lab52-github/README.md
git -C /tmp/lab52-github commit -am "Start the lab52 trigger"
git -C /tmp/lab52-github push -u origin lab52-change
```

   On GitHub, open a pull request from `lab52-change` to `main`. You own the repository, so the trigger starts a build at once. The **Checks** tab of the pull request shows the result and the build log. In your shell, the newest build has a trigger ID:

```bash
gcloud builds list --region="$REGION" --sort-by=~createTime --limit=1 \
  --format='table(id,status,buildTriggerId)'
```

## Check your work

```bash
gcloud builds list --region="$REGION" --sort-by=~createTime --limit=2 \
  --format='table(id,status,serviceAccount)'
gcloud artifacts docker tags list "$IMAGE"
gcloud storage ls --recursive "${BUCKET}/reports/"
gcloud projects get-iam-policy "$PROJECT_ID" --flatten=bindings \
  --filter="bindings.members:serviceAccount:${BUILD_SA}" --format='value(bindings.role)'
```

Expected output, if you did not do step 8:

- Two builds: the newest has the status `FAILURE` (step 6), and the other has `SUCCESS` (step 4). Both ran as `lab52-builder`.
- One tag: the ID of the successful build.
- One report folder with `unit.xml`, `integration.xml`, and `artifacts-BUILD_ID.json`.
- One project-level role for `lab52-builder`: `roles/logging.logWriter`.

If you did step 8, the newest build is the pull request build. You also see a second tag, a second report folder, and the role `roles/cloudbuild.builds.editor`.

## Explore

1. In step 6, only `integration-tests` failed. What happens to the other steps when `unit-tests` fails instead? Why is `allowFailure: true` wrong for a test step?

<details><summary>Answer</summary>

When a step fails, the build status is `FAILURE`. Steps that completed before the failure keep the status `SUCCESS`. Steps that are running at that time, for example `build`, become `CANCELLED`. Steps that did not start, for example `start-app` and `integration-tests`, stay `QUEUED`. Cloud Build does not push the image and does not upload the reports.

To try it, make the counter add 2, which the unit tests find:

```bash
cp pcd/labs/52-cloud-build-tests/main.py /tmp/lab52-broken/main.py
sed -i.bak 's/incr(key, 1)/incr(key, 2)/' /tmp/lab52-broken/main.py
gcloud builds submit /tmp/lab52-broken --config=/tmp/lab52-broken/cloudbuild.yaml \
  --region="$REGION" --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
  --gcs-source-staging-dir="${BUCKET}/source"
```

Then run the two commands of step 7 that get `LAST_BUILD` and describe it. The exact statuses depend on how far the parallel steps got.

With `allowFailure: true` on a test step, the build succeeds when the tests fail, if all other steps succeed. A failed test then no longer stops the build. `allowExitCodes` has the same effect for the exit codes that it lists.

</details>

2. How do you test the new Cloud Run revision itself, before it gets any traffic?

<details><summary>Answer</summary>

Add steps after the integration tests:

1. **Push.** Add a `docker push` step. The `images` field pushes only at the end of the build. A deploy step in the same build needs the image in Artifact Registry first. The Cloud Run deploy sample in the Cloud Build docs has this push step.
2. **Deploy with no traffic.** Run `gcloud run deploy SERVICE --image=IMAGE --no-traffic --tag=TAG`. The new revision gets its own URL, which starts with the tag, and it serves no user traffic.
3. **Test.** Send requests to the tag URL. For a private service, the build needs an ID token. Cloud Build makes ID tokens only for a user-specified service account. Grant it the Service Account OpenID Connect Identity Token Creator role (`roles/iam.serviceAccountOpenIdTokenCreator`), and the Cloud Run Invoker role on the service. Use the service URL as the token audience, not the tag URL.
4. **Promote.** Run `gcloud run services update-traffic SERVICE --to-tags=TAG=100`, or move the traffic in percentages.

The build service account also needs Cloud Run Admin (`roles/run.admin`), and Service Account User on the runtime service account of the service.

</details>

3. The integration tests need a database password. How do you give it to the build without putting it in `cloudbuild.yaml`?

<details><summary>Answer</summary>

Store the password in Secret Manager. Name the secret version in `availableSecrets`, and list the variable in the `secretEnv` field of the step that needs it. This example from the docs gives the secret to a Python step:

```yaml
steps:
- name: python:slim
  entrypoint: python
  args: ['main.py']
  secretEnv: ['MYSECRET']
availableSecrets:
  secretManager:
  - versionName: projects/$PROJECT_ID/secrets/mySecret/versions/latest
    env: 'MYSECRET'
```

Grant the build service account the Secret Manager Secret Accessor role (`roles/secretmanager.secretAccessor`) on the secret. To use the value in `args`, set `entrypoint: 'bash'`, pass `-c`, and write the variable as `$$MYSECRET`.

</details>

4. Your next app uses Spanner, Firestore, or Cloud SQL instead of Redis. How do you give its integration tests that dependency in the build?

<details><summary>Answer</summary>

| Dependency | The documented way | Notes |
|---|---|---|
| Spanner | The emulator image `gcr.io/cloud-spanner-emulator/emulator`, as a container | Port 9010 for gRPC and port 9020 for REST. The client libraries connect to the emulator when `SPANNER_EMULATOR_HOST` is set |
| Firestore, Pub/Sub, and the other Firebase emulators | `firebase emulators:exec SCRIPT` | Starts the emulators, runs the test script, and stops the emulators. The Firebase docs call it more appropriate for continuous integration |
| Cloud SQL | A test instance, and the Cloud SQL Auth Proxy in the background, in the same step as the test command | The build service account needs the Cloud SQL Client role. For a private IP instance, use a private pool in the same VPC network |

For the start commands and the environment variables of each emulator, see [Emulating Google Cloud services for local development and unit tests](note:2.1-emulators).

</details>

## Clean up

```bash
bash pcd/labs/52-cloud-build-tests/teardown.sh
```

The script deletes, in order:

- If you did step 8: the `lab52-pr-tests` trigger, the `lab52-github` repository link, and the `lab52-conn` connection. It also deletes the token secret of the connection in Secret Manager if the secret name starts with `lab52-conn`. Otherwise, it prints the secret name. Then delete that secret yourself if no other connection uses it.
- The `lab52-repo` repository, with all images.
- The `gs://lab52-PROJECT_ID` bucket, with the build sources and the test reports.
- The project-level Logs Writer and Cloud Build Editor bindings for `lab52-builder`.
- The `lab52-builder` service account.
- The local folders `/tmp/lab52-broken` and `/tmp/lab52-github`.

The build history and the build logs stay. The script does not change GitHub. If you did step 8, uninstall the Cloud Build GitHub App from your GitHub account. Delete the `lab52-tests` repository when you no longer need it.

## Docs used

- [Overview of Cloud Build](https://docs.cloud.google.com/build/docs/overview)
- [Build configuration file schema](https://docs.cloud.google.com/build/docs/build-config-file-schema)
- [Build container images](https://docs.cloud.google.com/build/docs/building/build-containers)
- [Deploying the Cloud Spanner Emulator locally](https://cloud.google.com/blog/topics/developers-practitioners/deploying-cloud-spanner-emulator-locally)
- [Configuring the order of build steps](https://docs.cloud.google.com/build/docs/configuring-builds/configure-build-step-order)
- [View build results](https://docs.cloud.google.com/build/docs/view-build-results)
- [REST Resource: projects.builds](https://docs.cloud.google.com/build/docs/api/reference/rest/v1/projects.builds)
- [Build and test Python applications](https://docs.cloud.google.com/build/docs/building/build-python)
- [Storing build artifacts in Cloud Storage](https://docs.cloud.google.com/build/docs/building/store-artifacts-in-cloud-storage)
- [Submit a build via the CLI and API](https://docs.cloud.google.com/build/docs/running-builds/submit-build-via-cli-api)
- [Substituting variable values](https://docs.cloud.google.com/build/docs/configuring-builds/substitute-variable-values)
- [Configure user-specified service accounts](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts)
- [Cloud Build roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/cloudbuild)
- [Troubleshooting build errors and more](https://docs.cloud.google.com/build/docs/troubleshooting)
- [Connect to a GitHub repository](https://docs.cloud.google.com/build/docs/automating-builds/github/connect-repo-github)
- [Building repositories from GitHub](https://docs.cloud.google.com/build/docs/automating-builds/github/build-repos-from-github)
- [gcloud builds triggers create github](https://docs.cloud.google.com/sdk/gcloud/reference/builds/triggers/create/github)
- [Gate builds on approval](https://docs.cloud.google.com/build/docs/securing-builds/gate-builds-on-approval)
- [Use secrets from Secret Manager](https://docs.cloud.google.com/build/docs/securing-builds/use-secrets)
- [Deploying to Cloud Run using Cloud Build](https://docs.cloud.google.com/build/docs/deploying-builds/deploy-cloud-run)
- [Authorize service-to-service access](https://docs.cloud.google.com/build/docs/securing-builds/authorize-service-to-service-access)
- [Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Rollbacks, gradual rollouts, and traffic migration](https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration)
- [Connect to a Redis instance from a Cloud Run service](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run)
- [Memorystore for Redis supported versions](https://docs.cloud.google.com/memorystore/docs/redis/supported-versions)
- [Emulate Spanner locally](https://docs.cloud.google.com/spanner/docs/emulator)
- [Install, configure and integrate Local Emulator Suite](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Connect from Cloud Build (Cloud SQL for PostgreSQL)](https://docs.cloud.google.com/sql/docs/postgres/connect-build)
- [Manage images](https://docs.cloud.google.com/artifact-registry/docs/docker/manage-images)
- [REST Resource: projects.locations.repositories](https://docs.cloud.google.com/artifact-registry/docs/reference/rest/v1/projects.locations.repositories)
- [General development tips (Cloud Run)](https://docs.cloud.google.com/run/docs/tips/general)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)
