---
id: 31-service-identity
title: "Per-service identities, least privilege, and service-to-service authentication"
objectives: ["1.2"]
minutes: 45
cost: "Less than $0.05 if you run teardown.sh when done. Cloud Run (180,000 vCPU-seconds and 2 million requests each month), Cloud Build (2,500 build-minutes each month), and Artifact Registry (0.5 GiB of storage each month) have free tiers."
requiresOrg: false
---

## Goal

Run two private Cloud Run services, each with its own service account and no project roles. Let the frontend call the backend with an ID token. Then test the backend from your computer as yourself and as the frontend service account, with no service account key.

## Exam relevance

- **One identity for each service.** Google recommends a user-managed service account for each service, with the minimum permissions. Without one, Cloud Run uses the Compute Engine default service account, which can have the Editor role ([Introduction to service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)). See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).
- **Service-to-service authentication.** The caller sends a Google-signed ID token whose audience is the URL of the receiving service. The caller's service account needs the Cloud Run Invoker role on the receiving service ([Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)). See [Secure service-to-service communication](note:1.2-service-to-service).
- **401 compared with 403.** A token with the wrong audience gets HTTP 401. A missing token, or a caller without the `run.routes.invoke` permission, gets HTTP 403 ([Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)).
- **ID tokens and access tokens.** Cloud Run takes an ID token, not an access token ([Token types](https://docs.cloud.google.com/docs/authentication/token-types)). See [Authenticating code to Google Cloud](note:1.2-authenticating-to-google-cloud).
- **Developer access without keys.** Developers test with `gcloud auth print-identity-token`, or they impersonate a service account. Neither method needs a key file ([Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers), [Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)).

## Before you start

- Complete [the setup lab](lab:00-setup). It grants the Cloud Run Builder role to the Compute Engine default service account, which runs the builds for source deployments. [Lab 10](lab:10-cloud-run-source-deploy) shows a dedicated build service account.
- **IAM:** you are the Owner of the lab project.
- **Tools:** the gcloud CLI and `curl`.
- **Time:** about 45 minutes. Each deployment from source takes a few minutes. Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs:

```bash
source pcd/labs/env.sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
```

## Steps

1. Create one service account for each service. Do not grant them any project roles.

   ```bash
   gcloud iam service-accounts create lab31-frontend --display-name="lab31 frontend identity"
   gcloud iam service-accounts create lab31-backend --display-name="lab31 backend identity"
   export FRONTEND_SA="lab31-frontend@${PROJECT_ID}.iam.gserviceaccount.com"
   export BACKEND_SA="lab31-backend@${PROJECT_ID}.iam.gserviceaccount.com"
   ```

   Single-purpose service accounts also make audit logs clear. Cloud Audit Logs show the service account that made a change, not the app that used it ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)).

2. Read the backend, then deploy it as a private service. Only callers with the `run.routes.invoke` permission on the service can reach it.

   ```bash
   cat pcd/labs/31-service-identity/backend/main.py
   gcloud run deploy lab31-backend \
     --source=pcd/labs/31-service-identity/backend \
     --region="$REGION" \
     --service-account="$BACKEND_SA" \
     --no-allow-unauthenticated \
     --max=1
   export BACKEND_URL="$(gcloud run services describe lab31-backend --region="$REGION" --format='value(status.url)')"
   echo "$BACKEND_URL"
   ```

   If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`.

   If the build fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deploys from source. Grant the role as in 00-setup. The grant takes a few minutes to propagate, so wait a few minutes before you deploy again. `teardown.sh` does not remove this grant, because other labs need it.

   ```bash
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role=roles/run.builder --condition=None
   ```

3. Read the frontend, then deploy it with the backend URL in an environment variable. The token code follows the Python sample in [Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service). On Cloud Run, `fetch_id_token` gets the token from the metadata server, for the service identity of the frontend.

   ```bash
   cat pcd/labs/31-service-identity/frontend/main.py
   gcloud run deploy lab31-frontend \
     --source=pcd/labs/31-service-identity/frontend \
     --region="$REGION" \
     --service-account="$FRONTEND_SA" \
     --no-allow-unauthenticated \
     --max=1 \
     --set-env-vars="BACKEND_URL=${BACKEND_URL}"
   export FRONTEND_URL="$(gcloud run services describe lab31-frontend --region="$REGION" --format='value(status.url)')"
   ```

4. Call the frontend before you grant any access. The frontend is private too, so the `call` function sends your ID token to it. The frontend then reports the status code that the backend returned to it.

   ```bash
   call() {  # usage: call URL
     curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$1"
   }
   call "$FRONTEND_URL"
   call "${FRONTEND_URL}/?token=none"
   ```

   Both calls print `backend status 403`. The first request had a valid ID token, but `lab31-frontend` does not have the `run.routes.invoke` permission on the backend. The second request had no token ([Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)). The backend code never returns `403`, so Cloud Run rejected both requests.

5. Grant the Cloud Run Invoker role to `lab31-frontend` on the backend service only. A project-level grant would let the frontend call every private service in the project.

   ```bash
   gcloud run services add-iam-policy-binding lab31-backend --region="$REGION" \
     --member="serviceAccount:${FRONTEND_SA}" --role=roles/run.invoker
   ```

   A role grant typically takes 2 minutes to propagate, and sometimes 7 minutes or longer ([Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)). Wait two minutes, then call the frontend in its three modes:

   ```bash
   call "$FRONTEND_URL"
   call "${FRONTEND_URL}/?token=none"
   call "${FRONTEND_URL}/?token=wrong-aud"
   ```

   Expected output:

   ```text
   backend status 200: hello from lab31-backend: email=lab31-frontend@PROJECT_ID.iam.gserviceaccount.com sub=NUMBER aud=BACKEND_URL
   backend status 403
   backend status 401
   ```

   If the first call still shows `403`, wait one more minute. The `aud` claim is the backend URL, so the token is good only for this service. The token for `https://example.com` gets `401`, even though the frontend now has the role: the audience must be the URL of the receiving service ([Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)).

