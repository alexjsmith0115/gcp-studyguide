---
id: 53-workload-identity-federation
title: "Keyless CI/CD with Workload Identity Federation"
objectives: ["3.1"]
minutes: 35
cost: "Usually no charge. The IAM pricing page says: \"All use of Identity and Access Management API is free of charge.\" The Cloud Storage Always Free tier covers the one small object in us-central1, us-east1, and us-west1. In other regions, the object costs less than $0.01 per month. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Let a CI job read a release artifact in Cloud Storage with no service account key. A small local script acts as the token issuer of the CI system. Workload Identity Federation exchanges its tokens for short-lived Google Cloud tokens.

## Exam relevance

- Workload Identity Federation replaces service account keys for workloads outside Google Cloud: [Secure remote and workload access](note:3.1-secure-access).
- Service account keys are a security risk, and new organizations block key creation by default: [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- A deployment pipeline authenticates to Google Cloud with no stored secret: [SDLC, CI/CD, and service provisioning](note:4.1-sdlc-cicd).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI, Python 3.7 or later, `openssl`, and `curl`.
- Time: about 35 minutes. The optional step 12 takes about 15 minutes more and needs a GitHub repository.

```bash
source labs/env.sh
gcloud services enable iam.googleapis.com cloudresourcemanager.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com storage.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell. The files in `$LAB53_TMP` stay between shells.

```bash
export LAB53_TMP="${TMPDIR:-/tmp}/lab53"
mkdir -p -m 700 "$LAB53_TMP"
export IDP="labs/53-workload-identity-federation/fake_idp.py"
export POOL="lab53-pool"
export PROVIDER="lab53-provider"
export PROVIDER_NAME="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
export ISSUER="https://lab53-idp.example.com"
export AUDIENCE="https://iam.googleapis.com/${PROVIDER_NAME}"
export POOL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}"
export BUCKET="lab53-${PROJECT_ID}-artifacts"
export SA_EMAIL="lab53-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
```

A deleted pool keeps its name for 30 days. If you did this lab in the last 30 days, change `lab53-pool` to `lab53-pool-2` in the block above.

## Steps

1. Create the signing key of the token issuer. Google Cloud checks the signature of each CI token with the public keys of the issuer.

   ```bash
   python3 "$IDP" keys "$LAB53_TMP"
   cat "$LAB53_TMP/jwks.json"
   ```

   Expected: a JSON Web Key Set (JWKS) with one RSA key, `lab53-key-1`. The private key stays in `$LAB53_TMP`. Google Cloud gets only the public key set.

2. Create the workload identity pool. A pool holds external identities, and IAM grants roles to principals in the pool.

   ```bash
   gcloud iam workload-identity-pools create "$POOL" --location=global \
     --display-name="lab53 CI pool"
   ```

3. Create the OIDC provider in the pool. The provider tells the Security Token Service (STS) which issuer to trust and how to read its tokens.

   ```bash
   gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
     --location=global --workload-identity-pool="$POOL" \
     --issuer-uri="$ISSUER" --jwk-json-path="$LAB53_TMP/jwks.json" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id" \
     --attribute-condition="assertion.repository_owner_id == '1111'"
   gcloud iam workload-identity-pools providers describe "$PROVIDER" \
     --location=global --workload-identity-pool="$POOL" \
     --format="yaml(state,oidc.issuerUri,attributeMapping,attributeCondition)"
   ```

   Expected: `state: ACTIVE`, with the mapping and the condition. The issuer URL does not exist on the internet. That is not a problem, because you uploaded the public keys with `--jwk-json-path`. Use this method when the metadata endpoint of the issuer is not public. You can upload at most 8 keys ([Configure Workload Identity Federation with other identity providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)).

   The claim names copy GitHub Actions. GitHub uses one issuer URL for all its organizations. The attribute condition accepts only tokens from your organization. The mapping uses numeric IDs, not names. After you delete a repository or an organization, someone else can register the same name, but not the same ID ([Configure Workload Identity Federation with deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)).

4. Create the artifact bucket, and grant read access to one repository. With direct resource access, a federated principal gets a role on the resource with no service account between them.

   ```bash
   gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access
   echo "build 42: tests passed" > "$LAB53_TMP/release.txt"
   gcloud storage cp "$LAB53_TMP/release.txt" "gs://${BUCKET}/release.txt"
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="${POOL_SET}/attribute.repository_id/2222" \
     --role=roles/storage.objectViewer --format=none
   ```

   The member is a principal set: all identities in the pool with `repository_id` equal to `2222`. The identifier must use the project number, not the project ID. Cloud Storage accepts federated principals only on buckets with uniform bucket-level access ([Identity federation: products and limitations](https://docs.cloud.google.com/iam/docs/federated-identity-supported-services)).

5. Issue a token as the CI job. Each job gets a new token that identifies the repository, the owner, and the branch.

   ```bash
   python3 "$IDP" token "$LAB53_TMP" --iss "$ISSUER" --aud "$AUDIENCE" \
     --sub "repo:example-org/app:ref:refs/heads/main" \
     --claim repository_owner_id=1111 --claim repository_id=2222 --claim ref=refs/heads/main \
     > "$LAB53_TMP/job-token.jwt"
   python3 "$IDP" show "$LAB53_TMP/job-token.jwt"
   ```

   The `aud` claim is the URL of your provider. The provider has no list of allowed audiences. Thus STS accepts only the resource name of this provider, with or without `https:`. A token for a different service has a different audience, and STS rejects it. This check helps prevent confused deputy attacks ([Best practices for using Workload Identity Federation](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)). The token is valid for 10 minutes.

6. Exchange the job token for a federated access token. STS checks the signature, the audience, and the attribute condition before it issues a token.

   ```bash
   sts_exchange() {
     curl -s -X POST https://sts.googleapis.com/v1/token -H "Content-Type: application/json" -d @- <<EOF
   {
     "grantType": "urn:ietf:params:oauth:grant-type:token-exchange",
     "audience": "//iam.googleapis.com/${PROVIDER_NAME}",
     "scope": "https://www.googleapis.com/auth/cloud-platform",
     "requestedTokenType": "urn:ietf:params:oauth:token-type:access_token",
     "subjectTokenType": "urn:ietf:params:oauth:token-type:jwt",
     "subjectToken": "$(cat "$1")"
   }
   EOF
   }
   sts_exchange "$LAB53_TMP/job-token.jwt" > "$LAB53_TMP/sts-response.json"
   python3 "$IDP" save "$LAB53_TMP/sts-response.json" "$LAB53_TMP/federated-token.txt"
   ```

   Expected: `token_type` is `Bearer`, and `expires_in` shows the token lifetime in seconds. The script saves the token in a file and does not show it. The request has no `Authorization` header, because the job token is the only proof of identity ([Method: token](https://docs.cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token)). If the output shows an error, read `error_description`. If you did step 5 more than 10 minutes ago, do step 5 again.

7. Read the artifact with the federated token, then try to list the buckets. The token gives only the roles of the principal set.

   ```bash
   curl -s -H "Authorization: Bearer $(cat "$LAB53_TMP/federated-token.txt")" \
     "https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/release.txt?alt=media"
   curl -s -H "Authorization: Bearer $(cat "$LAB53_TMP/federated-token.txt")" \
     "https://storage.googleapis.com/storage/v1/b?project=${PROJECT_ID}"
   ```

   Expected: `build 42: tests passed`, then an error with `"code": 403`. The principal set can read objects in this bucket. It cannot list the buckets of the project, because that needs `storage.buckets.list` ([Buckets: list](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/list)). If the first command also returns 403, the IAM change is not in effect yet. A policy change typically takes 2 minutes, and potentially 7 minutes or longer ([Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)). Wait, and then do this step again.

8. Issue a token for a repository in a different organization, and try to exchange it. Any GitHub user can get a correctly signed token from the same issuer, so the attribute condition must stop it.

   ```bash
   python3 "$IDP" token "$LAB53_TMP" --iss "$ISSUER" --aud "$AUDIENCE" \
     --sub "repo:other-org/app:ref:refs/heads/main" \
     --claim repository_owner_id=9999 --claim repository_id=3333 --claim ref=refs/heads/main \
     > "$LAB53_TMP/other-token.jwt"
   sts_exchange "$LAB53_TMP/other-token.jwt"; echo
   ```

   If you opened a new shell after step 6, define `sts_exchange` again first. Expected: a response with `error` and `error_description`, and no `access_token`. The signature and the audience are correct, but `repository_owner_id` is not `1111`. Without the condition, STS gives a federated token to every repository that the issuer signs for. Then any role on the whole pool is open to all of them.

9. Create a service account for the impersonation method. A workload needs this method for products and methods that do not accept federated tokens.

   ```bash
   gcloud iam service-accounts create lab53-deployer --display-name="lab53 deployer"
   sleep 60
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="serviceAccount:${SA_EMAIL}" --role=roles/storage.objectViewer --format=none
   gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
     --member="${POOL_SET}/attribute.repository_id/2222" \
     --role=roles/iam.workloadIdentityUser --format=none
   ```

   For example, federated principals cannot create Cloud Storage signed URLs ([Identity federation: products and limitations](https://docs.cloud.google.com/iam/docs/federated-identity-supported-services)). A new service account can take 60 seconds or more to become usable ([Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)). The Workload Identity User role lets the principal set get tokens for this service account only. The service account has its own role on the bucket.

10. Exchange the federated token for a service account token, and read the artifact again. The job then has the roles of the service account, not the roles of the principal set.

    ```bash
    sleep 120
    curl -s -X POST -H "Authorization: Bearer $(cat "$LAB53_TMP/federated-token.txt")" \
      -H "Content-Type: application/json" \
      -d '{"scope": ["https://www.googleapis.com/auth/cloud-platform"], "lifetime": "600s"}' \
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA_EMAIL}:generateAccessToken" \
      > "$LAB53_TMP/sa-response.json"
    python3 "$IDP" save "$LAB53_TMP/sa-response.json" "$LAB53_TMP/sa-token.txt"
    curl -s -H "Authorization: Bearer $(cat "$LAB53_TMP/sa-token.txt")" \
      "https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/release.txt?alt=media"
    ```

    The IAM Service Account Credentials API issues the token, and the request sets its lifetime to 10 minutes. Expected: an `expireTime` 10 minutes from now, then `build 42: tests passed` ([Method: projects.serviceAccounts.generateAccessToken](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken)). If the output shows `PERMISSION_DENIED`, wait two minutes and do this step again. If it shows `UNAUTHENTICATED`, the federated token expired. Do steps 5 and 6 again, then this step.

11. Create two credential configuration files, one for each method. Client libraries, the gcloud CLI, and Terraform use this file to do steps 6 and 10 for you.

    ```bash
    gcloud iam workload-identity-pools create-cred-config "$PROVIDER_NAME" \
      --credential-source-file="$LAB53_TMP/job-token.jwt" \
      --output-file="$LAB53_TMP/cred-direct.json"
    gcloud iam workload-identity-pools create-cred-config "$PROVIDER_NAME" \
      --credential-source-file="$LAB53_TMP/job-token.jwt" --service-account="$SA_EMAIL" \
      --output-file="$LAB53_TMP/cred-sa.json"
    cat "$LAB53_TMP/cred-direct.json"
    diff "$LAB53_TMP/cred-direct.json" "$LAB53_TMP/cred-sa.json"
    ```

    The file has `"type": "external_account"`, the provider as `audience`, the STS `token_url`, and the path of the token file. It contains no key and no password. In the second file, `service_account_impersonation_url` replaces `token_info_url`. A CI job sets `GOOGLE_APPLICATION_CREDENTIALS` to the file path, or runs `gcloud auth login --cred-file=FILE` ([Configure Workload Identity Federation with other identity providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)). Do not run that `gcloud auth login` command in the lab shell. It changes the active account of your lab configuration.

12. Optional: connect a real GitHub Actions workflow. You need a GitHub repository that you can change. GitHub uses one issuer URL for all organizations, so the attribute condition must name your owner. Use the numeric IDs, because a deleted name can be claimed again ([Configure Workload Identity Federation with deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)).

    ```bash
    export GH_REPO="OWNER/REPOSITORY"   # replace with your repository
    curl -s "https://api.github.com/repos/${GH_REPO}" \
      | python3 -c 'import json, sys; r = json.load(sys.stdin); print(r["id"], r["owner"]["id"])'
    export GH_REPO_ID="REPOSITORY_ID"   # replace with the first number
    export GH_OWNER_ID="OWNER_ID"       # replace with the second number
    ```

    Create a second provider in the same pool for the GitHub issuer. GitHub publishes its keys, so you upload none. Then let your repository read the bucket.

    ```bash
    gcloud iam workload-identity-pools providers create-oidc lab53-github \
      --location=global --workload-identity-pool="$POOL" \
      --issuer-uri="https://token.actions.githubusercontent.com/" \
      --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id" \
      --attribute-condition="assertion.repository_owner_id == '${GH_OWNER_ID}'"
    gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
      --member="${POOL_SET}/attribute.repository_id/${GH_REPO_ID}" \
      --role="roles/storage.objectViewer"
    ```

    Write the workflow file. The `permissions` block lets the job get a GitHub ID token. The `auth` step writes a credential configuration file, and client libraries use it automatically. The step has no `service_account`, so the job uses direct resource access.

    ```bash
    cat > "$LAB53_TMP/lab53.yml" <<EOF
    name: lab53
    on: workflow_dispatch
    jobs:
      read-artifact:
        permissions:
          id-token: write
          contents: read
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v3
          - id: auth
            name: Authenticate to Google Cloud
            uses: google-github-actions/auth@v1
            with:
              create_credentials_file: true
              workload_identity_provider: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/lab53-github
          - name: Read the release artifact
            run: |
              pip install google-cloud-storage
              python3 -c "from google.cloud import storage; print(storage.Client(project='${PROJECT_ID}').bucket('${BUCKET}').blob('release.txt').download_as_text())"
    EOF
    cat "$LAB53_TMP/lab53.yml"
    ```

    Commit the file as `.github/workflows/lab53.yml` in your repository. Then run the `lab53` workflow from the **Actions** tab. Expected: the last step prints `build 42: tests passed`.

## Check your work

1. The provider is active and has the attribute condition:

   ```bash
   gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global \
     --workload-identity-pool="$POOL" --format="value(state, attributeCondition)"
   ```

   Expected: `ACTIVE` and `assertion.repository_owner_id == '1111'`.

2. Two principals can read objects in the bucket:

   ```bash
   gcloud storage buckets get-iam-policy "gs://${BUCKET}" --flatten="bindings[].members" \
     --format="value(bindings.role, bindings.members)" | grep objectViewer
   ```

   Expected: two lines with `roles/storage.objectViewer`. One has the principal set that ends in `attribute.repository_id/2222`. The other has `serviceAccount:lab53-deployer@...`.

3. The service account has no user-managed keys:

   ```bash
   gcloud iam service-accounts keys list --iam-account="$SA_EMAIL" --managed-by=user
   ```

   Expected: `Listed 0 items.`

4. The credential configuration files contain no private key:

   ```bash
   grep -c "PRIVATE KEY" "$LAB53_TMP/cred-direct.json" "$LAB53_TMP/cred-sa.json"
   ```

   Expected: a count of `0` for each file.

## Explore

1. Your pipelines move to GitHub Actions. What changes in the provider?

   <details><summary>Answer</summary>

   Set the issuer URL to `https://token.actions.githubusercontent.com/`, and do not upload keys. GitHub publishes its OIDC metadata, so Google Cloud downloads the keys itself ([Configure Workload Identity Federation with deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)). Keep a condition on the numeric `repository_owner_id` of your organization. To allow only the `main` branch, add `&& assertion.ref == 'refs/heads/main'` to the condition. You must map every claim that the condition uses.

   </details>

