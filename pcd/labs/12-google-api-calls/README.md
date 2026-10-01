---
id: 12-google-api-calls
title: "Call Google Cloud APIs: client libraries, REST, partial responses, pagination, and retries"
objectives: ["4.2"]
minutes: 45
cost: "About $0. Cloud Storage Always Free includes 5 GB-months of Standard storage, 5,000 Class A operations, and 50,000 Class B operations each month in us-central1, us-east1, and us-west1. The lab stores seven small objects and sends fewer than 100 requests. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Call the Cloud Storage API with curl and REST, with the Python client library, and with the APIs Explorer. The calls run as a service account with one narrow role, and they use partial responses, pagination, a batch request, and a custom retry policy.

## Exam relevance

- Enabling services, listing enabled services, REST calls with an access token, and Cloud Client Libraries. See [Calling Google Cloud APIs](note:4.2-calling-google-apis).
- Service account impersonation for local code, and the quota project of a call. See [Calling Google Cloud APIs](note:4.2-calling-google-apis).
- Partial responses with `fields`, pagination with page tokens, batch requests, retryable errors, and exponential backoff. See [Efficient and resilient API calls](note:4.2-efficient-api-calls).
- A service account with one role on one bucket, and the Service Account Token Creator role for impersonation. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).

## Before you start

- Complete [the setup lab](lab:00-setup) first. This lab uses its Application Default Credentials (ADC) and the lab shell.
- **IAM:** you are the Owner of the lab project. To impersonate a service account, you also need the Service Account Token Creator role (`roles/iam.serviceAccountTokenCreator`) on that account. The impersonation docs say that you must grant it to yourself, even in a project that you created. Step 3 does this.
- **Tools:** the gcloud CLI, `curl`, and Python 3.12 or later with the `venv` module.
- **Time:** about 45 minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs. Impersonation needs the IAM Service Account Credentials API (`iamcredentials.googleapis.com`).

```bash
source pcd/labs/env.sh
gcloud services enable storage.googleapis.com iamcredentials.googleapis.com iam.googleapis.com
```

## Steps

1. List the enabled services. Then get the same list from the Service Usage REST API: two services on each page, and only the `name` field. The `X-Goog-User-Project` header sets the quota project, which gets the quota and billing for the call.

```bash
gcloud services list --enabled --format="value(config.name)" | sort
curl -s -G "https://serviceusage.googleapis.com/v1/projects/${PROJECT_ID}/services" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "X-Goog-User-Project: ${PROJECT_ID}" \
  --data-urlencode "filter=state:ENABLED" \
  --data-urlencode "pageSize=2" \
  --data-urlencode "fields=services(name),nextPageToken"
```

The response has two services and a `nextPageToken`. The Service Usage API names its page size `pageSize`. The Cloud Storage JSON API in the next steps names it `maxResults`. The `fields` parameter is a system parameter, so all Google REST APIs accept it.

2. Create a bucket with uniform bucket-level access, so that only IAM controls access to it. Then upload seven small objects.

```bash
export LAB12_BUCKET="lab12-${PROJECT_ID}"
export LAB12_DIR="${TMPDIR:-/tmp}/lab12"
mkdir -p "$LAB12_DIR/objects"
gcloud storage buckets create "gs://${LAB12_BUCKET}" --location="$REGION" --uniform-bucket-level-access
for i in 01 02 03 04 05 06 07; do echo "lab12 object $i" > "$LAB12_DIR/objects/file-$i.txt"; done
gcloud storage cp "$LAB12_DIR"/objects/*.txt "gs://${LAB12_BUCKET}/"
gcloud storage ls "gs://${LAB12_BUCKET}"
```

3. Create the `lab12-caller` service account, and give it the Storage Object Viewer role on this bucket only. The role lets it read and list objects. It cannot change objects or read the bucket metadata. Then let your user impersonate the account.

```bash
gcloud iam service-accounts create lab12-caller --display-name="lab12 Cloud Storage reader"
export CALLER_SA="lab12-caller@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud storage buckets add-iam-policy-binding "gs://${LAB12_BUCKET}" \
  --member="serviceAccount:${CALLER_SA}" --role=roles/storage.objectViewer
gcloud iam service-accounts add-iam-policy-binding "$CALLER_SA" \
  --member="user:$(gcloud config get-value account)" \
  --role=roles/iam.serviceAccountTokenCreator
```

If a command says that the service account does not exist, wait one minute and run it again.