6. Test the backend from your computer as yourself. This is the developer path: your user account gets an ID token from gcloud. As the project Owner, you have the `run.routes.invoke` permission.

   ```bash
   curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$BACKEND_URL"
   ```

   The backend shows the claims of your user ID token. The `aud` claim is not the backend URL: the audience of a user ID token is the OAuth client that asked for it, here the gcloud CLI ([Token types](https://docs.cloud.google.com/docs/authentication/token-types)). The same token works for any service where your account has the `run.routes.invoke` permission. The docs say that these tokens lack an audience claim, which makes them susceptible to replay attacks. Use them only for development ([Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)). For a private service, Google also removes the signature of these tokens (`SIGNATURE_REMOVED_BY_GOOGLE`), so the service cannot replay them ([Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)).

7. Test the backend as `lab31-frontend`, with impersonation and no key. The `--impersonate-service-account` flag needs the Service Account Token Creator role on the service account ([Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)). Grant yourself this role on this one service account. A project-level grant would let you impersonate every service account in the project ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)).

   ```bash
   gcloud iam service-accounts add-iam-policy-binding "$FRONTEND_SA" \
     --member="user:$(gcloud config get-value account)" --role=roles/iam.serviceAccountTokenCreator
   ```

   Wait two minutes for the grant. Then get an ID token for the service account, with the backend URL as the audience. `--include-email` adds the `email` claim to the token.

   ```bash
   export SA_TOKEN="$(gcloud auth print-identity-token --impersonate-service-account="$FRONTEND_SA" \
     --audiences="$BACKEND_URL" --include-email)"
   curl -s -H "Authorization: Bearer ${SA_TOKEN}" "$BACKEND_URL"
   ```

   The backend shows `email=lab31-frontend@...` and `aud=` the backend URL, the same as a call from the frontend service. gcloud created short-lived credentials for the service account, and no key file exists ([Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)). Impersonation also keeps an audit trail. Cloud Audit Logs can record the user who impersonated the service account. With a key, there is no reliable way to tell who used the key ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)).

   Code that needs only ID tokens can use a narrower role, Service Account OpenID Connect Identity Token Creator (`roles/iam.serviceAccountOpenIdTokenCreator`) ([Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)).

8. See why Google advises against the Compute Engine default service account. Look at its project roles. Then look for two permissions in the Editor role, and count all of its permissions.

   ```bash
   export COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
   gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
     --filter="bindings.members:${COMPUTE_SA}" --format="value(bindings.role)"
   gcloud iam roles describe roles/editor --format="value(includedPermissions)" | tr ';' '\n' \
     | grep -x -E 'run\.routes\.invoke|iam\.serviceAccountKeys\.create'
   gcloud iam roles describe roles/editor --format="value(includedPermissions.len())"
   gcloud iam roles describe roles/run.invoker --format="value(includedPermissions)"
   ```

   Your project has no organization, so the first command usually prints `roles/editor`. Depending on organization policy, Google can grant the Editor role to the default service account automatically ([Introduction to service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)). The Editor role lets a principal read and modify all resources in the project ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)). The `grep` command finds two of its permissions:

   - `run.routes.invoke`: code that runs as the default service account can call `lab31-backend` and every other private Cloud Run service in the project. Nobody has to grant it a role on a service. By default, project owners and editors can invoke Cloud Run services ([Access control with IAM](https://docs.cloud.google.com/run/docs/securing/managing-access)).
   - `iam.serviceAccountKeys.create`: the same code can create service account keys ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)).

   Compare the number of permissions in the Editor role with the three permissions of the Cloud Run Invoker role: `run.instances.invoke`, `run.jobs.run`, and `run.routes.invoke`. For services only, the Cloud Run Service Invoker role (`roles/run.servicesInvoker`) is narrower, with only `run.routes.invoke` ([Cloud Run IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles)). The labs never run code as the default service account.