2. The issuer rotates its signing key. What must you do with an uploaded JWKS?

   <details><summary>Answer</summary>

   Upload a new key set with `gcloud iam workload-identity-pools providers update-oidc --jwk-json-path`. The update replaces all uploaded keys, and you cannot restore the replaced keys ([Configure Workload Identity Federation with other identity providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)). Tokens signed with a key that is not in the file then fail. Put the old and the new key in the file until the old tokens expire. With a public issuer URL, Google Cloud downloads the current keys, and you do nothing.

   </details>

3. When do you use service account impersonation instead of direct resource access?

   <details><summary>Answer</summary>

   Direct resource access is simpler, because you manage no service account. Use impersonation when a product or a method does not support federated principals ([Identity federation: products and limitations](https://docs.cloud.google.com/iam/docs/federated-identity-supported-services)). The symptom is a `401 UNAUTHENTICATED` error for a valid federated token ([Troubleshoot Workload Identity Federation](https://docs.cloud.google.com/iam/docs/troubleshooting-workload-identity-federation)). Use a dedicated service account for each application, in the same project as its resources ([Best practices for using Workload Identity Federation](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)).

   </details>

4. Twenty teams want to deploy from their own CI systems. How do you keep control of federation?

   <details><summary>Answer</summary>

   Manage all pools and providers in one dedicated project. Enforce the `constraints/iam.workloadIdentityPoolProviders` constraint to block new providers in other projects. Use one provider for each pool. Grant roles to principal sets by attribute, not to all identities in a pool ([Best practices for using Workload Identity Federation](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)). The constraint is an organization policy: [Organization policy, VPC Service Controls, and audit logging](note:3.1-security-controls).

   </details>

## Clean up

```bash
bash labs/53-workload-identity-federation/teardown.sh
[ -n "${LAB53_TMP:-}" ] && rm -rf "$LAB53_TMP"
```

The script deletes:

- the bucket `lab53-PROJECT_ID-artifacts` and its object, with the role bindings on the bucket,
- the service account `lab53-deployer` and its role bindings,
- the workload identity pool `lab53-pool` and its providers.

The deleted pool stays for 30 days. During that time, you can undelete it, and you cannot reuse its name ([Manage workload identity pools and providers](https://docs.cloud.google.com/iam/docs/manage-workload-identity-pools-providers)). If you used `lab53-pool-2`, run the script in the same shell, because it reads `$POOL`. The `rm` command deletes the private key of the token issuer. If you did step 12, also delete `.github/workflows/lab53.yml` from your repository.

## Docs used

- [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation)
- [Configure Workload Identity Federation with other identity providers](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Configure Workload Identity Federation with deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines)
- [Best practices for using Workload Identity Federation](https://docs.cloud.google.com/iam/docs/best-practices-for-using-workload-identity-federation)
- [Identity federation: products and limitations](https://docs.cloud.google.com/iam/docs/federated-identity-supported-services)
- [Manage workload identity pools and providers](https://docs.cloud.google.com/iam/docs/manage-workload-identity-pools-providers)
- [Troubleshoot Workload Identity Federation](https://docs.cloud.google.com/iam/docs/troubleshooting-workload-identity-federation)
- [Method: token (Security Token Service API)](https://docs.cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token)
- [Method: projects.serviceAccounts.generateAccessToken](https://docs.cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken)
- [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)
- [Objects: get](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/get)
- [Buckets: list](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/list)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [Identity and Access Management pricing](https://cloud.google.com/iam/pricing)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
