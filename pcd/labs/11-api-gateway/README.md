---
id: 11-api-gateway
title: API keys and rate limits with API Gateway in front of Cloud Run
objectives: ["1.1", "3.1"]
minutes: 45
cost: "About $0. API Gateway has no charge for the first 2 million calls each month for each billing account, and Cloud Run has a monthly free tier. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Put API Gateway (the exam guide says Cloud API Gateway) in front of a private Cloud Run service. The API config requires an API key and sets a per-minute quota (Beta), so you see the responses without a key, with a key, and above the quota.

## Exam relevance

- API Gateway features for rate limiting, authentication, and observability, and when Apigee fits better. See [API management: rate limiting, authentication, and observability with Apigee and API Gateway](note:1.1-api-management).
- An OpenAPI 2.0 document with Google extensions (`x-google-backend`, `x-google-management`, `x-google-quota`) defines the API. See [Designing and deploying REST and gRPC APIs](note:1.1-api-design).
- Exposing a private Cloud Run service through a gateway, and API keys compared with stronger credentials. See [Versioning, exposing, and securing APIs on Cloud Run](note:3.1-api-versioning-and-exposure).
- A dedicated gateway service account with the Cloud Run Invoker role on one service only. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).

## Before you start

- Complete [the setup lab](lab:00-setup) first, so that `source pcd/labs/env.sh` works.
- **IAM:** you are the Owner of the lab project. The API Gateway docs require the Owner or Editor role for the first deployment. The person who creates an API config or gateway also needs the `iam.serviceAccounts.actAs` permission on the gateway service account. The Owner role has it.
- **Tools:** the gcloud CLI and `curl`.
- **Time:** about 45 minutes. The API config and the gateway each take several minutes to create.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs. API Gateway needs the Service Management API and the Service Control API. The API Keys API lets you create the key in step 8.

```bash
source pcd/labs/env.sh
gcloud services enable run.googleapis.com apigateway.googleapis.com \
  servicemanagement.googleapis.com servicecontrol.googleapis.com \
  apikeys.googleapis.com iam.googleapis.com
```

## Steps

1. Choose a region for the gateway. API Gateway runs only in some regions, so the gateway uses your lab region if API Gateway supports it, and `us-central1` if not. The Cloud Run backend stays in your lab region.

```bash
case "$REGION" in
  asia-northeast1|australia-southeast1|europe-west1|europe-west2|us-central1|us-east1|us-east4|us-west2|us-west3|us-west4)
    export GW_REGION="$REGION" ;;
  *) export GW_REGION=us-central1 ;;
esac
echo "Gateway region: $GW_REGION"
```

2. Deploy Google's sample container as a private Cloud Run service. Only callers with the `run.routes.invoke` permission can reach it.

```bash
gcloud run deploy lab11-backend \
  --image=us-docker.pkg.dev/cloudrun/container/hello \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --max=2
export BACKEND_URL="$(gcloud run services describe lab11-backend --region="$REGION" --format='value(status.url)')"
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL"
```

The last command prints `403`. The backend rejects calls without credentials.

3. Create a dedicated service account for the gateway, and let it invoke only this service. The gateway calls the backend with an ID token for this account. The API Gateway docs recommend a separate service account that has only the permissions to call the backend.

```bash
gcloud iam service-accounts create lab11-gateway-sa \
  --display-name="lab11 API Gateway backend caller"
export GW_SA="lab11-gateway-sa@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud run services add-iam-policy-binding lab11-backend \
  --region="$REGION" \
  --member="serviceAccount:${GW_SA}" \
  --role=roles/run.invoker
```

If the binding fails because the service account does not exist yet, wait one minute and run the last command again.

4. Read the OpenAPI document, and put your backend URL into a copy of it. The lab uses OpenAPI 2.0, like the API Gateway quickstart for Cloud Run, but API Gateway also supports OpenAPI 3.0.x and 3.1.x. The file has four parts that matter:

| Part | What it does |
|---|---|
| `x-google-backend` | Routes requests to the Cloud Run URL. At the top level, API Gateway appends the request path to the address. |
| `securityDefinitions` and `security` | Require an API key in the `key` query parameter on `GET /hello`. |
| `x-google-management` | Defines the `hello-requests` metric and a limit of 5 for each minute and each consumer project. |
| `x-google-quota` | Makes each call to `GET /hello` cost 1 unit of `hello-requests`. |

```bash
cat pcd/labs/11-api-gateway/openapi.yaml
export LAB11_SPEC="${TMPDIR:-/tmp}/lab11-openapi.yaml"
sed "s|BACKEND_URL|${BACKEND_URL}|" pcd/labs/11-api-gateway/openapi.yaml > "$LAB11_SPEC"
grep -n 'address' "$LAB11_SPEC"
```

5. Create the API, and enable the managed service that API Gateway creates for it. The API Gateway docs require this step for API keys. For quotas, each consumer project must enable the API and send a key from that project.