9. List the roles of each lab service account: at the project level, on the backend service, and on the frontend service account itself.

   ```bash
   for sa in "$FRONTEND_SA" "$BACKEND_SA"; do
     echo "Project roles of ${sa}:"
     gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
       --filter="bindings.members:${sa}" --format="value(bindings.role)"
   done
   gcloud run services get-iam-policy lab31-backend --region="$REGION"
   gcloud iam service-accounts get-iam-policy "$FRONTEND_SA"
   ```

   Neither service account has a project role. `lab31-frontend` has one role on one resource: Cloud Run Invoker on `lab31-backend`. `lab31-backend` has no roles, because its code calls no Google Cloud API. The policy of the `lab31-frontend` service account gives you the Service Account Token Creator role.

## Check your work

```bash
call "$FRONTEND_URL"
call "${FRONTEND_URL}/?token=none"
call "${FRONTEND_URL}/?token=wrong-aud"
gcloud run services describe lab31-frontend --region="$REGION" \
  --format="value(spec.template.spec.serviceAccountName)"
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL"
```

Expected output:

- `backend status 200: hello from lab31-backend: email=lab31-frontend@...`
- `backend status 403`
- `backend status 401`
- `lab31-frontend@PROJECT_ID.iam.gserviceaccount.com`: the frontend runs as its own service account.
- `403` for a call to the backend without a token.

## Explore

1. The backend gets a custom domain, `api.example.com`. Which audience must the frontend request now?

   <details><summary>Answer</summary>

   Still the URL of the Cloud Run service, or a custom audience that you configure on the service. Custom domains are not supported for the `aud` value. The audience also stays the service URL when you call a specific traffic tag ([Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)).

   </details>

2. A developer runs the frontend code on a laptop with user credentials in Application Default Credentials. `fetch_id_token` fails. Why, and what do you suggest instead of a service account key?

   <details><summary>Answer</summary>

   The docs sample does not accept credentials for a user account ([Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)). For local tests, use `gcloud auth print-identity-token`, impersonation with `--impersonate-service-account` and `--audiences` (step 7), or `gcloud run services proxy`. The proxy sends the token of the active account and serves the private service on `http://localhost:8080` ([Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)).

   </details>

3. The backend already uses the `Authorization` header for its own application tokens. How does the frontend send the Cloud Run ID token?

   <details><summary>Answer</summary>

   In the `X-Serverless-Authorization: Bearer ID_TOKEN` header. If a request has both headers, Cloud Run checks only `X-Serverless-Authorization`. Cloud Run removes the signature of that token before it passes the request to the container ([Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)).

   </details>

4. A new version of the frontend must also read objects from one Cloud Storage bucket. Which token does it send to Cloud Storage, and which token does it send to the backend? Which grant does it need?

   <details><summary>Answer</summary>

   To Cloud Storage, an access token. Access tokens let clients call Google Cloud APIs. To the backend, an ID token with the backend URL as its audience. ID tokens can authenticate calls between services, but they cannot call Google APIs ([Token types](https://docs.cloud.google.com/docs/authentication/token-types)). An access token sent to the backend can cause a `401` ([Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)). The Cloud Client Libraries get the access token for the service identity automatically ([Introduction to service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)). Grant `lab31-frontend` a role such as Storage Object Viewer on that one bucket, not on the project.

   </details>

## Clean up

```bash
bash pcd/labs/31-service-identity/teardown.sh
```

The script deletes, in order:

- The `lab31-frontend` and `lab31-backend` services. The Cloud Run Invoker binding on `lab31-backend` goes with the service.
- The `lab31-frontend` and `lab31-backend` images in the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The `lab31-frontend` and `lab31-backend` service accounts. Your Token Creator binding goes with the `lab31-frontend` service account.

The lab grants no project-level roles, so there is nothing to remove from the project policy.

## Docs used

- [Introduction to service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)
- [Configure service identity for services](https://docs.cloud.google.com/run/docs/configuring/services/service-identity)
- [Authenticating service-to-service](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Secure Cloud Run services tutorial](https://docs.cloud.google.com/run/docs/tutorials/secure-services)
- [Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)
- [Access control with IAM (Cloud Run)](https://docs.cloud.google.com/run/docs/securing/managing-access)
- [Cloud Run IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles)
- [Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Build a Python application](https://docs.cloud.google.com/docs/buildpacks/python)
- [Quickstart: Build and deploy a Python (Flask) web app to Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-service)
- [Get an ID token](https://docs.cloud.google.com/docs/authentication/get-id-token)
- [Token types](https://docs.cloud.google.com/docs/authentication/token-types)
- [Verify VM identity](https://docs.cloud.google.com/compute/docs/instances/verifying-instance-identity)
- [Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)
- [Types of service accounts](https://docs.cloud.google.com/iam/docs/service-account-types)
- [Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [gcloud auth print-identity-token](https://docs.cloud.google.com/sdk/gcloud/reference/auth/print-identity-token)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
