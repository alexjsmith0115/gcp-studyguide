---
id: 62-memorystore-cache
title: "Cache-aside with Memorystore from Cloud Run over Direct VPC egress"
objectives: ["1.1", "1.2"]
minutes: 50
cost: "About $0.05 for each hour that the Redis instance exists: a Memorystore for Redis Basic Tier instance costs $0.049 per GiB-hour in us-central1, and the lab uses 1 GiB. Finish in one sitting and run teardown.sh. Cloud Run, Cloud Build (2,500 build-minutes each month), Artifact Registry (0.5 GiB of storage each month), and Secret Manager (6 active secret versions each month) have free tiers."
requiresOrg: false
---

## Goal

Deploy a private Python service to Cloud Run that reads product data through a Memorystore for Redis cache. The service reaches the private IP address of the instance over Direct VPC egress. It logs in with the Redis AUTH string from Secret Manager, and it encrypts the connection with TLS. You compare the latency of a cache miss and a cache hit, invalidate an entry, and watch an entry expire at its TTL.

## Exam relevance

- **Cache-aside with a TTL.** Requests check the cache first, and they query the database only if the results are absent or have expired ([Caching data with Memorystore](https://docs.cloud.google.com/appengine/docs/standard/using-memorystore)). The default eviction policy is `volatile-lru`, so set TTLs on the keys that you want to expire, "otherwise Redis has no keys to evict" ([Memory management best practices](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices)). See [Caching with Memorystore and Cloud CDN](note:1.1-caching).
- **Cloud Run to a private IP address.** A Memorystore for Redis instance has a private IP address only. Cloud Run reaches it through the VPC network. Google recommends Direct VPC egress over a Serverless VPC Access connector, because it "offers lower latency, higher throughput, and lower costs" ([Connect to a Redis instance from a Cloud Run service](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run)). See [Secure service-to-service communication](note:1.2-service-to-service).
- **AUTH and TLS do different jobs.** AUTH "does not provide security during data transportation" ([About Redis AUTH](https://docs.cloud.google.com/memorystore/docs/redis/about-redis-auth)). With in-transit encryption, the instance blocks clients that do not use TLS ([About in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/about-in-transit-encryption)).
- **A secret in an environment variable, pinned to a version.** Cloud Run resolves secret environment variables at instance startup, so Google recommends a version number instead of `latest` ([Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)). The service identity can read one secret and nothing else. See [Secrets, credentials, and keys: Secret Manager, Cloud KMS, and Workload Identity Federation](note:1.2-secrets-and-keys) and [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).

## Before you start

- Complete [the setup lab](lab:00-setup) first. It prepares deployments from source: it gives the Compute Engine default service account the Cloud Run Builder role.
- **IAM:** you are the Owner of the lab project.
- **Tools:** the gcloud CLI, `curl`, and `python3` (to format the replies). You do not need Docker. Cloud Build makes the image.
- **Network:** the lab uses the `default` VPC network and its subnet in your region. Each new project starts with this network, unless an organization policy prevents it ([VPC networks](https://docs.cloud.google.com/vpc/docs/vpc)).
- **Time:** about 50 minutes. The instance takes several minutes to create, and the deployment from source takes a few minutes.
- **Cost:** the instance costs money for each hour that it exists. Do the lab in one sitting, and run `teardown.sh` at the end.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the APIs. The Compute Engine API manages the VPC network.

```bash
source pcd/labs/env.sh
gcloud services enable redis.googleapis.com secretmanager.googleapis.com compute.googleapis.com \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com
```

## Steps

1. Set the names that the lab uses, and check the subnet. With Direct VPC egress, Cloud Run instances get IP addresses from this subnet. The subnet must be `/26` or larger. At steady state, a service uses 2 times as many IP addresses as it has instances ([Direct VPC with a VPC network](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)).

   ```bash
   export INSTANCE=lab62-cache
   export RUN_SA="lab62-run@${PROJECT_ID}.iam.gserviceaccount.com"
   gcloud compute networks subnets describe default --region="$REGION" --format="value(ipCidrRange)"
   ```

   In `us-central1`, the output is `10.128.0.0/20`, the auto mode subnet range for that region ([Subnets](https://docs.cloud.google.com/vpc/docs/subnets)). A `/20` range has 4,096 addresses, which is more than enough.

2. Create the Redis instance. The command waits until the instance is ready.

   ```bash
   gcloud redis instances create "$INSTANCE" \
     --region="$REGION" \
     --tier=basic \
     --size=1 \
     --redis-version=redis_7_2 \
     --network=default \
     --enable-auth \
     --transit-encryption-mode=server-authentication
   ```

   | Flag | Why |
   |---|---|
   | `--tier=basic` | One node, with no replication and no automatic failover. Standard Tier instances replicate across zones, fail over automatically, and have a 99.9% SLA ([Memorystore for Redis overview](https://docs.cloud.google.com/memorystore/docs/redis/memorystore-for-redis-overview)). |
   | `--size=1` | 1 GiB, the smallest size. A Basic Tier instance of 1 to 4 GiB costs $0.049 per GiB-hour in us-central1. Billing is in 1-second increments ([Memorystore for Redis pricing](https://cloud.google.com/memorystore/docs/redis/pricing)). |
   | `--redis-version=redis_7_2` | The docs do not agree on the default version. [Supported versions](https://docs.cloud.google.com/memorystore/docs/redis/supported-versions) says 7.2, and [Create and manage Redis instances](https://docs.cloud.google.com/memorystore/docs/redis/create-manage-instances) says 7.0. The flag makes the version explicit. |
   | `--network=default` | The authorized network. Only apps in this VPC network can connect ([Memorystore for Redis overview](https://docs.cloud.google.com/memorystore/docs/redis/memorystore-for-redis-overview)). |
   | `--enable-auth` | Turns on AUTH. Memorystore generates the AUTH string, a UUID. Without this flag, AUTH is off ([About Redis AUTH](https://docs.cloud.google.com/memorystore/docs/redis/about-redis-auth)). |
   | `--transit-encryption-mode=server-authentication` | Turns on in-transit encryption (TLS). You can turn it on only when you create the instance, and you cannot turn it off later ([Manage in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/manage-in-transit-encryption)). |

   The command has no `--connect-mode` flag, so the instance uses direct peering, the default. Memorystore creates the VPC peering automatically. For an instance in a dedicated VPC network, the docs allow direct peering or private services access, and they recommend private services access. Private services access needs an allocated IP range and a private connection before you create the instance. Shared VPC and access from on-premises networks over VPN need it. You cannot change the connect mode of an existing instance ([Networking](https://docs.cloud.google.com/memorystore/docs/redis/networking)). This lab uses direct peering, because it needs no extra setup and no extra cleanup.

   This lab uses Memorystore for Redis, and not Memorystore for Valkey, because of the network path. The Redis docs show the connection from Cloud Run over Direct VPC egress. The Valkey docs list a Serverless VPC Access connector as a requirement for Cloud Run ([Supported environments (Valkey)](https://docs.cloud.google.com/memorystore/docs/valkey/supported-environments)), and a connector adds VM charges ([Compare Direct VPC egress and VPC connectors](https://docs.cloud.google.com/run/docs/configuring/connecting-vpc)). Valkey also needs a service connection policy for Private Service Connect in the network ([Networking (Valkey)](https://docs.cloud.google.com/memorystore/docs/valkey/networking)).

3. Read the connection details. Then save the Certificate Authority (CA) certificates of the instance in the app folder.

   ```bash
   gcloud redis instances describe "$INSTANCE" --region="$REGION" \
     --format="value(host,connectMode,authEnabled,transitEncryptionMode)"
   export REDIS_HOST="$(gcloud redis instances describe "$INSTANCE" --region="$REGION" --format='value(host)')"
   export REDIS_PORT=6378
   gcloud redis instances describe "$INSTANCE" --region="$REGION" \
     --flatten="serverCaCerts[]" --format="value(serverCaCerts.cert)" \
     > pcd/labs/62-memorystore-cache/app/server-ca.pem
   grep -c "BEGIN CERTIFICATE" pcd/labs/62-memorystore-cache/app/server-ca.pem
   ```

   The first line shows a private IP address, `DIRECT_PEERING`, `True`, and `SERVER_AUTHENTICATION`. With in-transit encryption, clients connect to port 6378 ([Manage in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/manage-in-transit-encryption)). The `grep` command counts 1 certificate. An instance can have up to three CAs. Install all of them on the client ([Connect to a Redis instance](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance)). A CA is valid for 10 years. Memorystore makes a new CA available 5 years after it creates the instance ([About in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/about-in-transit-encryption)). The CA certificate is not secret, so the build copies it into the image with the source code.

4. Store the AUTH string in Secret Manager. Then create the service identity `lab62-run`, and let it read this one secret.

   ```bash
   gcloud redis instances get-auth-string "$INSTANCE" --region="$REGION" --format="value(authString)" \
     | tr -d '\n' | gcloud secrets create lab62-redis-auth --data-file=- --replication-policy=automatic
   gcloud secrets versions list lab62-redis-auth
   gcloud iam service-accounts create lab62-run --display-name="lab62 Cloud Run service identity"
   gcloud secrets add-iam-policy-binding lab62-redis-auth \
     --member="serviceAccount:${RUN_SA}" --role=roles/secretmanager.secretAccessor
   ```

   The pipe sends the AUTH string from one command to the next, so it does not show in your terminal. `tr -d '\n'` removes the line end that the `value()` format adds. Without it, the secret holds a wrong password.

   Of the Memorystore for Redis predefined roles, only Redis Admin has `redis.instances.getAuthString` ([Access control with IAM](https://docs.cloud.google.com/memorystore/docs/redis/access-control)). The service identity does not need it, because it reads the string from the secret. The grant is on the secret, not on the project: Secret Manager says to "apply permissions at the lowest level in the resource hierarchy" ([Access control with IAM (Secret Manager)](https://docs.cloud.google.com/secret-manager/docs/access-control)). If the binding fails because the service account does not exist yet, wait one minute and run the last command again.

   To change the AUTH string later, turn AUTH off and on again. Memorystore then generates a new string ([Manage Redis AUTH](https://docs.cloud.google.com/memorystore/docs/redis/manage-redis-auth)). Add the new string as version 2 of the secret, and deploy a revision that uses version 2.

5. Read the app.

   ```bash
   cat pcd/labs/62-memorystore-cache/app/requirements.txt
   cat pcd/labs/62-memorystore-cache/app/Procfile
   cat pcd/labs/62-memorystore-cache/app/main.py
   ```

   Look for these points:

   - The client is a global variable, so later requests on the same instance reuse it ([General development tips](https://docs.cloud.google.com/run/docs/tips/general)). Its connection pool keeps TLS connections open. The docs say to "establish and reuse long-running connections rather than creating on-demand short-lived connections" ([About in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/about-in-transit-encryption)).
   - `ssl=True` with `ssl_ca_certs`: the client uses TLS, and it checks the server certificate against the CA of this instance. `ssl_check_hostname=False`, because the app connects to an IP address. The Stunnel sample in the docs also checks the certificate chain (`verifyChain=yes`) and not the host name ([Connect to a Redis instance](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance)).
   - `password`: the AUTH string, from the environment variable `REDIS_AUTH`. The client sends it in the `AUTH` command on each new connection.
   - The three cache-aside steps: read the cache, return a hit, or read the source and write the value with a TTL of 60 seconds (`CACHE_TTL_SECONDS`).
   - `except redis.RedisError`: if the cache fails, the app reads the source and still answers. The short timeouts (2 seconds) keep a slow cache from making every request slow. See "Design for cache failure" in [Caching with Memorystore and Cloud CDN](note:1.1-caching).
   - The `Procfile` starts gunicorn with 8 threads. Google recommends Cloud Run concurrency "equal or less than any code-level configuration" ([General development tips](https://docs.cloud.google.com/run/docs/tips/general)), so step 6 sets the concurrency to 8.
   - `.python-version` selects Python 3.13. Clients on Python 3.13 or later can fail to connect to instances that were created before July 2025, because of stricter certificate checks ([About in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/about-in-transit-encryption)). This lab creates a new instance, so this does not apply.

6. Deploy the service from source. If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`.

   ```bash
   gcloud run deploy lab62-app \
     --source=pcd/labs/62-memorystore-cache/app \
     --region="$REGION" \
     --service-account="$RUN_SA" \
     --no-allow-unauthenticated \
     --network=default --subnet=default --vpc-egress=private-ranges-only \
     --concurrency=8 --max=2 \
     --set-env-vars="REDIS_HOST=${REDIS_HOST},REDIS_PORT=${REDIS_PORT},CACHE_TTL_SECONDS=60" \
     --set-secrets="REDIS_AUTH=lab62-redis-auth:1"
   ```

   | Flag | Why |
   |---|---|
   | `--service-account` | The service identity. It can read the secret `lab62-redis-auth` and nothing else. |
   | `--no-allow-unauthenticated` | Only callers with the `run.routes.invoke` permission can call the service. |
   | `--network`, `--subnet` | Turn on Direct VPC egress. Instances get IP addresses from the `default` subnet, and they can send traffic to the VPC network. You do not need a connector ([Direct VPC with a VPC network](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)). |
   | `--vpc-egress=private-ranges-only` | Sends only traffic to internal addresses through the VPC network. This is the default value. |
   | `--concurrency=8` | Equal to the 8 gunicorn threads. |
   | `--max=2` | The service-level maximum number of instances. It limits the cost, the IP addresses in the subnet, and the connections to the Redis instance. |
   | `--set-env-vars` | The host, the port, and the TTL. There is no password in plain text. |
   | `--set-secrets` | `REDIS_AUTH` gets version 1 of the secret, not `latest`. During the deployment, Cloud Run checks that the service account can access the secret ([Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)). |

   If the deployment fails with a permission error on the secret, the grant from step 4 is not active yet. Wait one minute and deploy again.

   If the build fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deployments from source. Grant the role as in 00-setup, wait a few minutes for the grant to propagate, and deploy again ([Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)). `teardown.sh` does not remove this grant, because other labs need it.

   ```bash
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role=roles/run.builder --condition=None
   ```

7. Call the service twice for the same product, with your identity token.

   ```bash
   export URL="$(gcloud run services describe lab62-app --region="$REGION" --format='value(status.url)')"
   export TOKEN="$(gcloud auth print-identity-token)"
   curl -s -H "Authorization: Bearer $TOKEN" "$URL/products/42"
   curl -s -H "Authorization: Bearer $TOKEN" "$URL/products/42"
   ```

   The first reply has `"cache":"miss"`, a `latency_ms` of about 1500, and `"ttl_left":60`. The second reply has `"cache":"hit"`, a `latency_ms` of a few milliseconds, and the same `loaded_at` time. The app measures `latency_ms` itself, so the value does not include the network time to your computer.

   If the reply has `"cache":"error: ..."`, the app could not reach the cache, and it answered from the source. Read the error text:

   - `Timeout connecting to server`: with Direct VPC egress, connections can take a minute or more to work when an instance starts ([Direct VPC with a VPC network](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)). Wait one minute and call again.
   - `CERTIFICATE_VERIFY_FAILED`: `server-ca.pem` does not hold the CA of this instance. Run the commands of step 3 again, then deploy again.
   - `invalid username-password pair`: the secret holds a wrong AUTH string. The client shows the `WRONGPASS` error of the instance without its first word ([About Redis AUTH](https://docs.cloud.google.com/memorystore/docs/redis/about-redis-auth)). Run the first command of step 4 again, with `gcloud secrets versions add lab62-redis-auth --data-file=-` instead of `gcloud secrets create ...`. Then deploy with `--set-secrets="REDIS_AUTH=lab62-redis-auth:2"`.

8. Compare the latency of misses and hits for three products.

   ```bash
   for round in 1 2; do
     for id in 1 2 3; do
       curl -s -H "Authorization: Bearer $TOKEN" "$URL/products/$id" | python3 -c \
         'import json, sys; r = json.load(sys.stdin); print(r["product"]["id"], r["cache"], r["latency_ms"], "ms")'
     done
   done
   ```

   The first round shows `miss` and about 1500 ms for each product. The second round shows `hit` and a few milliseconds. If the service runs two instances, both read the same cache. A value in a global variable is different: it stays in the memory of one instance, and you cannot know which requests reach that instance ([General development tips](https://docs.cloud.google.com/run/docs/tips/general)).

9. Invalidate an entry. In a real app, the code that changes a product in the database also deletes its cache entry. The next read is a miss, and it loads the current data.

   ```bash
   curl -s -X DELETE -H "Authorization: Bearer $TOKEN" "$URL/products/42"
   curl -s -H "Authorization: Bearer $TOKEN" "$URL/products/42"
   curl -s -H "Authorization: Bearer $TOKEN" "$URL/products/42"
   ```

   The first reply is `{"deleted":1}`, or `{"deleted":0}` if the entry already expired. Then you get a miss with a new `loaded_at` time, and a hit.

10. Watch the entry expire. Step 9 wrote it again, with a TTL of 60 seconds.

    ```bash
    sleep 61
    curl -s -H "Authorization: Bearer $TOKEN" "$URL/products/42"
    ```

    The reply is a miss with a new `loaded_at` time. The TTL limits how old a cached value can get, even if an invalidation is lost.

## Check your work

```bash
gcloud redis instances describe "$INSTANCE" --region="$REGION" \
  --format="value(tier,memorySizeGb,redisVersion,connectMode,authEnabled,transitEncryptionMode)"
gcloud run services describe lab62-app --region="$REGION" | grep -A3 "VPC access"
gcloud run services describe lab62-app --region="$REGION" \
  --format="yaml(spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env)"
curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL/products/7"
```

Expected:

- The instance line shows `BASIC`, `1`, `REDIS_7_2`, `DIRECT_PEERING`, `True`, and `SERVER_AUTHENTICATION`.
- `VPC access` shows the network `default`, the subnet `default`, and the egress setting `private-ranges-only`.
- The service runs as `lab62-run@PROJECT_ID.iam.gserviceaccount.com`. The environment has `REDIS_HOST`, `REDIS_PORT`, and `CACHE_TTL_SECONDS` with values. `REDIS_AUTH` has no value: it refers to the secret `lab62-redis-auth` and a version number (`1`, or `2` if you replaced the AUTH string in step 7).
- The call returns `"cache":"miss"` with a `latency_ms` of about 1500.

## Explore

1. Product names change in the database a few times each day. After a change, users must see the new name within 5 seconds. The current TTL is 60 seconds. What do you change?

   <details><summary>Answer</summary>

   Delete the cache entry in the same code path that writes the database, as the `DELETE` route in step 9 does. The next read is a miss and loads the new name. Another option is write-through: the app writes the cache and the database at the same time, which "increases the likelihood of cache hits" ([Develop energy-efficient software](https://docs.cloud.google.com/architecture/framework/sustainability/energy-efficient-software)). Keep a TTL in both cases. It limits the age of a value when an invalidation fails. Also, with the default eviction policy `volatile-lru`, keys without a TTL are never evicted, so a full instance has no keys to evict ([Memory management best practices](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices)). A TTL of 5 seconds alone also meets the requirement, but it makes more misses and more load on the database.

   </details>

2. The product data is public and the same for all users. A teammate asks if Cloud CDN can replace Memorystore. What do you answer?

   <details><summary>Answer</summary>

   Cloud CDN caches complete HTTP responses at Google edge locations, close to the users. It works with the global external Application Load Balancer or the classic Application Load Balancer ([Cloud CDN overview](https://docs.cloud.google.com/cdn/docs/overview)), and a serverless NEG connects the load balancer to Cloud Run ([Set up a global external Application Load Balancer with Cloud Run, App Engine, or Cloud Run functions](https://docs.cloud.google.com/load-balancing/docs/https/setup-global-ext-https-serverless)). It caches only responses to `GET` requests. JSON is not a static content type, so in the default cache mode `CACHE_ALL_STATIC`, the app must send a header such as `Cache-Control: public, max-age=60`. If the request has an `Authorization` header, Cloud CDN caches the response only with `public`, `must-revalidate`, or `s-maxage` ([Caching overview](https://docs.cloud.google.com/cdn/docs/caching)). To update cached content, Google recommends versioned URLs, and invalidation "only as a last resort" ([Content delivery best practices](https://docs.cloud.google.com/cdn/docs/best-practices)).

   So Cloud CDN can cache the public responses, but it does not replace Memorystore. The app controls Memorystore entries directly: it can cache parts of a response or per-user data, and it deletes an entry at once after a change. The two layers can work together.

   </details>

3. A teammate wants to use a Serverless VPC Access connector instead of Direct VPC egress. Compare the two for this service.

   <details><summary>Answer</summary>

   Both send requests from Cloud Run to internal IP addresses, such as Memorystore instances ([Compare Direct VPC egress and VPC connectors](https://docs.cloud.google.com/run/docs/configuring/connecting-vpc)).

   | | Direct VPC egress (recommended) | Serverless VPC Access connector |
   |---|---|---|
   | Cost | Network traffic only | Also VM charges for the connector instances |
   | Latency and throughput | Lower latency, higher throughput | Higher latency, lower throughput |
   | IP addresses | Uses more addresses in most cases. The subnet must be `/26` or larger | Uses fewer addresses |
   | Scaling | New instances start slower, while Cloud Run creates network interfaces | Latency during traffic surges, while more connector instances start |

   A connector is the documented choice for Memorystore for Valkey, because the Valkey docs list it as a requirement for Cloud Run ([Supported environments (Valkey)](https://docs.cloud.google.com/memorystore/docs/valkey/supported-environments)). For Memorystore for Redis, Google recommends Direct VPC egress ([Connect to a Redis instance from a Cloud Run service](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run)).

   </details>

4. After a new deployment, the first requests return `"cache":"error: Timeout connecting to server"`, and later requests are hits. What happened, and what do the docs recommend?

   <details><summary>Answer</summary>

   With Direct VPC egress, connections can take a minute or more to work when an instance starts. The docs recommend an HTTP startup probe that tests a connection to an egress destination before the app accepts requests. Set the period and the threshold of the probe so that they act as retries ([Direct VPC with a VPC network](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)). For this app, add a route that runs `cache.ping()` and returns an error status if it fails. Then deploy with `--startup-probe=httpGet.path=ROUTE,periodSeconds=PERIOD,failureThreshold=THRESHOLD` ([Configure container health checks for services](https://docs.cloud.google.com/run/docs/configuring/healthchecks)).

   Think about the trade-off. With the probe, an instance does not start while the cache is unreachable. For a cache that the app can work without, the fallback in this app already keeps the service up, and the only cost is a slow first minute.

   </details>

## Clean up

Run the teardown script in the lab shell:

```bash
bash pcd/labs/62-memorystore-cache/teardown.sh
```

The script deletes:

- the Cloud Run service `lab62-app`,
- the `lab62-app` image in the `cloud-run-source-deploy` repository,
- the Redis instance `lab62-cache`, with all its data,
- the secret `lab62-redis-auth`, with its versions and its IAM policy,
- the service account `lab62-run`,
- the CA file `app/server-ca.pem`.

The enabled APIs, the `default` network, and the `cloud-run-source-deploy` repository stay, because other labs use them.

## Docs used

- [Connect to a Redis instance from a Cloud Run service](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run)
- [Memorystore for Redis overview](https://docs.cloud.google.com/memorystore/docs/redis/memorystore-for-redis-overview)
- [Create and manage Redis instances](https://docs.cloud.google.com/memorystore/docs/redis/create-manage-instances)
- [Supported versions](https://docs.cloud.google.com/memorystore/docs/redis/supported-versions)
- [Networking](https://docs.cloud.google.com/memorystore/docs/redis/networking)
- [About Redis AUTH](https://docs.cloud.google.com/memorystore/docs/redis/about-redis-auth)
- [Manage Redis AUTH](https://docs.cloud.google.com/memorystore/docs/redis/manage-redis-auth)
- [About in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/about-in-transit-encryption)
- [Manage in-transit encryption](https://docs.cloud.google.com/memorystore/docs/redis/manage-in-transit-encryption)
- [Connect to a Redis instance](https://docs.cloud.google.com/memorystore/docs/redis/connect-redis-instance)
- [Access control with IAM](https://docs.cloud.google.com/memorystore/docs/redis/access-control)
- [Memory management best practices](https://docs.cloud.google.com/memorystore/docs/redis/memory-management-best-practices)
- [Memorystore for Redis pricing](https://cloud.google.com/memorystore/docs/redis/pricing)
- [Supported environments (Valkey)](https://docs.cloud.google.com/memorystore/docs/valkey/supported-environments)
- [Networking (Valkey)](https://docs.cloud.google.com/memorystore/docs/valkey/networking)
- [Caching data with Memorystore](https://docs.cloud.google.com/appengine/docs/standard/using-memorystore)
- [Develop energy-efficient software](https://docs.cloud.google.com/architecture/framework/sustainability/energy-efficient-software)
- [Direct VPC with a VPC network](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)
- [Compare Direct VPC egress and VPC connectors](https://docs.cloud.google.com/run/docs/configuring/connecting-vpc)
- [VPC networks](https://docs.cloud.google.com/vpc/docs/vpc)
- [Subnets](https://docs.cloud.google.com/vpc/docs/subnets)
- [Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Access control with IAM (Secret Manager)](https://docs.cloud.google.com/secret-manager/docs/access-control)
- [General development tips](https://docs.cloud.google.com/run/docs/tips/general)
- [Configure container health checks for services](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Cloud CDN overview](https://docs.cloud.google.com/cdn/docs/overview)
- [Caching overview](https://docs.cloud.google.com/cdn/docs/caching)
- [Content delivery best practices](https://docs.cloud.google.com/cdn/docs/best-practices)
- [Set up a global external Application Load Balancer with Cloud Run, App Engine, or Cloud Run functions](https://docs.cloud.google.com/load-balancing/docs/https/setup-global-ext-https-serverless)
