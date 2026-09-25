---
id: 54-org-policy-vpc-sc
title: Organization policy and VPC Service Controls
objectives: ["3.1"]
minutes: 90
cost: "Less than $0.01. VPC Service Controls and Access Context Manager have no separate charge. The lab stores one small object in Cloud Storage. Run teardown.sh when done."
requiresOrg: true
---

## Goal

Test two guardrails before you enforce them. You set an organization policy in dry-run mode, read the violations, and then enforce it. You also put the project in a dry-run service perimeter, find the requests that it would deny, and allow them with an access level.

## Exam relevance

- An organization policy controls *what* can be configured. IAM controls *who* can act. Dry-run mode, and the fact that constraints are not retroactive, are common exam points: [Organization policy, VPC Service Controls, and audit logging](note:3.1-security-controls).
- The safe rollout of VPC Service Controls is: dry run, read the Policy Denied audit logs, add access levels or ingress rules, then enforce. See the same page.
- Delegation: you grant the Organization Policy Administrator role on the organization. A scoped access policy lets a project team manage its own perimeter. See [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- Policy Denied audit logs are evidence for auditors: [Designing for compliance](note:3.2-compliance).
- Private access to Google APIs from VPC networks and from on-premises: [Access to Google APIs, the internet, and cloud-adjacent services](note:2.1-vpc-access-patterns).

## Before you start

This lab needs an organization resource. If your lab project has no organization, go to [No organization?](#no-organization) first.

The lab does not change organization-level settings. An organization administrator (this can be you) does these one-time tasks first:

1. Create the organization-level access policy, if it does not exist. Scoped policies do not operate without it ([Create an access policy](https://docs.cloud.google.com/access-context-manager/docs/create-access-policy)).
2. Create a scoped access policy whose scope is the lab project (`projects/PROJECT_NUMBER`). Grant you the Access Context Manager Editor role (`roles/accesscontextmanager.policyEditor`) on that policy. A delegated administrator can change only that policy ([Scoped policies](https://docs.cloud.google.com/access-context-manager/docs/scoped-policies)).
3. Grant you the Organization Policy Administrator role (`roles/orgpolicy.policyAdmin`). The lowest level where you can grant this role is the organization ([Organization Policy roles](https://docs.cloud.google.com/iam/docs/roles-permissions/orgpolicy)). The administrator can limit the grant with a tag condition. Then the lab project must have that tag ([Create organization policies](https://docs.cloud.google.com/organization-policy/create-organization-policies)).

Other needs:

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI.
- Time: about 90 minutes. Most of the time is waiting for policy changes to take effect.

```bash
source labs/env.sh
gcloud services enable orgpolicy.googleapis.com accesscontextmanager.googleapis.com \
  cloudresourcemanager.googleapis.com storage.googleapis.com iam.googleapis.com logging.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export ORG_ID="$(gcloud projects get-ancestors "$PROJECT_ID" --format="value(id,type)" | awk '$2=="organization"{print $1}')"
export POLICY_ID="$(gcloud access-context-manager policies list --organization="$ORG_ID" \
  --filter="scopes:projects/${PROJECT_NUMBER}" --format="value(name.basename())")"
export BUCKET="lab54-${PROJECT_ID}-data"
export CONSTRAINT="iam.managed.disableServiceAccountCreation"
export LAB54_TMP="$(mktemp -d)"
echo "org=${ORG_ID} access-policy=${POLICY_ID} bucket=${BUCKET}"
```

- If `org` is empty, the project is not in an organization.
- If `access-policy` is empty, you possibly cannot list the access policies of the organization. A delegated administrator often cannot. Ask your administrator for the number of the scoped policy, and run `export POLICY_ID=NUMBER`.

## Steps

1. Create a bucket and write one object. They are the data that the service perimeter protects.

   ```bash
   gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access
   printf 'customer records\n' | gcloud storage cp - "gs://${BUCKET}/records.txt"
   gcloud storage cat "gs://${BUCKET}/records.txt"
   ```

   The last command prints `customer records`.

2. Create a service perimeter that has only a dry-run configuration. It restricts Cloud Storage in the lab project, but it only logs the requests that it would deny.

   ```bash
   gcloud access-context-manager perimeters dry-run create lab54_perimeter --policy="$POLICY_ID" \
     --perimeter-title="lab54 perimeter" --perimeter-type=regular \
     --perimeter-resources="projects/${PROJECT_NUMBER}" \
     --perimeter-restricted-services=storage.googleapis.com
   gcloud access-context-manager perimeters dry-run describe lab54_perimeter --policy="$POLICY_ID"
   ```

   A perimeter name can contain only letters, numbers, and underscores, so the name uses `lab54_` ([Create a service perimeter](https://docs.cloud.google.com/vpc-service-controls/docs/create-service-perimeters)). A change to a perimeter can take up to 30 minutes to take effect ([Manage dry run configurations](https://docs.cloud.google.com/vpc-service-controls/docs/manage-dry-run-configurations)).

3. Look at the organization policy that applies to the project for the managed constraint `iam.managed.disableServiceAccountCreation`. This constraint blocks the creation of service accounts. The effective policy combines the policies that the project inherits.

   ```bash
   gcloud org-policies describe "$CONSTRAINT" --project="$PROJECT_ID" --effective
   ```

   The constraint is not enforced, unless your organization sets it.

4. Set the constraint in dry-run mode on the project only. A dry-run policy blocks nothing. It writes an audit log entry for each action that it would deny.

   ```bash
   cat > "${LAB54_TMP}/dry-run.yaml" <<EOF
   name: projects/${PROJECT_ID}/policies/${CONSTRAINT}
   dryRunSpec:
     rules:
     - enforce: true
   EOF
   gcloud org-policies set-policy "${LAB54_TMP}/dry-run.yaml" --update-mask='*'
   gcloud org-policies describe "$CONSTRAINT" --project="$PROJECT_ID"
   ```

   The output shows `dryRunSpec` with `enforce: true`. The update mask `*` replaces both parts of the policy: the live policy (`spec`) and the dry-run policy (`dryRunSpec`).

5. Wait for the two changes to take effect. A change to an organization policy can take up to 15 minutes ([Create organization policies](https://docs.cloud.google.com/organization-policy/create-organization-policies)).

   ```bash
   sleep 900
   ```

6. Create a service account. The live policy allows it, but the dry-run policy denies it, so Cloud Audit Logs records a dry-run violation.

   ```bash
   gcloud iam service-accounts create lab54-dryrun --display-name="lab54 dry-run test"
   gcloud logging read 'log_id("cloudaudit.googleapis.com/policy") AND protoPayload.metadata.dryRunResult="DENIED" AND protoPayload.metadata.liveResult="ALLOWED"' \
     --freshness=1h --limit=5 \
     --format="table(timestamp, protoPayload.methodName, protoPayload.metadata.constraint)"
   ```

   The service account exists, and the log shows an entry for the constraint. If the log is empty, wait two minutes and run the `gcloud logging read` command again. If it stays empty, the dry-run policy was possibly not in effect yet. Delete the service account with `gcloud iam service-accounts delete "lab54-dryrun@${PROJECT_ID}.iam.gserviceaccount.com" --quiet`, wait five minutes, and do this step again.

7. Read the object again. The request comes from outside the perimeter, and no access level allows it. The dry-run perimeter lets the request through and logs a violation.

   ```bash
   gcloud storage cat "gs://${BUCKET}/records.txt"
   gcloud logging read 'log_id("cloudaudit.googleapis.com/policy") AND severity="error" AND protoPayload.metadata.dryRun="true"' \
     --freshness=1h --limit=5 \
     --format="table(timestamp, protoPayload.methodName, protoPayload.requestMetadata.callerIp, protoPayload.metadata.violationReason)"
   ```

   The read works. The log shows violations with the reason `NO_MATCHING_ACCESS_LEVEL`: your IP address matches no access level of the perimeter ([Troubleshoot common issues](https://docs.cloud.google.com/vpc-service-controls/docs/troubleshooting)). If the log is empty, the perimeter is not in effect yet. Wait five minutes and do this step again.

8. Create an access level for your IP address, and add it to the dry-run configuration. A client that matches an access level of the perimeter can reach the restricted services from outside the perimeter.

   ```bash
   export MY_IP="$(gcloud logging read 'log_id("cloudaudit.googleapis.com/policy") AND protoPayload.metadata.dryRun="true"' \
     --freshness=1h --limit=1 --format="value(protoPayload.requestMetadata.callerIp)")"
   case "$MY_IP" in
     *:*) export MY_CIDR="${MY_IP}/128" ;;
     *) export MY_CIDR="${MY_IP}/32" ;;
   esac
   echo "MY_CIDR=${MY_CIDR}"
   cat > "${LAB54_TMP}/level.yaml" <<EOF
   - ipSubnetworks:
     - ${MY_CIDR}
   EOF
   gcloud access-context-manager levels create lab54_my_ip --policy="$POLICY_ID" \
     --title="lab54 my IP" --basic-level-spec="${LAB54_TMP}/level.yaml"
   gcloud access-context-manager perimeters dry-run update lab54_perimeter --policy="$POLICY_ID" \
     --add-access-levels=lab54_my_ip
   ```

   `MY_CIDR` must hold a public IP address. For a call from the internet, the log records a public IPv4 or IPv6 address. For a call from a Compute Engine VM, it can record an internal address, and for a call from inside Google, it records `private` ([VPC Service Controls audit logging](https://docs.cloud.google.com/vpc-service-controls/docs/audit-logging)). In those cases, run the lab from a computer on the internet.

9. Enforce the organization policy. The dry-run log showed the effect, so now you move the rule to the live policy.

   ```bash
   cat > "${LAB54_TMP}/live.yaml" <<EOF
   name: projects/${PROJECT_ID}/policies/${CONSTRAINT}
   spec:
     rules:
     - enforce: true
   EOF
   gcloud org-policies set-policy "${LAB54_TMP}/live.yaml" --update-mask='*'
   gcloud org-policies describe "$CONSTRAINT" --project="$PROJECT_ID"
   ```

   The output shows `spec` with `enforce: true`. The file has no `dryRunSpec`, so the update mask `*` also removes the dry-run policy.

10. Wait for the new organization policy and the access level to take effect.

    ```bash
    sleep 900
    ```

11. Try to create a second service account. The live policy denies it now. The first service account stays, because constraints are not retroactive.

    ```bash
    gcloud iam service-accounts create lab54-blocked --display-name="lab54 blocked test"
    gcloud iam service-accounts list --filter="email:lab54-" --format="value(email)"
    ```

    The create command fails, and the list shows only `lab54-dryrun`. If the create command works, the policy was not in effect yet. Delete `lab54-blocked` with `gcloud iam service-accounts delete "lab54-blocked@${PROJECT_ID}.iam.gserviceaccount.com" --quiet`, wait five minutes, and try again.

12. Read the object again, and make sure that the perimeter logs no new violation. The access level now matches your IP address, so the dry-run configuration allows the request.

    ```bash
    gcloud storage cat "gs://${BUCKET}/records.txt"
    sleep 60
    gcloud logging read 'log_id("cloudaudit.googleapis.com/policy") AND protoPayload.metadata.dryRun="true"' \
      --freshness=3m --format="table(timestamp, protoPayload.requestMetadata.callerIp, protoPayload.metadata.violationReason)"
    ```

    The read works, and the log command prints no entries. If you see a new `NO_MATCHING_ACCESS_LEVEL` entry, the access level is not in effect yet, or your IP address changed. Compare the `callerIp` with `MY_CIDR`, wait five minutes, and do this step again.

13. Delete the organization policy from the project. Without its own policy, the project inherits the policy of its parent again. While the constraint is enforced, some Google Cloud services cannot create their default service accounts ([Restrict IAM service account usage](https://docs.cloud.google.com/organization-policy/restrict-service-accounts)).

    ```bash
    gcloud org-policies delete "$CONSTRAINT" --project="$PROJECT_ID"
    gcloud org-policies describe "$CONSTRAINT" --project="$PROJECT_ID" --effective
    ```

14. **Optional.** Enforce the perimeter. The `dry-run enforce` command makes the dry-run configuration the enforced configuration. After that, the perimeter denies Cloud Storage requests from all other IP addresses, for every bucket in the lab project. If your IP address changes, you cannot read the bucket until you delete the perimeter. Do not run other labs while the perimeter is enforced.

    ```bash
    gcloud access-context-manager perimeters dry-run enforce lab54_perimeter --policy="$POLICY_ID"
    gcloud access-context-manager perimeters describe lab54_perimeter --policy="$POLICY_ID"
    ```

    After up to 30 minutes, `gcloud storage cat` still works from your computer. From another network, for example Cloud Shell, the same command fails with `Request is prohibited by organization's policy`.

## Check your work

1. The perimeter restricts Cloud Storage for the lab project and uses your access level:

   ```bash
   gcloud access-context-manager perimeters dry-run describe lab54_perimeter --policy="$POLICY_ID"
   ```

   Expected: `projects/PROJECT_NUMBER` under the resources, `storage.googleapis.com` under the restricted services, and `lab54_my_ip` in the access levels.

2. The access level holds your IP address:

   ```bash
   gcloud access-context-manager levels describe lab54_my_ip --policy="$POLICY_ID" --format="yaml(basic)"
   ```

   Expected: `ipSubnetworks` with the value of `MY_CIDR`.

3. Only the service account from the dry-run test exists:

   ```bash
   gcloud iam service-accounts list --filter="email:lab54-" --format="value(email)"
   ```

   Expected: `lab54-dryrun@PROJECT_ID.iam.gserviceaccount.com` only.

4. The project has no policy of its own for the constraint:

   ```bash
   gcloud org-policies list --project="$PROJECT_ID"
   ```

   Expected: no line for `iam.managed.disableServiceAccountCreation`.

5. The Policy Denied audit log keeps the dry-run violations from both tests:

   ```bash
   gcloud logging read 'log_id("cloudaudit.googleapis.com/policy")' --freshness=1d --limit=10 \
     --format="table(timestamp, protoPayload.serviceName, protoPayload.methodName)"
   ```

   Expected: entries for `iam.googleapis.com` and `storage.googleapis.com`.

## Explore

1. Your security team wants to enforce `iam.managed.disableServiceAccountCreation` for the whole organization. Some pipelines still create service accounts. How do you roll it out safely?

   <details><summary>Answer</summary>

   Set the constraint in dry-run mode on the organization. A dry-run policy is inherited like a live policy, and its violations go to the audit logs, but the actions are not denied ([Test organization policies](https://docs.cloud.google.com/organization-policy/test-policies)). Query the logs for `dryRunResult="DENIED"` and `liveResult="ALLOWED"` to find the projects that would break. Fix them, for example with service accounts in a central project that workloads use across projects ([Restrict IAM service account usage](https://docs.cloud.google.com/organization-policy/restrict-service-accounts)). Then set the live policy. Existing service accounts stay, because the constraint is not retroactive.

   </details>

2. In step 8, why did you add the access level to the dry-run configuration, and not to the enforced configuration?

   <details><summary>Answer</summary>

   Access levels have no dry-run mode. To test an access level, you create it and apply it only to the dry-run configuration of the perimeter ([Dry run mode for service perimeters](https://docs.cloud.google.com/vpc-service-controls/docs/dry-run-mode)). Changes to a dry-run configuration have no effect on enforcement. You enforce the configuration only after the logs show no unexpected violations.

   </details>

3. The access level in this lab lets your IP address reach every restricted service in the perimeter. A partner must read one bucket from their office network. What is a tighter design?

   <details><summary>Answer</summary>

   Use an ingress rule instead of a perimeter access level. The `from` block names the partner's access level (their IP range) and their identities. The `to` block names the project, the service `storage.googleapis.com`, and the read methods. Ingress rules can constrain the identities, the APIs, and the methods for a given source network or IP address ([Ingress and egress rules](https://docs.cloud.google.com/vpc-service-controls/docs/ingress-egress-rules)). IAM still decides whether the partner can read the objects.

   </details>

4. A developer has the Owner role on the lab project. Can the developer remove the perimeter or delete the organization policy?

   <details><summary>Answer</summary>

   No. The Owner role can read organization policies, but it does not include `orgpolicy.policy.set`. The Organization Policy Administrator role can be granted only on the organization ([Organization Policy roles](https://docs.cloud.google.com/iam/docs/roles-permissions/orgpolicy)). The perimeter belongs to an access policy. Only principals with an Access Context Manager role on that policy, or on the organization, can change it ([Access control with IAM](https://docs.cloud.google.com/access-context-manager/docs/access-control)). This lets a central team own the guardrails while project teams own the workloads.

   </details>

## Clean up

```bash
bash labs/54-org-policy-vpc-sc/teardown.sh
[ -n "${LAB54_TMP:-}" ] && rm -rf "$LAB54_TMP"
```

The script deletes:

- the perimeter `lab54_perimeter` and the access level `lab54_my_ip` (it uses `POLICY_ID` from your shell, or finds the scoped policy again),
- the project-level organization policy for `iam.managed.disableServiceAccountCreation`, if it still exists,
- the service accounts `lab54-dryrun` and `lab54-blocked`,
- the bucket and its object.

The script does not delete the scoped access policy and does not change role grants. Ask your administrator to remove them when you no longer need them. Did you enforce the perimeter in step 14, and did your IP address change? Then the bucket delete can fail until the perimeter deletion takes effect, up to 30 minutes later. Run the script again then.

## No organization?

Without an organization, you cannot do the steps of this lab:

- The Organization Policy Administrator role can be granted only on an organization. The Owner role on a project can read organization policies, but it cannot set them ([Organization Policy roles](https://docs.cloud.google.com/iam/docs/roles-permissions/orgpolicy)).
- Service perimeters and access levels live in an access policy, and an access policy belongs to an organization ([Create an access policy](https://docs.cloud.google.com/access-context-manager/docs/create-access-policy)).

You can still do these read-only checks in your lab project:

```bash
source labs/env.sh
gcloud services enable orgpolicy.googleapis.com accesscontextmanager.googleapis.com
gcloud org-policies list --project="$PROJECT_ID" --show-unset | grep -i serviceaccount
gcloud org-policies describe iam.managed.disableServiceAccountCreation --project="$PROJECT_ID" --effective
gcloud access-context-manager supported-services describe storage.googleapis.com
gcloud logging buckets describe _Required --location=global --format="value(retentionDays)"
gcloud logging buckets describe _Default --location=global --format="value(retentionDays)"
gcloud logging read 'log_id("cloudaudit.googleapis.com/activity")' --freshness=1d --limit=5 \
  --format="table(timestamp, protoPayload.methodName, protoPayload.authenticationInfo.principalEmail)"
```

- The two `gcloud org-policies` commands show the constraints that you could set, and the effective policy for one of them.
- The `supported-services` command shows how VPC Service Controls supports Cloud Storage.
- The two `gcloud logging buckets` commands show the retention of the `_Required` bucket (400 days) and the `_Default` bucket (30 days, unless you changed it) ([Quotas and limits](https://docs.cloud.google.com/logging/quotas)).
- The `gcloud logging read` command shows your recent Admin Activity audit logs.

To get an organization:

1. Sign up for Cloud Identity Free. You need a domain name that you own, and access to its domain registrar ([Set up Cloud Identity as a Google Cloud admin](https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin)).
2. After you create the account and verify the domain, Google creates the organization resource. For an existing Google Cloud user, the organization appears when you create a new project or billing account. Older projects stay under "No organization" ([Set up a Google Cloud organization resource](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization)).
3. Create a new lab project in the organization. You can also move the current lab project into the organization, but you cannot move it back to "No organization" without Cloud Customer Care ([Migrate projects between organization resources](https://docs.cloud.google.com/resource-manager/docs/project-migration)).

Standalone organizations do not need Cloud Identity, but they are only for new Free Trial customers, not for existing accounts ([Set up standalone organizations](https://docs.cloud.google.com/resource-manager/docs/standalone-organization-overview)). A new organization also gets baseline organization policies, for example a policy that blocks the creation of service account keys ([Manage baseline constraints](https://docs.cloud.google.com/organization-policy/manage-baseline-constraints)).

## Docs used

- [Test organization policies](https://docs.cloud.google.com/organization-policy/test-policies)
- [Create organization policies](https://docs.cloud.google.com/organization-policy/create-organization-policies)
- [Restrict IAM service account usage](https://docs.cloud.google.com/organization-policy/restrict-service-accounts)
- [Organization Policy roles](https://docs.cloud.google.com/iam/docs/roles-permissions/orgpolicy)
- [Scoped policies](https://docs.cloud.google.com/access-context-manager/docs/scoped-policies)
- [Create an access policy](https://docs.cloud.google.com/access-context-manager/docs/create-access-policy)
- [Access control with IAM (Access Context Manager)](https://docs.cloud.google.com/access-context-manager/docs/access-control)
- [Creating a basic access level](https://docs.cloud.google.com/access-context-manager/docs/create-basic-access-level)
- [Create a service perimeter](https://docs.cloud.google.com/vpc-service-controls/docs/create-service-perimeters)
- [Dry run mode for service perimeters](https://docs.cloud.google.com/vpc-service-controls/docs/dry-run-mode)
- [Manage dry run configurations](https://docs.cloud.google.com/vpc-service-controls/docs/manage-dry-run-configurations)
- [VPC Service Controls audit logging](https://docs.cloud.google.com/vpc-service-controls/docs/audit-logging)
- [Troubleshoot common issues](https://docs.cloud.google.com/vpc-service-controls/docs/troubleshooting)
- [Ingress and egress rules](https://docs.cloud.google.com/vpc-service-controls/docs/ingress-egress-rules)
- [Set up Cloud Identity as a Google Cloud admin](https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin)
- [Set up a Google Cloud organization resource](https://docs.cloud.google.com/resource-manager/docs/creating-managing-organization)
- [Set up standalone organizations](https://docs.cloud.google.com/resource-manager/docs/standalone-organization-overview)
- [Migrate projects between organization resources](https://docs.cloud.google.com/resource-manager/docs/project-migration)
- [Manage baseline constraints](https://docs.cloud.google.com/organization-policy/manage-baseline-constraints)
- [Cloud Logging quotas and limits](https://docs.cloud.google.com/logging/quotas)
- [VPC Service Controls pricing](https://cloud.google.com/vpc-service-controls/pricing) and [Access Context Manager pricing](https://cloud.google.com/access-context-manager/pricing)
