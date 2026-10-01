---
id: 32-storage-retention-signed-urls
title: "Cloud Storage lifecycle, retention, and signed URLs without keys"
objectives: ["1.2", "1.3"]
minutes: 60
cost: "Less than $0.01 if you run teardown.sh when done. The lab stores a few small objects and sends fewer than 200 requests. Cloud Storage Always Free includes 5 GB-months of Standard storage, 5,000 Class A operations, and 50,000 Class B operations each month in us-central1, us-east1, and us-west1."
requiresOrg: false
---

## Goal

Protect the objects in a private bucket with lifecycle rules, Object Versioning, a retention policy, and object holds. Then give time-limited download and upload access to single objects with V4 signed URLs. No service account key signs the URLs.

## Exam relevance

- **Lifecycle rules.** A rule has one action and one or more conditions. Cloud Storage runs the actions asynchronously, and a change to the configuration can take up to 24 hours to take effect ([Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)). See [Data retention and organization policies](note:1.2-retention-and-org-policy).
- **Retention policies and holds.** A retention policy blocks the deletion or replacement of an object until the object is older than the retention period. Releasing an event-based hold starts the retention period again. A temporary hold does not ([Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock), [Object holds](https://docs.cloud.google.com/storage/docs/object-holds)).
- **Bucket Lock is permanent.** After you lock a retention policy, you cannot remove it or reduce it ([Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)). This lab never locks a policy.
- **Signed URLs without keys.** The IAM `signBlob` method signs with a private key that Google keeps. The signing service account needs access to the object, and the caller needs the Service Account Token Creator role ([V4 signing process with Cloud Storage tools](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)). See [Signed URLs and signed policy documents](note:1.3-signed-urls).
- **Private buckets.** Uniform bucket-level access turns off ACLs, so only IAM grants access. Public access prevention blocks access through `allUsers` and `allAuthenticatedUsers`, but it does not apply to signed URLs ([Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access), [Public access prevention](https://docs.cloud.google.com/storage/docs/public-access-prevention)).

## Before you start

- Complete [the setup lab](lab:00-setup).
- **IAM:** you are the Owner of the lab project. To sign as a service account, you also need the Service Account Token Creator role on that account. You must grant it to yourself, even in a project that you created ([Use service account impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation)). Step 7 does this.
- **Tools:** the gcloud CLI, `curl`, and Python 3.12 or later with the `venv` module.
- **Time:** about 60 minutes. About 8 minutes of that time is waiting for retention periods and IAM changes. Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, enable the APIs, and make a local folder for the test files:

```bash
source pcd/labs/env.sh
gcloud services enable storage.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
export LAB32_DIR="${TMPDIR:-/tmp}/lab32"
mkdir -p "$LAB32_DIR"
export BUCKET="lab32-${PROJECT_ID}"
```

## Steps

1. Create a private bucket in your region. Uniform bucket-level access turns off ACLs. Public access prevention blocks public grants. `--soft-delete-duration=0` turns off soft delete, so that the deletes in this lab are final and teardown leaves nothing behind.

   ```bash
   gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" \
     --uniform-bucket-level-access --public-access-prevention --soft-delete-duration=0
   gcloud storage buckets describe "gs://${BUCKET}" \
     --format="default(location, uniform_bucket_level_access, public_access_prevention, soft_delete_policy)"
   ```

   The output shows `uniform_bucket_level_access: true`, `public_access_prevention: enforced`, and a soft delete retention duration of `0`. With public access prevention, a request to grant a role to `allUsers` fails with `412 Precondition Failed` ([Public access prevention](https://docs.cloud.google.com/storage/docs/public-access-prevention)). You cannot turn off uniform bucket-level access after it is on for 90 days in a row ([Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access)).

   Soft delete is on by default, with a retention duration of 7 days. Keep it on in production: it lets you restore deleted objects and buckets ([Soft delete overview](https://docs.cloud.google.com/storage/docs/soft-delete)).

2. Read the lifecycle configuration, and set it on the bucket.

   ```bash
   cat pcd/labs/32-storage-retention-signed-urls/lifecycle.json
   gcloud storage buckets update "gs://${BUCKET}" \
     --lifecycle-file=pcd/labs/32-storage-retention-signed-urls/lifecycle.json
   gcloud storage buckets describe "gs://${BUCKET}" --format="default(lifecycle_config)"
   ```

   | Rule | Action | Conditions |
   |---|---|---|
   | 1 | `SetStorageClass` to `NEARLINE` | `age` 30 days, and the object is Standard storage. `REGIONAL` and `DURABLE_REDUCED_AVAILABILITY` cover older objects with legacy class names in a regional bucket |
   | 2 | `Delete` | `age` 365 days, and the version is live |
   | 3 | `Delete` | The version is noncurrent, and 2 newer versions exist |
   | 4 | `Delete` | The version has been noncurrent for 7 days |

   An object must match all conditions of a rule. If a `Delete` rule and a `SetStorageClass` rule match at the same time, `Delete` wins. Cloud Storage runs the actions asynchronously, so do not write code that expects an action at an exact time. A change to the configuration can take up to 24 hours to take effect ([Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)). For this reason, the lab does not wait for a rule to act.

   `SetStorageClass` does not rewrite the object, so the class change has no early deletion fee. Each change is a Class A operation ([Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)).

3. Turn on Object Versioning, then write two versions of one object. Google says to wait at least 30 seconds after you change the versioning setting, before you delete or replace objects ([Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning)).

   ```bash
   gcloud storage buckets update "gs://${BUCKET}" --versioning
   sleep 30
   printf 'report v1\n' > "$LAB32_DIR/report.txt"
   gcloud storage cp "$LAB32_DIR/report.txt" "gs://${BUCKET}/report.txt"
   export GEN1="$(gcloud storage objects describe "gs://${BUCKET}/report.txt" --format='value(generation)')"
   printf 'report v2\n' > "$LAB32_DIR/report.txt"
   gcloud storage cp "$LAB32_DIR/report.txt" "gs://${BUCKET}/report.txt"
   export GEN2="$(gcloud storage objects describe "gs://${BUCKET}/report.txt" --format='value(generation)')"
   gcloud storage ls --all-versions --long "gs://${BUCKET}/report.txt"
   ```

   The listing shows two versions, `report.txt#GEN1` and `report.txt#GEN2`. Each version has its own generation number.

   Delete the object without a generation number. Then restore version 1, and delete version 2 permanently:

   ```bash
   gcloud storage rm "gs://${BUCKET}/report.txt"
   gcloud storage ls "gs://${BUCKET}"
   gcloud storage ls --all-versions "gs://${BUCKET}/report.txt"
   gcloud storage cp "gs://${BUCKET}/report.txt#${GEN1}" "gs://${BUCKET}/report.txt"
   gcloud storage cat "gs://${BUCKET}/report.txt"
   gcloud storage rm "gs://${BUCKET}/report.txt#${GEN2}"
   gcloud storage ls --all-versions "gs://${BUCKET}/report.txt"
   ```

   The first delete made the live version noncurrent. The normal listing does not show `report.txt`, but the versioned listing still shows both versions. The copy made a new live version with the text `report v1`. A delete with a generation number removes that version from the bucket ([Use versioned objects](https://docs.cloud.google.com/storage/docs/using-versioned-objects)). At the end, two versions remain: version 1 (noncurrent) and the restored live version. Each noncurrent version costs the same as a live object, so lifecycle rules 3 and 4 limit them ([Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning)).

4. Add a retention policy of 120 seconds. Then try to delete a new object before and after the retention period.

   ```bash
   gcloud storage buckets update "gs://${BUCKET}" --retention-period=120s
   gcloud storage buckets describe "gs://${BUCKET}" --format="default(retention_policy)"
   printf 'signed contract\n' > "$LAB32_DIR/contract.txt"
   gcloud storage cp "$LAB32_DIR/contract.txt" "gs://${BUCKET}/contract.txt"
   export CONTRACT_GEN="$(gcloud storage objects describe "gs://${BUCKET}/contract.txt" --format='value(generation)')"
   gcloud storage objects describe "gs://${BUCKET}/contract.txt" \
     --format="default(creation_time, retention_expiration)"
   gcloud storage rm "gs://${BUCKET}/contract.txt#${CONTRACT_GEN}"
   ```

   The policy shows a `retentionPeriod` of `120`. The `retention_expiration` of the object is 120 seconds after its `creation_time`. The delete fails with an HTTP 403 error, because the object is younger than the retention period (`retentionPolicyNotMet`) ([Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)).

   Now delete the object without a generation number, and list its versions:

   ```bash
   gcloud storage rm "gs://${BUCKET}/contract.txt"
   gcloud storage ls --all-versions "gs://${BUCKET}/contract.txt"
   ```

   This delete succeeds. In a versioned bucket, a live version under retention can still become noncurrent, but the data stays ([Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)). Wait for the retention period to end, then delete the version:

   ```bash
   sleep 120
   gcloud storage rm "gs://${BUCKET}/contract.txt#${CONTRACT_GEN}"
   ```

   The delete succeeds. The policy is not locked, so you can also shorten or remove it. **Do not lock the policy in this lab.** The `--lock-retention-period` flag of `gcloud storage buckets update` locks it, and the lock is irreversible ([Use and lock retention policies](https://docs.cloud.google.com/storage/docs/using-bucket-lock)). After a lock, you can only increase the period. A request to reduce or remove it fails with `400 BadRequestException`. You cannot delete the bucket until every object meets the retention period, and Cloud Storage adds a lien that blocks deletion of the project ([Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)).

5. Compare the two types of object holds. Put an event-based hold on one object and a temporary hold on another. Then wait until both objects are older than the retention period.

   ```bash
   printf 'loan agreement\n' > "$LAB32_DIR/loan.txt"
   printf 'trading records\n' > "$LAB32_DIR/trades.txt"
   gcloud storage cp "$LAB32_DIR/loan.txt" "$LAB32_DIR/trades.txt" "gs://${BUCKET}/"
   gcloud storage objects update "gs://${BUCKET}/loan.txt" --event-based-hold
   gcloud storage objects update "gs://${BUCKET}/trades.txt" --temporary-hold
   export LOAN_GEN="$(gcloud storage objects describe "gs://${BUCKET}/loan.txt" --format='value(generation)')"
   export TRADES_GEN="$(gcloud storage objects describe "gs://${BUCKET}/trades.txt" --format='value(generation)')"
   sleep 120
   gcloud storage rm "gs://${BUCKET}/loan.txt#${LOAN_GEN}"
   gcloud storage rm "gs://${BUCKET}/trades.txt#${TRADES_GEN}"
   ```

   Both deletes fail with an HTTP 403 error, because each object has a hold. The retention period is over, but a hold blocks deletion and replacement until you release it ([Object holds](https://docs.cloud.google.com/storage/docs/object-holds)).

   Release both holds, compare the retention expiration times, and try the deletes again:

   ```bash
   gcloud storage objects update "gs://${BUCKET}/loan.txt" --no-event-based-hold
   gcloud storage objects update "gs://${BUCKET}/trades.txt" --no-temporary-hold
   gcloud storage objects describe "gs://${BUCKET}/loan.txt" --format="default(retention_expiration)"
   gcloud storage objects describe "gs://${BUCKET}/trades.txt" --format="default(retention_expiration)"
   gcloud storage rm "gs://${BUCKET}/trades.txt#${TRADES_GEN}"
   gcloud storage rm "gs://${BUCKET}/loan.txt#${LOAN_GEN}"
   ```

   The delete of `trades.txt` succeeds. The delete of `loan.txt` fails with `retentionPolicyNotMet`: when you release an event-based hold, the time of the object in the bucket starts again for the retention period. A temporary hold does not change the retention period ([Object holds](https://docs.cloud.google.com/storage/docs/object-holds)). The new `retention_expiration` of `loan.txt` is about 120 seconds after the release. Leave `loan.txt` in the bucket. Teardown deletes it.

6. Turn on the default event-based hold of the bucket, upload an object, and look at its hold. Then turn the default off again.

   ```bash
   gcloud storage buckets update "gs://${BUCKET}" --default-event-based-hold
   printf 'second loan agreement\n' > "$LAB32_DIR/loan-2.txt"
   gcloud storage cp "$LAB32_DIR/loan-2.txt" "gs://${BUCKET}/loan-2.txt"
   gcloud storage objects describe "gs://${BUCKET}/loan-2.txt" --format="default(event_based_hold)"
   gcloud storage buckets update "gs://${BUCKET}" --no-default-event-based-hold
   ```

   The new object has `event_based_hold: true`. With a default event-based hold and a retention policy, an object stays until an event occurs, and then for the retention period. For example, you keep a loan document for some years after the loan is paid ([Object holds](https://docs.cloud.google.com/storage/docs/object-holds)). The default applies only to new objects ([gcloud storage buckets update](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/update)).

7. Create the `lab32-signer` service account, which signs the URLs. Give it Storage Object Viewer to download and Storage Object Creator to upload, on this bucket only. Storage Object Creator cannot overwrite objects. For uploads that overwrite, the docs use Storage Object User ([V4 signing process with Cloud Storage tools](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)).

   ```bash
   gcloud iam service-accounts create lab32-signer --display-name="lab32 signed URL signer"
   export SIGNER_SA="lab32-signer@${PROJECT_ID}.iam.gserviceaccount.com"
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="serviceAccount:${SIGNER_SA}" --role=roles/storage.objectViewer
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="serviceAccount:${SIGNER_SA}" --role=roles/storage.objectCreator
   ```

   Then grant the Service Account Token Creator role on `lab32-signer` twice. Your user needs it to sign as `lab32-signer` with gcloud (step 8). `lab32-signer` needs it on itself, because the Python script in step 11 signs as `lab32-signer` with the token of `lab32-signer`. This is also what code on Cloud Run does when it signs as its attached service account.

   ```bash
   gcloud iam service-accounts add-iam-policy-binding "$SIGNER_SA" \
     --member="user:$(gcloud config get-value account)" --role=roles/iam.serviceAccountTokenCreator
   gcloud iam service-accounts add-iam-policy-binding "$SIGNER_SA" \
     --member="serviceAccount:${SIGNER_SA}" --role=roles/iam.serviceAccountTokenCreator
   ```

   For a service account that signs as itself, the Cloud Storage docs grant the role on the project. This lab grants it on the service account only. A project-level grant lets the principal impersonate every service account in the project ([Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)). Wait two minutes for the grants to take effect ([Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)).

8. Sign a download URL with gcloud, as `lab32-signer`. With `--impersonate-service-account`, gcloud needs no service account key ([gcloud storage sign-url](https://docs.cloud.google.com/sdk/gcloud/reference/storage/sign-url)). It signs with the IAM `signBlob` method ([Signatures](https://docs.cloud.google.com/storage/docs/authentication/signatures)). `--region` gives the bucket location. Without it, gcloud reads the bucket metadata as `lab32-signer` to find the location, and `lab32-signer` has no permission for that.

   ```bash
   export GET_URL="$(gcloud storage sign-url "gs://${BUCKET}/report.txt" \
     --impersonate-service-account="$SIGNER_SA" --region="$REGION" --duration=10m \
     --format='value(signed_url)')"
   curl -s "$GET_URL"
   echo "$GET_URL" | tr '?&' '\n\n' | grep -i '^x-goog-' | cut -c1-90
   curl -s -o /dev/null -w '%{http_code}\n' "https://storage.googleapis.com/${BUCKET}/report.txt"
   ```

   If gcloud warns that `lab32-signer` does not have permissions on the object, wait one more minute and run the step again. The signed URL returns `report v1`. Anyone who has the URL can use it until it expires, with no Google account ([Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)). The bucket has public access prevention, and the signed URL still works.

   The query string has the V4 parameters: `x-goog-algorithm` is `GOOG4-RSA-SHA256`, `x-goog-credential` starts with the email of `lab32-signer` (with `%40` for `@`), and `x-goog-expires` is `600` seconds. The same object without a signature returns `403` (`AccessDenied`) ([HTTP status and error codes for XML](https://docs.cloud.google.com/storage/docs/xml-api/reference-status)).

9. Test the expiration limits. First, ask gcloud for a URL that is valid for 13 hours. Then make a URL that is valid for 1 minute, and use it before and after it expires.

   ```bash
   gcloud storage sign-url "gs://${BUCKET}/report.txt" \
     --impersonate-service-account="$SIGNER_SA" --region="$REGION" --duration=13h
   export SHORT_URL="$(gcloud storage sign-url "gs://${BUCKET}/report.txt" \
     --impersonate-service-account="$SIGNER_SA" --region="$REGION" --duration=1m \
     --format='value(signed_url)')"
   curl -s -o /dev/null -w '%{http_code}\n' "$SHORT_URL"
   sleep 70
   curl -s "$SHORT_URL"
   ```

   The 13-hour request fails. With `signBlob`, gcloud allows at most 12 hours, because the system-managed key that signs the URL might not stay valid longer. With a private key file, the maximum is 7 days ([gcloud storage sign-url](https://docs.cloud.google.com/sdk/gcloud/reference/storage/sign-url)), which is the V4 maximum of 604,800 seconds ([Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)). The short URL returns `200`, and after it expires, an `ExpiredToken` error (HTTP 400) ([HTTP status and error codes for XML](https://docs.cloud.google.com/storage/docs/xml-api/reference-status)).

10. Sign an upload URL. A `PUT` URL signs the `Content-Type` header, so the upload must send the same value ([V4 signing process with Cloud Storage tools](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)).

    ```bash
    export PUT_URL="$(gcloud storage sign-url "gs://${BUCKET}/uploads/from-gcloud.txt" \
      --impersonate-service-account="$SIGNER_SA" --region="$REGION" --duration=10m \
      --http-verb=PUT --headers=content-type=text/plain --format='value(signed_url)')"
    printf 'uploaded with a signed URL\n' > "$LAB32_DIR/upload.txt"
    curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: application/octet-stream' \
      --upload-file "$LAB32_DIR/upload.txt" "$PUT_URL"
    curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: text/plain' \
      --upload-file "$LAB32_DIR/upload.txt" "$PUT_URL"
    gcloud storage objects describe "gs://${BUCKET}/uploads/from-gcloud.txt" --format="default(content_type, size)"
    ```

    The first upload returns `403`: the content type is different from the signed value, so the signature does not match (`SignatureDoesNotMatch`) ([HTTP status and error codes for XML](https://docs.cloud.google.com/storage/docs/xml-api/reference-status)). The second upload returns `200`, and the object has the type `text/plain`.

11. Sign URLs in Python. Read the script first. It impersonates `lab32-signer`, then passes `service_account_email` and `access_token` to `generate_signed_url` ([Class Blob](https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob)). With these two arguments, the library signs with the IAM `signBlob` method of the Service Account Credentials API, not with a local private key ([Signatures](https://docs.cloud.google.com/storage/docs/authentication/signatures)).

    ```bash
    cat pcd/labs/32-storage-retention-signed-urls/sign_url.py
    python3 -m venv "$LAB32_DIR/venv"
    "$LAB32_DIR/venv/bin/python" -m pip install --quiet -r pcd/labs/32-storage-retention-signed-urls/requirements.txt
    export PY_GET_URL="$("$LAB32_DIR/venv/bin/python" pcd/labs/32-storage-retention-signed-urls/sign_url.py GET report.txt)"
    curl -s "$PY_GET_URL"
    export PY_PUT_URL="$("$LAB32_DIR/venv/bin/python" pcd/labs/32-storage-retention-signed-urls/sign_url.py PUT uploads/from-python.txt)"
    curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H 'Content-Type: text/plain' \
      --upload-file "$LAB32_DIR/upload.txt" "$PY_PUT_URL"
    gcloud storage ls "gs://${BUCKET}/uploads/"
    ```

    The download prints `report v1`, and the upload returns `200`. The listing shows `from-gcloud.txt` and `from-python.txt`. The docs sample for Python uses a key file. This script needs no key, and the same call works on Cloud Run with the attached service account.

    The Service Account Credentials API blocks some kinds of self-impersonation, for example a short-lived token that creates a new token for the same service account. Signing a Cloud Storage URL is not one of them ([Service account credentials](https://docs.cloud.google.com/iam/docs/service-account-creds)). If the script fails with `Error calling the IAM signBytes API`, check that `lab32-signer` has the Token Creator role on itself (step 7). A role grant typically takes 2 minutes to propagate, and sometimes 7 minutes or longer.

## Check your work

```bash
gcloud storage buckets describe "gs://${BUCKET}" \
  --format="default(uniform_bucket_level_access, public_access_prevention, versioning_enabled, retention_policy)"
gcloud storage ls --all-versions --recursive "gs://${BUCKET}"
gcloud storage objects describe "gs://${BUCKET}/loan-2.txt" --format="default(event_based_hold)"
gcloud storage buckets get-iam-policy "gs://${BUCKET}" \
  --flatten="bindings[].members" --format="table(bindings.role, bindings.members)"
gcloud iam service-accounts get-iam-policy "$SIGNER_SA" \
  --flatten="bindings[].members" --format="table(bindings.role, bindings.members)"
```

Expected output:

- The bucket has uniform bucket-level access, public access prevention `enforced`, versioning on, and a `retentionPeriod` of `120`. The retention policy is not locked.
- The objects are `report.txt` (2 versions), `loan.txt`, `loan-2.txt`, `uploads/from-gcloud.txt`, and `uploads/from-python.txt`.
- `loan-2.txt` has `event_based_hold: true`.
- On the bucket, `lab32-signer` has `roles/storage.objectViewer` and `roles/storage.objectCreator`. The other rows give access to the owners, editors, and viewers of the project.
- On `lab32-signer`, your user and `lab32-signer` itself have `roles/iam.serviceAccountTokenCreator`.

## Explore

1. A regulation says that you must keep trade records for 7 years, and that nobody can shorten that time. Which settings meet this rule, and what can you never undo?

   <details><summary>Answer</summary>

   Set a retention policy of 7 years on the bucket, then lock it. After the lock, you can increase the period, but you cannot reduce or remove it. You cannot delete the bucket until every object meets the period, and a lien blocks deletion of the project. A lifecycle `Delete` rule can remove each object after it meets the period ([Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)). For a different date on each object, use Object Retention Lock ([Object Retention Lock](https://docs.cloud.google.com/storage/docs/object-lock)).

   </details>

2. You must keep each loan document for 5 years after the customer pays the loan. Which hold type do you use, and how?

   <details><summary>Answer</summary>

   Set a retention policy of 5 years and the default event-based hold on the bucket. Each new document gets an event-based hold. When the customer pays, release the hold. The 5-year retention period then starts for that document. A temporary hold does not restart the retention period ([Object holds](https://docs.cloud.google.com/storage/docs/object-holds)).

   </details>

3. You remove Storage Object Viewer from `lab32-signer`. What happens to a download URL that has not expired yet?

   <details><summary>Answer</summary>

   It stops working after the IAM change takes effect, and it returns `403`. Cloud Storage processes a signed request with the authority of the account that signed it ([Signatures](https://docs.cloud.google.com/storage/docs/authentication/signatures)). The signing account must have permission for the request that the URL makes ([Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)).

   </details>

4. Partners upload files from an HTML form in a browser, and each file must be smaller than 10 MB. Do you use a signed URL?

   <details><summary>Answer</summary>

   No. HTML forms do not support signed URLs. Use a signed policy document with the XML API `POST` Object request ([Upload an object with HTML forms](https://docs.cloud.google.com/storage/docs/xml-api/post-object-forms)). A `content-length-range` condition in the policy limits the file size ([Signatures](https://docs.cloud.google.com/storage/docs/authentication/signatures)).

   </details>

## Clean up

```bash
bash pcd/labs/32-storage-retention-signed-urls/teardown.sh
```

The script deletes, in order:

- The retention policy and the default event-based hold of the bucket. The policy is not locked, so you can remove it.
- The holds on all object versions. A hold blocks a delete even without a retention policy.
- All object versions, then the `lab32-PROJECT_ID` bucket. The bucket-level role bindings go with the bucket. Soft delete is off, so no soft-deleted objects stay.
- The `lab32-signer` service account. The two Token Creator bindings go with it.
- The local folder `$LAB32_DIR`.

## Docs used

- [Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle)
- [Configuration examples for Object Lifecycle Management](https://docs.cloud.google.com/storage/docs/lifecycle-configurations)
- [Manage object lifecycles](https://docs.cloud.google.com/storage/docs/managing-lifecycles)
- [Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning)
- [Use versioned objects](https://docs.cloud.google.com/storage/docs/using-versioned-objects)
- [Soft delete overview](https://docs.cloud.google.com/storage/docs/soft-delete)
- [Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)
- [Use and lock retention policies](https://docs.cloud.google.com/storage/docs/using-bucket-lock)
- [Object holds](https://docs.cloud.google.com/storage/docs/object-holds)
- [Use object holds](https://docs.cloud.google.com/storage/docs/holding-objects)
- [Object Retention Lock](https://docs.cloud.google.com/storage/docs/object-lock)
- [Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access)
- [Public access prevention](https://docs.cloud.google.com/storage/docs/public-access-prevention)
- [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls)
- [V4 signing process with Cloud Storage tools](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)
- [Signatures](https://docs.cloud.google.com/storage/docs/authentication/signatures)
- [Upload an object with HTML forms](https://docs.cloud.google.com/storage/docs/xml-api/post-object-forms)
- [HTTP status and error codes for XML](https://docs.cloud.google.com/storage/docs/xml-api/reference-status)
- [gcloud storage sign-url](https://docs.cloud.google.com/sdk/gcloud/reference/storage/sign-url)
- [gcloud storage buckets update](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/update)
- [Class Blob (Python)](https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.blob.Blob)
- [Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)
- [Use service account impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation)
- [Service account credentials](https://docs.cloud.google.com/iam/docs/service-account-creds)
- [Best practices for using service accounts securely](https://docs.cloud.google.com/iam/docs/best-practices-service-accounts)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [Storage pricing](https://cloud.google.com/storage/pricing)
