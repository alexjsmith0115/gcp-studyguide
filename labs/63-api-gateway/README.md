---
id: 63-api-gateway
title: API Gateway in front of Cloud Run
objectives: ["5.1"]
minutes: 45
cost: "About $0. API Gateway charges nothing for the first 2 million calls each month for each billing account, and Cloud Run has a monthly free tier. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Put API Gateway in front of a private Cloud Run service. Then roll the gateway forward to a new API config that requires a restricted API key.

## Exam relevance

- You see why API Gateway suits a project-level API for a serverless backend, and what Apigee adds. See [Advising teams: deployment, API management, and testing](note:5.1-deployment-and-apis).
- You see that an API config is immutable. You change an API by creating a new config and updating the gateway.
- You see least privilege for the gateway: a dedicated service account with `roles/run.invoker` on one service. The Cloud Run service stays private. See [Configuring Cloud Run, Cloud Run functions, and VMware Engine networking](note:2.3-serverless).
- You see what an API key does and does not prove about the caller.

## Before you start

- Complete [labs/00-setup](lab:00-setup) so that `labs/env.sh` works.
- You need the Owner or Editor role on the lab project. The API Gateway docs require one of these roles for the first deployment.
- Tools: the gcloud CLI and `curl`.
- Time: about 45 minutes. The API config and the gateway each take several minutes to create.
- API Gateway runs only in some regions. Step 1 uses your lab region if API Gateway supports it, and `us-central1` if not.
- Enable the APIs in step 2.

## Steps

1. Load the lab environment, and choose a region that API Gateway supports.

```bash
source labs/env.sh
case "$REGION" in
  asia-northeast1|australia-southeast1|europe-west1|europe-west2|us-central1|us-east1|us-east4|us-west2|us-west3|us-west4)
    export GW_REGION="$REGION" ;;
  *) export GW_REGION=us-central1 ;;
esac
echo "Gateway region: $GW_REGION"
```

2. Enable Cloud Run, API Gateway, and the two services that API Gateway uses for configuration and runtime checks. The API Keys API lets you create the key in step 8.

```bash
gcloud services enable run.googleapis.com apigateway.googleapis.com \
  servicemanagement.googleapis.com servicecontrol.googleapis.com \
  apikeys.googleapis.com
```

3. Deploy Google's sample container as a private Cloud Run service. Without `--allow-unauthenticated`, only callers with the invoker role can reach it.

```bash
gcloud run deploy lab63-backend \
  --image=us-docker.pkg.dev/cloudrun/container/hello \
  --region="$REGION" \
  --no-allow-unauthenticated \
  --max-instances=2
export BACKEND_URL="$(gcloud run services describe lab63-backend --region="$REGION" --format='value(status.url)')"
echo "$BACKEND_URL"
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL"
```

The last command prints `403`. The service rejects calls without credentials.

4. Create a dedicated service account for the gateway, and let it invoke only this service. The gateway calls the backend with an ID token for this account.

```bash
gcloud iam service-accounts create lab63-gateway-sa \
  --display-name="lab63 API Gateway backend caller"
export GW_SA="lab63-gateway-sa@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud run services add-iam-policy-binding lab63-backend \
  --region="$REGION" \
  --member="serviceAccount:${GW_SA}" \
  --role=roles/run.invoker
```

If the binding fails because the service account does not exist yet, wait one minute and run the last command again.

5. Create the API and the first API config. The config comes from `openapi-v1.yaml`, with your Cloud Run URL in `x-google-backend`.

```bash
sed "s|BACKEND_URL|${BACKEND_URL}|" labs/63-api-gateway/openapi-v1.yaml > /tmp/lab63-openapi-v1.yaml
gcloud api-gateway apis create lab63-api --display-name="lab63 API"
gcloud api-gateway api-configs create lab63-config-v1 \
  --api=lab63-api \
  --openapi-spec=/tmp/lab63-openapi-v1.yaml \
  --backend-auth-service-account="$GW_SA"
```

6. Deploy the config to a gateway, and call the API. A gateway is regional and hosts one API config at a time.

```bash
gcloud api-gateway gateways create lab63-gateway \
  --api=lab63-api \
  --api-config=lab63-config-v1 \
  --location="$GW_REGION"
export GW_HOST="$(gcloud api-gateway gateways describe lab63-gateway --location="$GW_REGION" --format='value(defaultHostname)')"
echo "$GW_HOST"
curl -s -o /dev/null -w '%{http_code}\n' "https://${GW_HOST}/hello"
```

The last command prints `200`. The gateway reaches the private backend, but anyone on the internet can call the gateway.

7. Require an API key. You cannot edit `lab63-config-v1`, so you create `lab63-config-v2` from `openapi-v2.yaml` and point the gateway at it. First, enable the managed service that API Gateway created for the API.

```bash
export MANAGED_SERVICE="$(gcloud api-gateway apis describe lab63-api --format='value(managedService)')"
echo "$MANAGED_SERVICE"
gcloud services enable "$MANAGED_SERVICE"
sed "s|BACKEND_URL|${BACKEND_URL}|" labs/63-api-gateway/openapi-v2.yaml > /tmp/lab63-openapi-v2.yaml
gcloud api-gateway api-configs create lab63-config-v2 \
  --api=lab63-api \
  --openapi-spec=/tmp/lab63-openapi-v2.yaml \
  --backend-auth-service-account="$GW_SA"
gcloud api-gateway gateways update lab63-gateway \
  --api=lab63-api \
  --api-config=lab63-config-v2 \
  --location="$GW_REGION"
```

8. Create an API key that can call only this API. An unrestricted key works for any API that accepts keys, so always add an API restriction.