4. Get a short-lived access token for `lab12-caller`, and list the first page of objects with REST. Impersonation needs no service account key. The token comes from your gcloud sign-in and your Token Creator role. `maxResults=3` asks for three objects on each page, and the `fields` parameter asks for a partial response: the name and size of each object, and the page token.

```bash
export TOKEN="$(gcloud auth print-access-token --impersonate-service-account="$CALLER_SA")"
curl -s -G "https://storage.googleapis.com/storage/v1/b/${LAB12_BUCKET}/o" \
  -H "Authorization: Bearer ${TOKEN}" \
  --data-urlencode "maxResults=3" \
  --data-urlencode "fields=items(name,size),nextPageToken" | tee "$LAB12_DIR/page1.json"
export PAGE_TOKEN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["nextPageToken"])' "$LAB12_DIR/page1.json")"
```

The gcloud CLI prints a warning that the command uses service account impersonation. IAM changes typically take 2 minutes, and sometimes 7 minutes or more. If you get a `Permission 'iam.serviceAccounts.getAccessToken' denied` error, wait two minutes and run the step again. The `--data-urlencode` options URL-encode the parameter values, which the Cloud Storage docs require for `fields`.

5. Get the next page. Send the same request with the page token from step 4.

```bash
curl -s -G "https://storage.googleapis.com/storage/v1/b/${LAB12_BUCKET}/o" \
  -H "Authorization: Bearer ${TOKEN}" \
  --data-urlencode "maxResults=3" \
  --data-urlencode "fields=items(name,size),nextPageToken" \
  --data-urlencode "pageToken=${PAGE_TOKEN}"
```

The response has `file-04.txt` to `file-06.txt` and a new `nextPageToken`. The third page has only `file-07.txt` and no token. Always check for `nextPageToken`: the service can return fewer results than `maxResults`, and a page can even be empty.

6. Compare the size of a full response and a partial response for the same page.

```bash
curl -s -G "https://storage.googleapis.com/storage/v1/b/${LAB12_BUCKET}/o" \
  -H "Authorization: Bearer ${TOKEN}" --data-urlencode "maxResults=3" | wc -c
curl -s -G "https://storage.googleapis.com/storage/v1/b/${LAB12_BUCKET}/o" \
  -H "Authorization: Bearer ${TOKEN}" --data-urlencode "maxResults=3" \
  --data-urlencode "fields=items(name,size),nextPageToken" | wc -c
```

The full response contains all metadata of each object, so it is many times larger. A smaller response means less data to send, parse, and store.

7. Send three calls in one batch request: two object reads and one object delete. The batch endpoint takes a `multipart/mixed` body. Each part holds one complete HTTP request with only the path of the URL. The outer `Authorization` header applies to every part.

```bash
cat > "$LAB12_DIR/batch.txt" <<EOF
--lab12_batch
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: <get-1>

GET /storage/v1/b/${LAB12_BUCKET}/o/file-01.txt?fields=name,size HTTP/1.1

--lab12_batch
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: <get-2>

GET /storage/v1/b/${LAB12_BUCKET}/o/file-02.txt?fields=name,size HTTP/1.1

--lab12_batch
Content-Type: application/http
Content-Transfer-Encoding: binary
Content-ID: <delete-3>

DELETE /storage/v1/b/${LAB12_BUCKET}/o/file-03.txt HTTP/1.1

--lab12_batch--
EOF
curl -s -X POST "https://storage.googleapis.com/batch/storage/v1" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: multipart/mixed; boundary=lab12_batch" \
  --data-binary @"$LAB12_DIR/batch.txt"
```

The response is also `multipart/mixed`, with one part for each call. The parts for `<response-get-1>` and `<response-get-2>` show `HTTP/1.1 200 OK` and the object metadata. The part for `<response-delete-3>` shows `HTTP/1.1 403 Forbidden`, because `lab12-caller` has no permission to delete objects. Cloud Storage treats each part as a separate HTTP request, and it counts a batch of three calls as three operations for quotas and billing.

8. Run the same kind of calls with the Python client library. The script impersonates `lab12-caller` from your ADC credentials, so it needs no key either. It lists the objects in pages of three with a partial response. Then it shows how its custom retry policy handles a permanent error and a transient error.

```bash
cat pcd/labs/12-google-api-calls/storage_calls.py
python3 -m venv "$LAB12_DIR/venv"
"$LAB12_DIR/venv/bin/pip" install -q -r pcd/labs/12-google-api-calls/requirements.txt
"$LAB12_DIR/venv/bin/python" pcd/labs/12-google-api-calls/storage_calls.py
```

What the three parts of the output show:

