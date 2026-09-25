---
id: 50-iam-impersonation
title: IAM conditions, custom roles, and service account impersonation
objectives: ["3.1"]
minutes: 45
cost: "Less than $0.01. IAM is free. The lab stores a few bytes in Cloud Storage and writes a few audit log entries. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Give a dedicated service account least-privilege, time-bound access with a custom role and an IAM condition. Then use that access by impersonation, with no key, and trace it in Data Access audit logs and Policy Troubleshooter.

## Exam relevance

- Custom roles, grants at the smallest scope, and IAM Conditions: [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- Impersonation and short-lived credentials instead of service account keys: [Secure remote and workload access](note:3.1-secure-access).
- Data Access audit logs are off by default for most services: [Organization policy, VPC Service Controls, and audit logging](note:3.1-security-controls).
- Audit trails that show who acted through a service account: [Designing for compliance](note:3.2-compliance).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project. The lab gives you only the extra roles that it needs.
- Tools: the gcloud CLI and `python3`.
- Time: about 45 minutes, including about 30 minutes of waiting for the condition to expire (optional step 10).

```bash
source labs/env.sh
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com \
  policytroubleshooter.googleapis.com storage.googleapis.com logging.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export BUCKET="lab50-${PROJECT_ID}-data"
export ROLE_ID="lab50_objectReader"
export SA_EMAIL="lab50-reader@${PROJECT_ID}.iam.gserviceaccount.com"
export USER_EMAIL="$(gcloud config get account)"
export LAB50_TMP="$(mktemp -d)"
echo "bucket=$BUCKET user=$USER_EMAIL"
```

## Steps

1. Create a bucket and one object. IAM Conditions in a bucket's allow policy need uniform bucket-level access, so turn it on.

   ```bash
   gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access
   printf 'lab 50 test data\n' | gcloud storage cp - "gs://${BUCKET}/hello.txt"
   ```

2. Create a custom role with only the two permissions that the task needs. Role IDs can contain letters, digits, underscores, and periods, but no hyphens. So this role uses the `lab50_` prefix.

   ```bash
   gcloud iam roles create "$ROLE_ID" --project="$PROJECT_ID" \
     --title="Lab 50 object reader" \
     --description="Read and list objects only. Created by lab 50." \
     --permissions=storage.objects.get,storage.objects.list \
     --stage=GA
   ```

3. Create a dedicated service account. It has no user-managed keys, and it never gets one.

   ```bash
   gcloud iam service-accounts create lab50-reader --display-name="Lab 50 reader"
   gcloud iam service-accounts keys list --iam-account="$SA_EMAIL" --managed-by=user
   ```

4. Grant the custom role on the bucket only, with a condition that expires in 30 minutes. This is least privilege in scope (one bucket) and in time.

   ```bash
   export EXPIRY="$(python3 -c 'import datetime as d; t = d.datetime.now(d.timezone.utc) + d.timedelta(minutes=30); print(t.strftime("%Y-%m-%dT%H:%M:%SZ"))')"
   echo "The grant expires at $EXPIRY"
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="serviceAccount:${SA_EMAIL}" \
     --role="projects/${PROJECT_ID}/roles/${ROLE_ID}" \
     --condition="expression=request.time < timestamp('${EXPIRY}'),title=lab50-expires-30m"
   ```

   A new service account can take 60 seconds or more to become usable. If the command reports that the service account does not exist, wait 60 seconds and run it again ([Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)).

5. Let your user impersonate this one service account. Grant Service Account Token Creator on the service account, not on the project. A project-level grant would let you impersonate every service account in the project.

   ```bash
   gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
     --member="user:${USER_EMAIL}" \
     --role="roles/iam.serviceAccountTokenCreator"
   ```

6. Turn on Data Access audit logs (`DATA_READ`) for Cloud Storage. This setting lives in the project's allow policy. Use a read-modify-write that keeps `bindings` and `etag`, so that no role binding changes. The helper script edits only `auditConfigs`.

   ```bash
   gcloud projects get-iam-policy "$PROJECT_ID" --format=json > "$LAB50_TMP/policy.json"
   python3 labs/50-iam-impersonation/audit_config.py enable storage.googleapis.com \
     < "$LAB50_TMP/policy.json" > "$LAB50_TMP/policy-new.json"
   diff "$LAB50_TMP/policy.json" "$LAB50_TMP/policy-new.json"
   gcloud projects set-iam-policy "$PROJECT_ID" "$LAB50_TMP/policy-new.json" --format=none
   ```

   The `diff` must show only new `auditConfigs` lines. If `set-iam-policy` reports a conflict, run this step again from the first command.

7. Wait for the IAM changes to take effect, then read the object as the service account. Policy changes typically take 2 minutes, and sometimes 7 minutes or longer.

   ```bash
   sleep 120
   gcloud storage cat "gs://${BUCKET}/hello.txt" --impersonate-service-account="$SA_EMAIL"
   gcloud storage ls "gs://${BUCKET}" --impersonate-service-account="$SA_EMAIL"
   ```

   If you get a `403` error, wait two more minutes and try again.

8. Try two actions that the custom role does not allow. Both must fail with `403`.

   ```bash
   gcloud storage rm "gs://${BUCKET}/hello.txt" --impersonate-service-account="$SA_EMAIL"
   gcloud storage buckets list --impersonate-service-account="$SA_EMAIL"
   ```

9. Read the Data Access audit log entries. `principalEmail` shows the service account. `serviceAccountDelegationInfo` shows the user who impersonated it. Entries can take a minute to appear.

   ```bash
   gcloud logging read "logName=\"projects/${PROJECT_ID}/logs/cloudaudit.googleapis.com%2Fdata_access\" AND protoPayload.serviceName=\"storage.googleapis.com\" AND protoPayload.authenticationInfo.principalEmail=\"${SA_EMAIL}\"" \
     --freshness=1h --limit=5 \
     --format="table(timestamp, protoPayload.methodName, protoPayload.authenticationInfo.serviceAccountDelegationInfo[0].firstPartyPrincipal.principalEmail)"
   ```

10. Ask Policy Troubleshooter why the service account has access, now and after the expiry time. The `--request-time` flag gives the context that a time condition needs. Troubleshooting of conditional role bindings is a Preview feature.

    ```bash
    NOW="$(python3 -c 'import datetime as d; print(d.datetime.now(d.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))')"
    gcloud policy-intelligence troubleshoot-policy iam \
      "//storage.googleapis.com/projects/_/buckets/${BUCKET}" \
      --principal-email="$SA_EMAIL" --permission=storage.objects.get \
      --request-time="$NOW"
    gcloud policy-intelligence troubleshoot-policy iam \
      "//storage.googleapis.com/projects/_/buckets/${BUCKET}" \
      --principal-email="$SA_EMAIL" --permission=storage.objects.get \
      --request-time="2099-01-01T00:00:00Z"
    gcloud policy-intelligence troubleshoot-policy iam \
      "//storage.googleapis.com/projects/_/buckets/${BUCKET}" \
      --principal-email="$SA_EMAIL" --permission=storage.objects.delete \
      --request-time="$NOW"
    ```

    Optional: after the time in `$EXPIRY`, run the `gcloud storage cat` command from step 7 again. It now fails with `403`.

## Check your work

```bash
gcloud iam roles describe "$ROLE_ID" --project="$PROJECT_ID" --format="yaml(includedPermissions, stage)"
gcloud iam service-accounts keys list --iam-account="$SA_EMAIL" --managed-by=user
gcloud storage buckets get-iam-policy "gs://${BUCKET}" --format=json
gcloud projects get-iam-policy "$PROJECT_ID" --format="yaml(auditConfigs)"
```

Expected results:

- The role has exactly `storage.objects.get` and `storage.objects.list`, and the stage is `GA`.
- The key list is empty: the service account has no user-managed keys.
- The bucket policy has a binding for the custom role with the condition title `lab50-expires-30m`.
- `auditConfigs` has `storage.googleapis.com` with `logType: DATA_READ`.
- In step 7, `gcloud storage cat` prints `lab 50 test data`. In step 8, both commands fail with `403`.
- In step 9, each row shows your user email in the delegation column.
- In step 10, the first check grants access, and the two other checks do not.

## Explore

1. A colleague asks for the Service Account Token Creator role on the whole project "to make things simpler". What do you answer?

   <details><summary>Answer</summary>

   Refuse. A project-level grant lets the user impersonate every service account in the project, including service accounts with roles in other projects. Grant the role on each service account that the user needs ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)).

   </details>

