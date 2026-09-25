---
id: 51-kms-cmek-secrets
title: CMEK with Cloud KMS and Secret Manager
objectives: ["3.1"]
minutes: 45
cost: "Less than $0.01 for the lab steps. The two Cloud KMS key versions cost about $0.06 each per month while they are active. Run teardown.sh when done, with --destroy-key-versions to stop the key charges."
requiresOrg: false
---

## Goal

Protect a Cloud Storage bucket with a customer-managed encryption key (CMEK). Then rotate, disable, and re-enable the key to see what happens to the data. Store a database password in Secret Manager, and let one service account read it, with no key file.

## Exam relevance

- CMEK, key location, rotation, disabling, and re-encryption: [Encryption, Cloud KMS, and secrets](note:3.1-data-protection-kms).
- The service agent uses the key, and people do not need a role on it: [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- Impersonation instead of service account keys: [Secure remote and workload access](note:3.1-secure-access).
- Crypto-shredding and key control as audit evidence: [Designing for compliance](note:3.2-compliance).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI.
- Time: about 45 minutes, including about 6 minutes of waiting.

```bash
source labs/env.sh
gcloud services enable cloudkms.googleapis.com secretmanager.googleapis.com \
  storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export KEYRING="lab51-keyring"
export KEY="lab51-key"
export KEY_NAME="projects/${PROJECT_ID}/locations/${REGION}/keyRings/${KEYRING}/cryptoKeys/${KEY}"
export BUCKET="lab51-${PROJECT_ID}-cmek"
export SECRET="lab51-db-password"
export SA_EMAIL="lab51-app@${PROJECT_ID}.iam.gserviceaccount.com"
export USER_EMAIL="$(gcloud config get account)"
echo "key=$KEY_NAME"
```

## Steps

1. Create a key ring and a key in the same region as the bucket that you create in step 3. A CMEK must be in the same location as the resource, and you cannot move a key ring later.

   ```bash
   gcloud kms keyrings create "$KEYRING" --location="$REGION"
   gcloud kms keys create "$KEY" --keyring="$KEYRING" --location="$REGION" \
     --purpose=encryption --protection-level=software --destroy-scheduled-duration=24h
   gcloud kms keys describe "$KEY" --keyring="$KEYRING" --location="$REGION" \
     --format="yaml(primary.name, primary.state, versionTemplate.protectionLevel, destroyScheduledDuration)"
   export V1="$(gcloud kms keys describe "$KEY" --keyring="$KEYRING" --location="$REGION" \
     --format='value(primary.name.basename())')"
   echo "The primary key version is $V1"
   ```

   The key has no rotation schedule, so it keeps one version until you rotate it. In production, set `--rotation-period`. The 24-hour scheduled-destruction duration is only for this lab. Google recommends the 30-day default.

   If you ran this lab before, the key ring and key already exist, and the create commands fail. Run `gcloud kms keys versions create --key="$KEY" --keyring="$KEYRING" --location="$REGION" --primary`, then run the last two commands of this step again. If you deleted the key in an earlier run, you cannot reuse its name. Set `KEY` to a new name in the variables block and in `teardown.sh`.

2. Let the Cloud Storage service agent use the key. The service agent encrypts and decrypts objects for everyone who reads the bucket, so people do not need a role on the key.

   ```bash
   gcloud storage service-agent --project="$PROJECT_ID" --authorize-cmek="$KEY_NAME"
   gcloud kms keys get-iam-policy "$KEY" --keyring="$KEYRING" --location="$REGION"
   ```

   The policy has one binding: the Cloud KMS CryptoKey Encrypter/Decrypter role for `service-PROJECT_NUMBER@gs-project-accounts.iam.gserviceaccount.com`.

3. Create a bucket that uses the key as its default key, and write one object. Cloud Storage records the key version that encrypted each object.

   ```bash
   gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" \
     --uniform-bucket-level-access --default-encryption-key="$KEY_NAME"
   gcloud storage buckets describe "gs://${BUCKET}" --format="default(default_kms_key)"
   printf 'written before rotation\n' | gcloud storage cp - "gs://${BUCKET}/before.txt"
   gcloud storage objects describe "gs://${BUCKET}/before.txt" --format="default(kms_key)"
   ```

   The `kms_key` value ends with `cryptoKeyVersions/` and the number in `$V1`. If the bucket command reports a permission error for the service agent, wait one minute and run it again.

4. Rotate the key by hand, then write a second object. Rotation makes a new primary version for new data only.

   ```bash
   gcloud kms keys versions create --key="$KEY" --keyring="$KEYRING" --location="$REGION" --primary
   export V2="$(gcloud kms keys describe "$KEY" --keyring="$KEYRING" --location="$REGION" \
     --format='value(primary.name.basename())')"
   echo "Old primary: $V1. New primary: $V2."
   sleep 60
   printf 'written after rotation\n' | gcloud storage cp - "gs://${BUCKET}/after.txt"
   gcloud storage objects describe "gs://${BUCKET}/before.txt" --format="default(kms_key)"
   gcloud storage objects describe "gs://${BUCKET}/after.txt" --format="default(kms_key)"
   ```

   `before.txt` still uses version `$V1`, and `after.txt` uses version `$V2`. A change of the primary version is eventually consistent. If `after.txt` shows the old version, wait one minute and copy it again.

5. Disable the old key version. Only the data that this version encrypted becomes unreadable. Disabling is eventually consistent, so wait before you test.

   ```bash
   gcloud kms keys versions disable "$V1" --key="$KEY" --keyring="$KEYRING" --location="$REGION"
   sleep 90
   gcloud storage cat "gs://${BUCKET}/before.txt"
   gcloud storage cat "gs://${BUCKET}/after.txt"
   gcloud storage ls "gs://${BUCKET}"
   ```

   The first command fails with an error about the Cloud KMS key. The second command prints `written after rotation`. The list still shows both objects, because Cloud Storage does not use the CMEK for object names. If the first command still works, wait one more minute. In exceptional cases, the delay can be hours. To block access at once, remove the IAM role instead.

6. Enable the old version again, then re-encrypt the old object with the current primary version. After re-encryption, no object depends on the old version, so you could destroy that version without data loss.

   ```bash
   gcloud kms keys versions enable "$V1" --key="$KEY" --keyring="$KEYRING" --location="$REGION"
   gcloud storage cat "gs://${BUCKET}/before.txt"
   gcloud storage objects update "gs://${BUCKET}/before.txt" --encryption-key="$KEY_NAME"
   gcloud storage objects describe "gs://${BUCKET}/before.txt" --format="default(kms_key)"
   ```

   Enabling is strongly consistent, so the `cat` command works at once. The `--encryption-key` flag makes Cloud Storage rewrite the object. Now `before.txt` uses version `$V2`.

7. Create a secret with two versions. User-managed replication keeps the secret data in the region that you choose. You cannot change the locations later.

   ```bash
   printf 'db-password-v1' | gcloud secrets create "$SECRET" \
     --replication-policy=user-managed --locations="$REGION" --data-file=-
   printf 'db-password-v2' | gcloud secrets versions add "$SECRET" --data-file=-
   gcloud secrets versions list "$SECRET"
   ```

8. Create a service account for the application, and grant it access to this one secret, not to the project. Then let your user impersonate this one service account, so that you can test as the application without a key.

   ```bash
   gcloud iam service-accounts create lab51-app --display-name="Lab 51 app"
   gcloud secrets add-iam-policy-binding "$SECRET" \
     --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor"
   gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
     --member="user:${USER_EMAIL}" --role="roles/iam.serviceAccountTokenCreator"
   ```

   A new service account can take 60 seconds or more to become usable. If a command reports that the service account does not exist, wait 60 seconds and run it again ([Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)).

9. Read pinned secret versions as the application. An application should read a version number, not `latest`, so that a release can test and roll back a secret change.

   ```bash
   sleep 120
   gcloud secrets versions access 2 --secret="$SECRET" --impersonate-service-account="$SA_EMAIL"
   gcloud secrets versions access 1 --secret="$SECRET" --impersonate-service-account="$SA_EMAIL"
   gcloud secrets list --impersonate-service-account="$SA_EMAIL"
   ```

   The first two commands print the passwords. The `list` command fails with a permission error, because the service account has no role on the project. If the first command fails with `403`, wait two more minutes: IAM changes can take 7 minutes or longer.

10. Retire the old password. Google recommends that you disable a secret version before you destroy it, because you can undo a disable.

    ```bash
    gcloud secrets versions disable 1 --secret="$SECRET"
    gcloud secrets versions access 1 --secret="$SECRET" --impersonate-service-account="$SA_EMAIL"
    gcloud secrets versions access 2 --secret="$SECRET" --impersonate-service-account="$SA_EMAIL"
    ```

    Version 1 fails because it is disabled. Version 2 still works.

## Check your work

```bash
gcloud kms keys versions list --key="$KEY" --keyring="$KEYRING" --location="$REGION" \
  --format="table(name.basename(), state, protectionLevel)"
gcloud storage objects describe "gs://${BUCKET}/before.txt" --format="default(kms_key)"
gcloud storage objects describe "gs://${BUCKET}/after.txt" --format="default(kms_key)"
gcloud secrets versions list "$SECRET"
gcloud secrets get-iam-policy "$SECRET"
gcloud iam service-accounts keys list --iam-account="$SA_EMAIL" --managed-by=user
```

Expected results:

- The key has two versions, both `ENABLED`, with protection level `SOFTWARE`.
- Both objects report the same key version: the number in `$V2`.
- The secret has version 2 `enabled` and version 1 `disabled`.
- The secret's policy grants `roles/secretmanager.secretAccessor` to `lab51-app` only.
- The key list is empty: the service account has no user-managed keys.
- In step 5, `before.txt` could not be read while its key version was disabled.

## Explore

1. In step 5, you destroy version `$V1` instead of disabling it, and you skip step 6. What happens to `before.txt`?

   <details><summary>Answer</summary>

   You can restore the version during the scheduled-destruction period (24 hours for this key). After that, the key material is gone, and nobody can read `before.txt` again. Cloud Storage still charges for the object until you delete it ([Customer-managed encryption keys](https://docs.cloud.google.com/storage/docs/encryption/customer-managed-keys), [Destroy and restore key versions](https://docs.cloud.google.com/kms/docs/destroy-restore)).

   </details>

2. The security team wants every new bucket in the company to use CMEK, with keys only from its central key project. How can it enforce this?

   <details><summary>Answer</summary>

   Enforce two organization policy constraints: `constraints/gcp.restrictNonCmekServices` with `storage.googleapis.com`, and `constraints/gcp.restrictCmekCryptoKeyProjects` with the key project. One constraint alone is not enough. This needs an organization resource ([CMEK organization policies](https://docs.cloud.google.com/kms/docs/cmek-org-policy)).

   </details>

3. An auditor wants a record of each decrypt operation that uses this key. What must you turn on, and what does it cost?

   <details><summary>Answer</summary>

   Turn on Data Access audit logs (`DATA_READ`) for Cloud KMS. Encrypt and decrypt calls are data access operations, and Data Access audit logs are off by default. Cloud Logging charges for the log volume ([Cloud KMS audit logging](https://docs.cloud.google.com/kms/docs/audit-logging), [Enable Data Access audit logs](https://docs.cloud.google.com/logging/docs/audit/configure-data-access)).

   </details>

4. Your team does not want to create key rings and keys by hand for each new project. What is Google's recommended option?

   <details><summary>Answer</summary>

   Cloud KMS Autokey. It creates Cloud HSM keys on demand when a developer creates a resource, and it grants the service agent access. Developers need no Cloud KMS roles. Autokey needs a folder for dedicated-project key storage ([Autokey overview](https://docs.cloud.google.com/kms/docs/autokey-overview)).

   </details>

## Clean up

```bash
bash labs/51-kms-cmek-secrets/teardown.sh
```

The script does the following:

- Deletes the bucket and its objects.
- Deletes the secret and all of its versions. The secret's IAM binding goes with it.
- Deletes the `lab51-app` service account. Your Token Creator binding goes with it. You can undelete a service account for 30 days.
- Removes the Cloud Storage service agent's role on the key.
- Keeps the key versions. Each active key version costs about $0.06 per month. A disabled version is still active.

**Optional and irreversible:** to stop the key charges, run the script with `--destroy-key-versions`. It schedules destruction of every key version. After 24 hours, the key material is gone for good. Until then, you can restore a version with `gcloud kms keys versions restore`.

```bash
bash labs/51-kms-cmek-secrets/teardown.sh --destroy-key-versions
```

A destroyed key version costs nothing. The key ring and key cost nothing and can stay. If you want to remove them from lists, wait until both versions are `DESTROYED`, then delete the versions and the key. Deleted key names cannot be reused.

```bash
gcloud kms keys versions list --key="$KEY" --keyring="$KEYRING" --location="$REGION" \
  --format="table(name.basename(), state)"
gcloud kms keys versions delete 1 --key="$KEY" --keyring="$KEYRING" --location="$REGION"
gcloud kms keys versions delete 2 --key="$KEY" --keyring="$KEYRING" --location="$REGION"
gcloud kms keys delete "$KEY" --keyring="$KEYRING" --location="$REGION"
```

You can delete an empty key ring in the Google Cloud console. The gcloud CLI version 576.0.0 has no command for it. Some older pages still say that key rings cannot be deleted.

The APIs stay enabled. They cost nothing when you do not use them.

## Docs used

- [Cloud Key Management Service overview](https://docs.cloud.google.com/kms/docs/key-management-service)
- [Create a key](https://docs.cloud.google.com/kms/docs/create-key)
- [Cloud KMS locations](https://docs.cloud.google.com/kms/docs/locations)
- [Cloud KMS resource consistency](https://docs.cloud.google.com/kms/docs/consistency)
- [Key rotation](https://docs.cloud.google.com/kms/docs/key-rotation)
- [Destroy and restore key versions](https://docs.cloud.google.com/kms/docs/destroy-restore)
- [Delete Cloud KMS resources](https://docs.cloud.google.com/kms/docs/delete-kms-resources)
- [Customer-managed encryption keys (Cloud Storage)](https://docs.cloud.google.com/storage/docs/encryption/customer-managed-keys)
- [Use customer-managed encryption keys (Cloud Storage)](https://docs.cloud.google.com/storage/docs/encryption/using-customer-managed-keys)
- [Choose a secret replication policy](https://docs.cloud.google.com/secret-manager/docs/choosing-replication)
- [Secret Manager best practices](https://docs.cloud.google.com/secret-manager/docs/best-practices)
- [Access a secret version](https://docs.cloud.google.com/secret-manager/docs/access-secret-version)
- [Cloud Key Management Service pricing](https://cloud.google.com/kms/pricing)
- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)
- [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)