| Part | Output | Why |
|---|---|---|
| 1 | Pages of 3, 3, and 1 objects, then `total: 7 objects`. In step 7, the delete failed, so `file-03.txt` is still there. | The `pages` property of the result sends one request for each page and handles the page tokens for you. |
| 2 | `HTTP 403 at once, no retry`, with a message that `lab12-caller` does not have `storage.buckets.get` access | The Storage Object Viewer role has no `storage.buckets.get` permission. A `403` is permanent, so the retry predicate returns `False` and the call fails at once. |
| 3 | Several `transient error, retry after a backoff` lines, then `RetryError ... Timeout of 20.0s exceeded` | The script calls a local address where nothing listens. A refused connection is transient, so the policy retries until the 20-second timeout. The times show random waits (jitter), and the limit of the wait grows after each attempt. |

The retry policy is a `google.api_core.retry.Retry` object with these settings:

| Setting | Value in the script | Meaning |
|---|---|---|
| `predicate` | `is_transient` | Retry HTTP `408`, `429`, `500`, `502`, `503`, and `504`, and lost connections. Do not retry other errors. |
| `initial` | `1.0` | The start value of the wait, in seconds |
| `multiplier` | `2.0` | The wait grows by this factor after each attempt. |
| `maximum` | `8.0` | The longest wait, in seconds |
| `timeout` | `20.0` | How long to keep retrying, in seconds. The library checks it before each retry, so it can stop before 20 seconds when the next wait goes past the limit. |