2. Production support engineers need temporary write access several times each month, with a justification and an approval. Is a hand-written condition the right tool?

   <details><summary>Answer</summary>

   No. Use a Privileged Access Manager entitlement. It defines who can request which roles and for how long, can require justification and approval, and revokes the roles when the grant ends ([Privileged Access Manager overview](https://docs.cloud.google.com/iam/docs/pam-overview)).

   </details>

3. The same user already had the Storage Admin role on the project with no condition. Would the 30-minute condition limit that user?

   <details><summary>Answer</summary>

   No. A conditional binding does not override an unconditional binding. Also, Storage Admin contains much more than the custom role. Remove the broad, unconditional grant ([Overview of IAM Conditions](https://docs.cloud.google.com/iam/docs/conditions-overview)).

   </details>

4. Auditors also want a record of each short-lived token that users create for the service account. What must you turn on?

   <details><summary>Answer</summary>

   Data Access audit logs for IAM. IAM writes audit logs for short-lived credential creation only when these logs are on ([Example logs for service accounts](https://docs.cloud.google.com/iam/docs/audit-logging/examples-service-accounts)).

   </details>

## Clean up

```bash
bash labs/50-iam-impersonation/teardown.sh
```

The script does the following:

- Removes the Cloud Storage Data Access audit config from the project's allow policy. It keeps all bindings and any other audit configs.
- Deletes the bucket and its object. The conditional binding goes with the bucket.
- Deletes the `lab50-reader` service account. You can undelete a service account for 30 days.
- Deletes the `lab50_objectReader` custom role. You can undelete it for 7 days. After that, permanent deletion can take up to 30 more days. You cannot reuse the role ID until the role is permanently deleted.

The APIs stay enabled. They cost nothing when you do not use them.

## Docs used

- [Roles overview](https://docs.cloud.google.com/iam/docs/roles-overview)
- [Create and manage custom roles](https://docs.cloud.google.com/iam/docs/creating-custom-roles)
- [Overview of IAM Conditions](https://docs.cloud.google.com/iam/docs/conditions-overview)
- [Use service account impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation)
- [Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)
- [Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)
- [Enable Data Access audit logs](https://docs.cloud.google.com/logging/docs/audit/configure-data-access)
- [Cloud Audit Logs with Cloud Storage](https://docs.cloud.google.com/storage/docs/audit-logging)
- [Example logs for service accounts](https://docs.cloud.google.com/iam/docs/audit-logging/examples-service-accounts)
- [Troubleshoot IAM permissions](https://docs.cloud.google.com/policy-intelligence/docs/troubleshoot-access)
- [Full resource names](https://docs.cloud.google.com/iam/docs/full-resource-names)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [Delete and undelete service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-delete-undelete)
- [Identity and Access Management pricing](https://cloud.google.com/iam/pricing)
- [Google Cloud Observability pricing](https://cloud.google.com/products/observability/pricing)
- [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)