```bash
gcloud api-gateway apis create lab11-api --display-name="lab11 API"
export MANAGED_SERVICE="$(gcloud api-gateway apis describe lab11-api --format='value(managedService)')"
echo "$MANAGED_SERVICE"
gcloud services enable "$MANAGED_SERVICE"
```

6. Create the API config from your copy of the OpenAPI document. The config runs as the gateway service account. You cannot change an API config after you create it.

```bash
gcloud api-gateway api-configs create lab11-config-v1 \
  --api=lab11-api \
  --openapi-spec="$LAB11_SPEC" \
  --backend-auth-service-account="$GW_SA"
```

7. Deploy the config to a gateway, and get the gateway host name. A gateway is regional and serves one API config at a time.

```bash
gcloud api-gateway gateways create lab11-gateway \
  --api=lab11-api \
  --api-config=lab11-config-v1 \
  --location="$GW_REGION"
export GW_HOST="$(gcloud api-gateway gateways describe lab11-gateway --location="$GW_REGION" --format='value(defaultHostname)')"
echo "$GW_HOST"
```

8. Create an API key that can call only this API. The gcloud CLI requires at least one API restriction, and an API restriction stops the key from working with other APIs.

```bash
gcloud services api-keys create \
  --display-name=lab11-key \
  --api-target=service="$MANAGED_SERVICE"
export KEY_NAME="$(gcloud services api-keys list --filter='displayName=lab11-key' --format='value(name)' --limit=1)"
export API_KEY="$(gcloud services api-keys get-key-string "$KEY_NAME" --format='value(keyString)')"
```

9. Call the API without a key, then with the key.

```bash
curl -s "https://${GW_HOST}/hello"; echo
curl -s -o /dev/null -w '%{http_code}\n' "https://${GW_HOST}/hello?key=${API_KEY}"
```

The first call returns an error with the message `Method doesn't allow unregistered callers`. The gateway rejects it, and the backend never sees it. The second call prints `200`. If the second call fails, wait two or three minutes and try again.

10. Go above the quota (Beta). The loop sends 20 calls in a few seconds, and the limit is 5 calls each minute.

```bash
for i in $(seq 20); do
  curl -s -o /dev/null -w '%{http_code} ' "https://${GW_HOST}/hello?key=${API_KEY}"
done; echo
sleep 60
curl -s -o /dev/null -w '%{http_code}\n' "https://${GW_HOST}/hello?key=${API_KEY}"
```

The first calls print `200`, and the later calls print `429` (too many requests). The gateway rejects them before they reach the backend. The enforced limit is approximate, with a 30% margin, so the number of `200` responses can be a little more or less than 5. After one minute, the count resets, and the last call prints `200`. A client that gets `429` must slow down, for example with exponential backoff.

For API Gateway, you control quotas as the Cloud Endpoints quota page describes, and that page labels quotas Beta. Beta features are pre-GA features, which can have limited support.

11. Find the rejected calls in Cloud Logging. API Gateway writes request logs, and the `jsonPayload.responseDetails` field tells you whether an error came from the gateway or from the backend. If the command shows nothing, wait one minute and run it again.

```bash
gcloud logging read \
  'resource.type="apigateway.googleapis.com/Gateway" AND resource.labels.gateway_id="lab11-gateway" AND httpRequest.status=429' \
  --freshness=15m --limit=3 \
  --format='table(timestamp, httpRequest.status, jsonPayload.responseDetails)'
```

Each row shows status `429` and `service_control_quota_error`. A value of `via_upstream` means that the error came from the backend.

