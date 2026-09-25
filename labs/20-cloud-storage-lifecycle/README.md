---
id: 20-cloud-storage-lifecycle
title: Cloud Storage classes, lifecycle, versioning, and retention
objectives: ["2.2"]
minutes: 45
cost: "Less than $0.01. The lab stores a few small text objects for less than one hour. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Configure one bucket with soft delete, Object Versioning, lifecycle rules, an object hold, and an unlocked retention policy. Configure a second bucket with Autoclass. Then share one object with a signed URL that a service account signs, with no key file.

## Exam relevance

- Soft delete, versioning, holds, and retention policies: [Configuring Cloud Storage](note:2.2-cloud-storage-config).
- Recovery of deleted data and the difference between replication and backup: [Data protection: backup, recovery, and retention](note:2.2-data-protection).
- Storage classes, lifecycle rules, and Autoclass: [Choosing storage: object, block, file, and databases](note:1.3-storage-choice).
- Retention for compliance evidence: [Designing for compliance](note:3.2-compliance).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI and `curl`.
- Time: about 45 minutes, including 1 to 2 minutes of waiting for IAM.

```bash
source labs/env.sh
gcloud services enable storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export BUCKET="lab20-${PROJECT_ID}-data"
export AUTO_BUCKET="lab20-${PROJECT_ID}-auto"
export SIGNER="lab20-signer@${PROJECT_ID}.iam.gserviceaccount.com"
export USER_EMAIL="$(gcloud config get account)"
export WORK="${WORK:-$(mktemp -d)}"
echo "bucket=$BUCKET work=$WORK"
```

## Steps

1. Create the data bucket in one region. Uniform bucket-level access makes IAM the only access control, public access prevention blocks public grants, and soft delete keeps deleted data for 7 days.

   ```bash
   gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" \
     --default-storage-class=STANDARD --uniform-bucket-level-access \
     --public-access-prevention --soft-delete-duration=7d
   gcloud storage buckets describe "gs://${BUCKET}" \
     --format="default(location, default_storage_class, uniform_bucket_level_access, public_access_prevention, soft_delete_policy)"
   ```

   The soft delete policy shows a retention duration of 604800 seconds (7 days). Soft delete is on by default for new buckets. This step only makes the setting visible.

2. Delete an object, and then restore it. Soft delete protects against accidental or malicious deletion, even when versioning is off.

   ```bash
   printf 'invoice 1001\n' > "$WORK/invoice.txt"
   gcloud storage cp "$WORK/invoice.txt" "gs://${BUCKET}/invoices/invoice-1001.txt"
   gcloud storage rm "gs://${BUCKET}/invoices/invoice-1001.txt"
   gcloud storage ls --soft-deleted --long "gs://${BUCKET}/invoices/"
   gcloud storage restore "gs://${BUCKET}/invoices/invoice-1001.txt"
   gcloud storage cat "gs://${BUCKET}/invoices/invoice-1001.txt"
   ```

   The restore creates a new live copy of the object. The soft-deleted copy stays until its 7 days end.

3. Turn on Object Versioning, overwrite an object, and then bring back the old content. Versioning keeps each overwritten version as a noncurrent version with its own generation number.

   ```bash
   gcloud storage buckets update "gs://${BUCKET}" --versioning
   printf 'price list v1\n' > "$WORK/prices.txt"
   gcloud storage cp "$WORK/prices.txt" "gs://${BUCKET}/reports/prices.txt"
   printf 'price list v2 (wrong)\n' > "$WORK/prices.txt"
   gcloud storage cp "$WORK/prices.txt" "gs://${BUCKET}/reports/prices.txt"
   gcloud storage ls --all-versions --long "gs://${BUCKET}/reports/prices.txt"
   ```

   The list shows two versions. Each URL ends with `#` and the generation number. The oldest version is first. Copy it over the live object:

   ```bash
   export OLD="$(gcloud storage ls --all-versions "gs://${BUCKET}/reports/prices.txt" | head -n 1)"
   echo "Oldest version: $OLD"
   gcloud storage cp "$OLD" "gs://${BUCKET}/reports/prices.txt"
   gcloud storage cat "gs://${BUCKET}/reports/prices.txt"
   ```

   The live object says `price list v1` again. The bucket now has three versions of `reports/prices.txt`.