Without a `retry` argument, the library uses its default retry policy. It retries the operations that are always idempotent. It also retries Objects: insert, Objects: delete, and Objects: patch by default ([Retry strategy](https://docs.cloud.google.com/storage/docs/retry-strategy)). Some other operations retry only when the call has a precondition. For example, `DEFAULT_RETRY_IF_GENERATION_SPECIFIED` retries only a call with a `generation` or `if_generation_match` argument. The default backoff has a first wait of 1 second and a multiplier of 2. The maximum wait is 60 seconds, and the deadline is 120 seconds. To change it, make a copy of `DEFAULT_RETRY` with `with_delay()` and `with_timeout()`.

9. Call the same method in the APIs Explorer. Print your bucket name, and open the [Objects: list](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list) reference page.

```bash
echo "$LAB12_BUCKET"
```

In the APIs Explorer panel of the page (**Try this method**, or click **Try it!** if you do not see it):

- Set `bucket` to your bucket name, `maxResults` to `2`, and `fields` to `items(name),nextPageToken`.
- Under **Credentials**, keep **Google OAuth 2.0**, because the bucket is private data. Optional: click **show scopes**, and select only `https://www.googleapis.com/auth/devstorage.read_only`, the narrowest scope for this read.
- Click **Execute**. Sign in with your Google account, and click **Allow**. Your browser must allow popups.

The result shows `200` and the first two object names. The APIs Explorer uses its own credentials, so you cannot use `lab12-caller` here, and it acts on real data. Click **Full screen** to see the cURL and HTTP samples for the same call.

## Check your work

```bash
gcloud storage buckets get-iam-policy "gs://${LAB12_BUCKET}" \
  --flatten="bindings[].members" --format="value(bindings.role, bindings.members)" | grep lab12-caller
gcloud projects get-iam-policy "$PROJECT_ID" \
  --flatten="bindings[].members" --filter="bindings.members:${CALLER_SA}" \
  --format="value(bindings.role)"
gcloud iam service-accounts get-iam-policy "$CALLER_SA" --format="value(bindings.role)"
gcloud storage ls "gs://${LAB12_BUCKET}" | wc -l
```

Expected output:

- `roles/storage.objectViewer` for `serviceAccount:lab12-caller@...`: the only role of `lab12-caller` on the bucket.
- Nothing for the project policy. `lab12-caller` has no role on the project.
- `roles/iam.serviceAccountTokenCreator`: the role that lets your user impersonate `lab12-caller`.
- `7`: the batch delete failed, so all objects are still there.

## Explore

1. A nightly job lists a bucket with 2 million objects through the JSON API. It stops when a response has fewer than `maxResults` items. Some nights, it misses objects. Why, and what is the fix?

<details><summary>Answer</summary>

The service can return fewer results than `maxResults`, and the next page can even be empty. Only a missing `nextPageToken` means that the listing is complete. Loop until the response has no `nextPageToken`, or use the client library pager (the `pages` property in Python), which does this for you. Keep `maxResults` at 1,000 or less, the recommended upper value, and use `fields` to get only the data that the job uses.

</details>

2. Your code calls a client library method in its own loop that tries three times. A Cloud Storage outage starts. What happens, and what do you change?

<details><summary>Answer</summary>

The client library also retries transient errors. If the library tries three times for each of your three attempts, one call can become nine attempts. A high number of retries can cause request throttling and more latency, and retries without backoff can cause cascading failures. Use the built-in retry policy of the library, and change its settings (wait times and the total timeout) instead of adding your own loop. If you must retry at the application level, disable or limit one of the two layers. Retry only transient errors (`408`, `429`, `5xx`, and lost connections), use exponential backoff with jitter, and set a total time limit.

</details>

3. An upload fails with a `503` error. Is it safe to send the upload again?

<details><summary>Answer</summary>

It depends on idempotency. A retry of a request that is not idempotent can cause race conditions, for example an overwrite of a newer version of the object. Object uploads (insert) are conditionally idempotent: they are safe to retry when the request has an `ifGenerationMatch` precondition. Reads and lists are always idempotent. The Python client library retries object insert, delete, and patch by default. In Python, `DEFAULT_RETRY_IF_GENERATION_SPECIFIED` retries a call only when it has a `generation` or `if_generation_match` argument.

</details>

4. A developer wants to test code on a laptop with the same permissions as the production service account. They ask for a key file. What do you recommend?

<details><summary>Answer</summary>

Use service account impersonation, as in this lab. Grant the developer the Service Account Token Creator role on that one service account. The developer uses `--impersonate-service-account` with gcloud, or impersonated credentials in the client library. Impersonation needs an authenticated user first, and the credentials that it creates are short-lived. A key is a long-lived credential that is a high risk if someone exposes it. In production on Cloud Run or GKE, attach the service account to the workload, and ADC finds it without a key.

</details>

## Clean up

```bash
bash pcd/labs/12-google-api-calls/teardown.sh
```

The script deletes, in order:

- The Storage Object Viewer binding of `lab12-caller` on the bucket.
- The `lab12-<project ID>` bucket and its objects.
- Your Service Account Token Creator binding on `lab12-caller`.
- The `lab12-caller` service account.
- The local work folder `${TMPDIR:-/tmp}/lab12`, with the objects, the batch file, and the Python virtual environment.

It leaves the enabled APIs in place.

The APIs Explorer keeps its access to your Google Account. To remove it, open the list of apps with access to your account, select **Google APIs Explorer**, and click **Remove Access**.

## Docs used

- [Enable and disable services](https://docs.cloud.google.com/service-usage/docs/enable-disable)
- [List services](https://docs.cloud.google.com/service-usage/docs/list-services)
- [Method: services.list (Service Usage API)](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1/services/list)
- [System parameters](https://docs.cloud.google.com/apis/docs/system-parameters)
- [Client libraries explained](https://docs.cloud.google.com/apis/docs/client-libraries-explained)
- [Use service account impersonation](https://docs.cloud.google.com/docs/authentication/use-service-account-impersonation)
- [How Application Default Credentials works](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [IAM roles for Cloud Storage](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
- [Uniform bucket-level access](https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access)
- [Cloud Storage JSON API overview (partial response)](https://docs.cloud.google.com/storage/docs/json_api)
- [Standard query parameters (Cloud Storage JSON API)](https://docs.cloud.google.com/storage/docs/json_api/v1/parameters)
- [Objects: list](https://docs.cloud.google.com/storage/docs/json_api/v1/objects/list)
- [Sending batch requests](https://docs.cloud.google.com/storage/docs/batch)
- [Retry strategy](https://docs.cloud.google.com/storage/docs/retry-strategy)
- [Configuring timeouts and retries (Python client for Cloud Storage)](https://docs.cloud.google.com/python/docs/reference/storage/latest/retry_timeout)
- [Class Client (Python client for Cloud Storage)](https://docs.cloud.google.com/python/docs/reference/storage/latest/google.cloud.storage.client.Client)
- [google.api_core.retry](https://googleapis.dev/python/google-api-core/latest/retry.html)
- [Page iterators (google-api-core)](https://googleapis.dev/python/google-api-core/latest/page_iterator.html)
- [google.auth.impersonated_credentials](https://googleapis.dev/python/google-auth/latest/reference/google.auth.impersonated_credentials.html)
- [Google APIs Explorer overview](https://developers.google.com/explorer-help)
- [Display the APIs Explorer and execute a method](https://developers.google.com/explorer-help/execute-method)
- [Test with different credential types and scopes](https://developers.google.com/explorer-help/authorization-and-authentication)
- [Cloud Storage pricing](https://cloud.google.com/storage/pricing)