```bash
gcloud services api-keys create \
  --display-name=lab63-key \
  --api-target=service="$MANAGED_SERVICE"
export KEY_NAME="$(gcloud services api-keys list --filter='displayName=lab63-key' --format='value(name)' --limit=1)"
export API_KEY="$(gcloud services api-keys get-key-string "$KEY_NAME" --format='value(keyString)')"
```

9. Call the API without and with the key.

```bash
curl -s "https://${GW_HOST}/hello"; echo
curl -s -o /dev/null -w '%{http_code}\n' "https://${GW_HOST}/hello?key=${API_KEY}"
```

The first call returns `UNAUTHENTICATED:Method doesn't allow unregistered callers`, followed by a longer explanation. The second call prints `200`. If the second call fails, wait two or three minutes and try again.

## Check your work

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BACKEND_URL"
gcloud api-gateway api-configs list --api=lab63-api --format='table(name.basename(),state)'
gcloud api-gateway gateways describe lab63-gateway --location="$GW_REGION" --format='value(state,apiConfig.basename())'
gcloud services api-keys describe "$KEY_NAME" --format='value(restrictions.apiTargets[0].service)'
```

Expected output:

- `403` for the direct call. The backend stays private.
- Two configs, `lab63-config-v1` and `lab63-config-v2`, both `ACTIVE`.
- The gateway is `ACTIVE` and serves `lab63-config-v2`.
- The key's API target is the managed service from step 7, which ends in `.cloud.goog`.

## Explore

### What Apigee adds

| Need | API Gateway (this lab) | Apigee |
|---|---|---|
| Developer onboarding | You create and share keys yourself | Developer portal with app registration and key delivery |
| Packaging | One API with one active config per gateway | API products that bundle operations, quotas, and access levels |
| Traffic control | API keys, authentication, and quotas | Policies such as SpikeArrest, Quota, caching, and message transformation |
| Revenue | Not a fit | Monetization with rate plans |
| Security analytics | Logs and metrics | Advanced API Security add-on that detects abuse and misconfiguration |
| Where traffic is processed | Google Cloud | Google Cloud, or your own clusters with Apigee hybrid |

1. The Cloud Run service is private. How does the gateway reach it, and what happens if someone deletes `lab63-gateway-sa`?

<details><summary>Answer</summary>

The gateway calls the backend as the service account of the API config. That account has `roles/run.invoker` on `lab63-backend` only. If the account is deleted or disabled, calls through the gateway start to fail with `401` or `500` errors. Treat the gateway service account as production infrastructure, and manage it in IaC.

</details>

2. A developer wants to rename the `/hello` path. Can they edit `lab63-config-v2`? How do you roll back if the change breaks clients?

<details><summary>Answer</summary>

No. An API config is immutable after you create it. The developer creates `lab63-config-v3` from an edited spec and updates the gateway to use it. To roll back, update the gateway to `lab63-config-v2` again. Keep the specs in version control so that each config maps to a commit.

</details>

3. The API will return customer records. Is the API key enough protection?

<details><summary>Answer</summary>

No. An API key identifies a Google Cloud project for quota, billing, and monitoring. It does not identify a user, and it travels in the request. Keep the key for consumer identification and quotas, and add a token-based method, such as Google ID tokens or JWT validation, for sensitive data.

</details>

4. When would you move this API from API Gateway to Apigee?

<details><summary>Answer</summary>

Move when the API becomes a product for partners or third-party developers: they need a portal, tiered API products, or monetization. Also move when many teams need consistent governance, or when policies such as SpikeArrest, transformations, or Advanced API Security are required. Google suggests API Gateway to start with serverless backends, and an upgrade to Apigee as needs grow.

</details>

## Clean up

```bash
bash labs/63-api-gateway/teardown.sh
```

The script deletes, in order:

- The `lab63-key` API key. You can undelete a deleted key within 30 days.
- The `lab63-gateway` gateway.
- The `lab63-config-v1` and `lab63-config-v2` API configs.
- The `lab63-api` API.
- The `lab63-backend` Cloud Run service.
- The `lab63-gateway-sa` service account.
- The rendered specs `/tmp/lab63-openapi-v1.yaml` and `/tmp/lab63-openapi-v2.yaml`.

It leaves the enabled APIs in place.

## Docs used

- [Getting started with API Gateway and Cloud Run](https://docs.cloud.google.com/api-gateway/docs/get-started-cloud-run)
- [Quickstart: Secure traffic to a service with the gcloud CLI](https://docs.cloud.google.com/api-gateway/docs/secure-traffic-gcloud)
- [Use API Keys](https://docs.cloud.google.com/api-gateway/docs/authenticate-api-keys)
- [Securing backend services](https://docs.cloud.google.com/api-gateway/docs/securing-backend-services)
- [Configure the development environment](https://docs.cloud.google.com/api-gateway/docs/configure-dev-env)
- [API Gateway Deployment Model](https://docs.cloud.google.com/api-gateway/docs/deployment-model)
- [OpenAPI 2.0 extensions in API Gateway](https://docs.cloud.google.com/api-gateway/docs/oasv2-extensions)
- [Troubleshooting overview](https://docs.cloud.google.com/api-gateway/docs/troubleshoot)
- [Deploy container images to Cloud Run services](https://docs.cloud.google.com/run/docs/deploying)
- [Troubleshoot Cloud Run issues](https://docs.cloud.google.com/run/docs/troubleshooting)
- [Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys)
- [API Gateway pricing](https://cloud.google.com/api-gateway/pricing)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Choosing between Apigee, API Gateway, and Cloud Endpoints](https://cloud.google.com/blog/products/application-modernization/choosing-between-apigee-api-gateway-and-cloud-endpoints)