4. Add lifecycle rules. The access pattern of the reports is known, so fixed rules move them to colder classes and then delete them. Other rules limit the number of noncurrent versions and clean up failed uploads.

   ```bash
   cat > "$WORK/lifecycle.json" <<'EOF'
   {
     "lifecycle": {
       "rule": [
         {"action": {"type": "SetStorageClass", "storageClass": "NEARLINE"},
          "condition": {"age": 30, "matchesStorageClass": ["STANDARD"], "matchesPrefix": ["reports/"]}},
         {"action": {"type": "SetStorageClass", "storageClass": "COLDLINE"},
          "condition": {"age": 90, "matchesStorageClass": ["NEARLINE"], "matchesPrefix": ["reports/"]}},
         {"action": {"type": "Delete"},
          "condition": {"age": 365, "matchesPrefix": ["reports/"]}},
         {"action": {"type": "Delete"},
          "condition": {"isLive": false, "numNewerVersions": 2}},
         {"action": {"type": "Delete"},
          "condition": {"daysSinceNoncurrentTime": 30}},
         {"action": {"type": "AbortIncompleteMultipartUpload"},
          "condition": {"age": 7}}
       ]
     }
   }
   EOF
   gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file="$WORK/lifecycle.json"
   gcloud storage buckets describe "gs://${BUCKET}" --format="default(lifecycle_config)"
   ```

   Lifecycle actions are asynchronous, and a change can take up to 24 hours to apply. Nothing moves during this lab, because all objects are new.

5. Put a temporary hold on an object, and try to delete it. First, turn off versioning. In a versioned bucket, a delete of a live object only makes it noncurrent, so the next two steps would not show a blocked delete.

   ```bash
   gcloud storage buckets update "gs://${BUCKET}" --no-versioning
   printf 'case 7 evidence\n' > "$WORK/case.txt"
   gcloud storage cp "$WORK/case.txt" "gs://${BUCKET}/legal/case-7.txt"
   gcloud storage objects update "gs://${BUCKET}/legal/case-7.txt" --temporary-hold
   gcloud storage objects describe "gs://${BUCKET}/legal/case-7.txt" | grep -i hold
   gcloud storage rm "gs://${BUCKET}/legal/case-7.txt" || echo "Blocked by the hold, as expected."
   gcloud storage objects update "gs://${BUCKET}/legal/case-7.txt" --no-temporary-hold
   gcloud storage rm "gs://${BUCKET}/legal/case-7.txt"
   ```

   A hold has no end date. Any user with permission to update the object can release it. Legal teams use holds for data that must stay until a case ends.

6. Add a one-hour retention policy, and try to delete a new object. A retention policy blocks deletion and overwrites until each object reaches the retention period.

   ```bash
   gcloud storage buckets update "gs://${BUCKET}" --retention-period=1h
   gcloud storage buckets describe "gs://${BUCKET}" --format="default(retention_policy)"
   printf 'trade 42\n' > "$WORK/trade.txt"
   gcloud storage cp "$WORK/trade.txt" "gs://${BUCKET}/trades/trade-42.txt"
   gcloud storage rm "gs://${BUCKET}/trades/trade-42.txt" || echo "Blocked by the retention policy, as expected."
   ```

   The policy is not locked, so you can still remove it. `teardown.sh` removes it. **Do not lock the policy in this lab.** A lock is irreversible. After the lock, no one can reduce or remove the policy, and you cannot delete the bucket until every object reaches the retention period.

7. Create a second bucket with Autoclass. Autoclass moves each object to a colder class when nobody reads it, and back to Standard when somebody reads it. A bucket with Autoclass cannot have lifecycle rules that use the `SetStorageClass` action or the `matchesStorageClass` condition, so this lab uses a second bucket.

   ```bash
   gcloud storage buckets create "gs://${AUTO_BUCKET}" --location="$REGION" \
     --uniform-bucket-level-access --public-access-prevention \
     --enable-autoclass --autoclass-terminal-storage-class=ARCHIVE
   gcloud storage buckets describe "gs://${AUTO_BUCKET}" --format="default(autoclass)"
   gcloud storage cp "$WORK/prices.txt" "gs://${AUTO_BUCKET}/prices.txt"
   gcloud storage objects describe "gs://${AUTO_BUCKET}/prices.txt" --format="value(storage_class)"
   ```

   New objects start in Standard storage. After 30 days without reads, Autoclass moves an object to Nearline. With `ARCHIVE` as the terminal class, it later moves the object to Coldline and then to Archive.

8. Create a service account that signs URLs, and give it read access to the data bucket only. You impersonate it, so no key file exists. The signer must itself be able to read the object that the URL shares.

   ```bash
   gcloud iam service-accounts create lab20-signer --display-name="lab20 signed URL signer"
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="serviceAccount:${SIGNER}" --role="roles/storage.objectViewer"
   gcloud iam service-accounts add-iam-policy-binding "$SIGNER" \
     --member="user:${USER_EMAIL}" --role="roles/iam.serviceAccountTokenCreator"
   ```

   IAM changes take effect after about one minute. Wait 1 to 2 minutes before the next step.