## Check your work

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL"
gcloud run services get-iam-policy lab11-backend --region="$REGION"
gcloud api-gateway gateways describe lab11-gateway --location="$GW_REGION" --format='value(state,apiConfig.basename())'
gcloud services api-keys describe "$KEY_NAME" --format='value(restrictions.apiTargets[0].service)'
```

Expected output:

- `403` for the direct call. The backend stays private.
- One binding on the backend: `roles/run.invoker` for `serviceAccount:lab11-gateway-sa@...`.
- The gateway is `ACTIVE` and serves `lab11-config-v1`.
- The key's API target is the managed service from step 5.

## Explore

1. The API will return customer records. Is the API key enough protection?

<details><summary>Answer</summary>

No. An API key identifies a Google Cloud project for quota, billing, and monitoring. It does not identify a user, and it travels in every request, so it is less secure than short-lived tokens. Google does not recommend API keys as the only credential when calls contain sensitive data. Keep the key for quotas, and add a token-based method, such as JWT validation of Google ID tokens or tokens from your identity provider. Also, a key in a query parameter is part of the URL, and URL scans can expose it. A request header is safer. The API Gateway OpenAPI 3.x sample sends the key in the `x-api-key` header.

</details>

2. Two partner apps use keys from the same Google Cloud project. One partner sends a burst of calls. What happens to the other partner, and how do you give each partner its own limit?

<details><summary>Answer</summary>

Both partners get `429` responses. API Gateway quotas count calls for each consumer project, and it finds the project from the API key. All keys from one project share one counter. Give each partner its own Google Cloud project, enable the API in each project, and let each partner create its key there. You can override the limit for one consumer project. If you need limits for each app or developer, look at Apigee: its Quota policy can count by app, developer, API key, or access token.

</details>

3. You want to raise the limit to 10 calls each minute. Can you edit `lab11-config-v1`? What must you keep the same?

<details><summary>Answer</summary>

No. An API config is immutable. Create `lab11-config-v2` from an edited OpenAPI document, and update the gateway to use it. Quota metrics and limits apply to the whole API, not to one API config: the most recently created config sets them for every gateway of the API. Change only the value of the limit, and keep the metric name. If you rename or remove a metric, gateways that still serve an older config fail with `500` on the methods that have a quota.

</details>

4. When do you use Apigee instead of API Gateway?

<details><summary>Answer</summary>

| Need | API Gateway | Apigee |
|---|---|---|
| Backends | Mostly serverless services on Google Cloud | Any backend, in Google Cloud, on premises, or hybrid |
| Packaging | One API, with one API config for each gateway | API products bundle operations with quotas and access levels. Apigee provisions keys for API products, not for APIs. |
| Versioning | A new API config for each change | API proxy revisions, with deployment to test and production environments and promotion between them |
| Rate limits | Requests per minute for each consumer project | SpikeArrest for traffic surges, and Quota by app, developer, key, or token |
| Developer onboarding | You share keys yourself | Developer portal, app registration, and monetization |
| Analytics | Cloud Logging and Cloud Monitoring | Apigee API Analytics: top developers, popular methods, response times, and revenue |

Google suggests API Gateway to start with serverless backends and project-level APIs. Choose Apigee for many teams, partners, or third-party developers, high volume, or consistent governance.

</details>

## Clean up

```bash
bash pcd/labs/11-api-gateway/teardown.sh
```

The script deletes, in order:

- The `lab11-key` API key. You can undelete a deleted key within 30 days.
- The `lab11-gateway` gateway.
- The `lab11-config-v1` API config and the `lab11-api` API.
- The `lab11-backend` Cloud Run service.
- The `lab11-gateway-sa` service account.
- The local copy of the OpenAPI document, `${TMPDIR:-/tmp}/lab11-openapi.yaml`.

It leaves the enabled APIs in place.

## Docs used

- [About API Gateway](https://docs.cloud.google.com/api-gateway/docs/about-api-gateway)
- [Getting started with API Gateway and Cloud Run](https://docs.cloud.google.com/api-gateway/docs/get-started-cloud-run)
- [Configure the development environment](https://docs.cloud.google.com/api-gateway/docs/configure-dev-env)
- [API Gateway Deployment Model](https://docs.cloud.google.com/api-gateway/docs/deployment-model)
- [Securing backend services](https://docs.cloud.google.com/api-gateway/docs/securing-backend-services)
- [OpenAPI overview](https://docs.cloud.google.com/api-gateway/docs/openapi-overview)
- [OpenAPI 2.0 extensions in API Gateway](https://docs.cloud.google.com/api-gateway/docs/oasv2-extensions)
- [Use API Keys](https://docs.cloud.google.com/api-gateway/docs/authenticate-api-keys)
- [About quotas (API Gateway)](https://docs.cloud.google.com/api-gateway/docs/quotas-overview)
- [About quotas (Cloud Endpoints)](https://docs.cloud.google.com/endpoints/docs/openapi/quotas-overview)
- [Troubleshooting overview](https://docs.cloud.google.com/api-gateway/docs/troubleshoot)
- [Troubleshooting response errors (Cloud Endpoints)](https://docs.cloud.google.com/endpoints/docs/openapi/troubleshoot-response-errors)
- [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys)
- [Use API keys to access APIs](https://docs.cloud.google.com/docs/authentication/api-keys-use)
- [What is Apigee?](https://docs.cloud.google.com/apigee/docs/api-platform/get-started/what-apigee)
- [Introduction to API products](https://docs.cloud.google.com/apigee/docs/api-platform/publish/what-api-product)
- [Understanding APIs and API proxies](https://docs.cloud.google.com/apigee/docs/api-platform/fundamentals/understanding-apis-and-api-proxies)
- [Rate-limiting (Apigee)](https://docs.cloud.google.com/apigee/docs/api-platform/develop/rate-limiting)
- [Apigee API Analytics overview](https://docs.cloud.google.com/apigee/docs/api-platform/analytics/analytics-services-overview)
- [Choosing between Apigee, API Gateway, and Cloud Endpoints](https://cloud.google.com/blog/products/application-modernization/choosing-between-apigee-api-gateway-and-cloud-endpoints)
- [API Gateway pricing](https://cloud.google.com/api-gateway/pricing)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