9. Create a signed URL that is valid for 10 minutes, and download the object with it. The request needs no Google credentials. The bucket stays private, because public access prevention does not apply to signed URLs.

   ```bash
   export URL="$(gcloud storage sign-url "gs://${BUCKET}/reports/prices.txt" \
     --impersonate-service-account="$SIGNER" --duration=10m --format="value(signed_url)")"
   curl -s "$URL"
   curl -s -o /dev/null -w 'Unsigned request: HTTP %{http_code}\n' \
     "https://storage.googleapis.com/${BUCKET}/reports/prices.txt"
   ```

   The signed request prints `price list v1`. The unsigned request gets an error status (401 or 403). If `sign-url` fails with a permission error, wait one more minute and try again.

## Check your work

```bash
gcloud storage buckets describe "gs://${BUCKET}" \
  --format="default(versioning_enabled, soft_delete_policy, retention_policy, lifecycle_config)"
gcloud storage buckets describe "gs://${AUTO_BUCKET}" --format="default(autoclass)"
gcloud storage ls --all-versions "gs://${BUCKET}/reports/"
gcloud storage ls --soft-deleted "gs://${BUCKET}/**"
```

Expect the following:

- The data bucket has versioning off, a 7-day soft delete policy, a retention period of 3600 seconds, and six lifecycle rules.
- The Autoclass bucket shows `enabled: true` and the terminal storage class `ARCHIVE`.
- `reports/prices.txt` has three versions.
- The soft-deleted list includes `invoices/invoice-1001.txt` and `legal/case-7.txt`.

## Explore

1. An auditor requires that trade records stay for 7 years, and no one may delete them early. What do you change, and why does this lab not do it?

   <details><summary>Answer</summary>

   Set a 7-year retention policy and lock it with Bucket Lock. After the lock, no one can reduce or remove the policy, and the bucket cannot be deleted until every object reaches the retention period. That is the goal for compliance, and it is also why a lab must never lock a policy: you could not clean up. Object Retention Lock is the per-object option, and you cannot turn it off after you enable it on a bucket.

   </details>

2. An administrator deletes the whole data bucket by mistake. What can you recover, and would Object Versioning alone have helped?

   <details><summary>Answer</summary>

   With soft delete on, a deleted bucket and its objects stay in a soft-deleted state for the soft delete duration (7 days here). You can restore them in that period. Object Versioning alone does not protect against bucket deletion. Google recommends soft delete over versioning for protection against accidental or malicious deletion.

   </details>

3. The team does not know how often analysts will read a new dataset. Should it use lifecycle rules or Autoclass?

   <details><summary>Answer</summary>

   Autoclass. It suits data with unknown or unpredictable access patterns, and it moves read objects back to Standard. Lifecycle rules suit a known pattern, as in step 4. An Autoclass bucket cannot have rules with the `SetStorageClass` action or the `matchesStorageClass` condition. Other rules, such as a Delete rule by age, are allowed.

   </details>

4. A partner without a Google account must upload one file to the bucket before tomorrow. How do you allow it without making the bucket public?

   <details><summary>Answer</summary>

   Create a signed URL with `--http-verb=PUT` and a short duration, signed by a service account that can create objects in the bucket. Anyone with the URL can upload until it expires. Give the partner the URL through a secure channel.

   </details>

## Clean up

```bash
bash labs/20-cloud-storage-lifecycle/teardown.sh
rm -rf "$WORK"
```

The script does the following:

- Removes the retention policy and releases any holds, so that the objects can be deleted.
- Turns off soft delete on both buckets, so that the deletion is permanent and stops all storage charges.
- Deletes all objects, all noncurrent versions, and both buckets.
- Deletes the `lab20-signer` service account. Your Token Creator binding goes with it.

The objects that you soft-deleted during the lab stay in the soft-deleted state until their 7 days end. They are a few bytes, so the cost is close to zero.

## Docs used

- [Soft delete overview](https://docs.cloud.google.com/storage/docs/soft-delete)
- [Set and manage soft delete policies](https://docs.cloud.google.com/storage/docs/use-soft-delete)
- [Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning)
- [Use Object Versioning](https://docs.cloud.google.com/storage/docs/using-object-versioning)
- [Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)
- [Configuration examples for Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle-configurations)
- [Autoclass](https://docs.cloud.google.com/storage/docs/autoclass)
- [Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)
- [Use and lock retention policies](https://docs.cloud.google.com/storage/docs/using-bucket-lock)
- [Object holds](https://docs.cloud.google.com/storage/docs/object-holds)
- [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)
- [V4 signing process with Cloud Storage tools](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)
- [Public access prevention](https://docs.cloud.google.com/storage/docs/public-access-prevention)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
