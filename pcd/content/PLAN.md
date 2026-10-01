# Content plan: Professional Cloud Developer guide

This plan lists every notes page, lab, question file, and flashcard file of the PCD guide, and the domain that owns it. Use these IDs for cross-links (`note:<id>`, `lab:<id>`). Format rules are in `pcd/content/SPEC.md`.

The exam guide has 4 sections and 11 objectives (`pcd/content/exam.json`). Each objective's considerations are numbered below in exam guide order (1.1-1 is the first consideration of objective 1.1). Every consideration has at least one page.

## Owners

| Key | Domain |
|---|---|
| plat | Platforms, containers, resources, and regions |
| net | Load balancing, caching, and traffic splitting |
| api | API design, API management, and calling Google Cloud APIs |
| evt | Events, messaging, and orchestration |
| sec | Application security: retention, vulnerabilities, secrets, and network paths |
| iam | Identity: authentication, service accounts, and least privilege |
| data | Data storage design: choice, schemas, and consistency |
| dio | Data access in code: signed URLs, BigQuery writes, connections, reads and writes |
| dev | Development environment, AI-assisted development, and generative AI APIs |
| cicd | Build and test pipelines: Cloud Build, Artifact Registry, provenance, and tests |
| run | Deploying to Cloud Run and GKE |
| obs | Observability: instrumentation, tracing, and troubleshooting |

## Exam guide considerations

| ID | Consideration (short) | Pages |
|---|---|---|
| 1.1-1 | Choosing the platform (Compute Engine, GKE, Cloud Run) | 1.1-platform-choice |
| 1.1-2 | Building, refactoring, and deploying containers to Cloud Run and GKE | 1.1-containers, 3.1-deploy-from-source, 3.2-gke-deployments |
| 1.1-3 | Geographic distribution: latency, regional and zonal services | 1.1-regions-and-replication |
| 1.1-4 | Use cases for load balancers | 1.1-load-balancing |
| 1.1-5 | Session affinity | 1.1-load-balancing, 1.1-caching |
| 1.1-6 | Caching (Memorystore) | 1.1-caching |
| 1.1-7 | Creating and deploying APIs (HTTP REST, gRPC) | 1.1-api-design |
| 1.1-8 | Rate limiting, authentication, and observability (Apigee, API Gateway) | 1.1-api-management |
| 1.1-9 | Asynchronous and event-driven integration (Eventarc, Pub/Sub) | 1.1-async-events |
| 1.1-10 | Resource requirements for workloads | 1.1-resources-and-cost |
| 1.1-11 | Cost and resource usage | 1.1-resources-and-cost |
| 1.1-12 | Data replication for zonal and regional failover | 1.1-regions-and-replication, 1.3-consistency-and-replication |
| 1.1-13 | Traffic splitting on Cloud Run or GKE | 1.1-traffic-splitting |
| 1.1-14 | Orchestration (Workflows, Eventarc, Cloud Tasks, Cloud Scheduler) | 1.1-orchestration |
| 1.2-1 | Retention and organization policies (lifecycle, retention policies and lock) | 1.2-retention-and-org-policy |
| 1.2-2 | IAP, Web Security Scanner | 1.2-protect-and-scan |
| 1.2-3 | Artifact Analysis and Security Command Center findings | 1.2-protect-and-scan |
| 1.2-4 | Secrets, credentials, and keys (Secret Manager, Cloud KMS, WIF) | 1.2-secrets-and-keys |
| 1.2-5 | Authenticating to Google Cloud (ADC, JWT, OAuth 2.0, auth proxies, Identity Platform, WIF) | 1.2-authenticating-to-google-cloud, 1.2-user-authentication |
| 1.2-6 | IAM roles for service accounts | 1.2-service-accounts-least-privilege |
| 1.2-7 | Service-to-service security (Cloud Service Mesh, network policies, Direct VPC egress, private connectivity) | 1.2-service-to-service |
| 1.2-8 | Least privilege | 1.2-service-accounts-least-privilege |
| 1.2-9 | Binary Authorization | 2.2-provenance-binary-authorization |
| 1.3-1 | Storage choice by volume and performance | 1.3-storage-choice |
| 1.3-2 | Schemas: AlloyDB, Spanner, Bigtable, Firestore | 1.3-relational-schema, 1.3-nosql-schema |
| 1.3-3 | Eventual and strong consistency (AlloyDB, Bigtable, Cloud SQL, Spanner, Cloud Storage) | 1.3-consistency-and-replication |
| 1.3-4 | Signed URLs | 1.3-signed-urls |
| 1.3-5 | Writing data to BigQuery | 1.3-bigquery-writes |
| 2.1-1 | Emulators with the gcloud CLI | 2.1-emulators |
| 2.1-2 | Console, Cloud SDK, Cloud Code, Gemini Cloud Assist, Cloud Shell, Cloud Workstations | 2.1-developer-tools |
| 2.1-3 | IDE integrations (Cloud SDK, coding assistants, MCP servers) | 2.1-developer-tools, 2.1-ai-assisted-development |
| 2.2-1 | Cloud Build and Artifact Registry | 2.2-cloud-build-artifact-registry |
| 2.2-2 | Provenance in Cloud Build (Binary Authorization) | 2.2-provenance-binary-authorization |
| 2.3-1 | Unit tests with AI coding assistants | 2.3-unit-tests-with-ai |
| 2.3-2 | Integration tests in Cloud Build | 2.3-integration-tests-cloud-build |
| 3.1-1 | Deploying from source code | 3.1-deploy-from-source |
| 3.1-2 | Invoking Cloud Run with triggers (Eventarc, Pub/Sub) | 3.1-triggers-and-receivers |
| 3.1-3 | Event receivers (Eventarc, Pub/Sub) | 3.1-triggers-and-receivers |
| 3.1-4 | Versioning, exposing, and securing APIs (Apigee) | 3.1-api-versioning-and-exposure |
| 3.2-1 | Deploying containerized applications to GKE | 3.2-gke-deployments |
| 3.2-2 | Kubernetes health checks | 3.2-health-checks |
| 3.2-3 | Horizontal Pod Autoscaler | 3.2-autoscaling |
| 4.1-1 | Connections to Cloud SQL, Firestore, and Cloud Storage | 4.1-datastore-connections |
| 4.1-2 | Reading and writing data | 4.1-reading-writing-data |
| 4.1-3 | Publishing and consuming messages | 4.1-messaging |
| 4.2-1 | Enabling Google Cloud services | 4.2-calling-google-apis |
| 4.2-2 | API call options and batching, restricting data, pagination, caching, error handling | 4.2-calling-google-apis, 4.2-efficient-api-calls |
| 4.2-3 | Service accounts for API calls | 4.2-calling-google-apis |
| 4.3-1 | Instrumenting code (metrics, logs, traces) | 4.3-instrumentation |
| 4.3-2 | Identifying and resolving issues | 4.3-troubleshooting |
| 4.3-3 | Error Reporting | 4.3-troubleshooting |
| 4.3-4 | Trace IDs across services | 4.3-tracing-and-correlation |
| 4.3-5 | AI-assisted observability | 4.3-troubleshooting |
| Intro | "utilizing generative AI APIs"; "AI coding assistants, context engineering, and automated debugging agents" | 4.2-generative-ai-apis, 2.1-ai-assisted-development |

## Notes pages (`pcd/content/notes/<id>.md`)

The `order` frontmatter value is the order of the page inside its objective in this table. "Also" is the frontmatter `also` list. The scope bullets say what each page must cover. Keep to the scope: link to the page that owns a neighbouring topic instead of repeating it.

| ID | Title | Objective | Order | Also | Owner |
|---|---|---|---|---|---|
| 1.1-platform-choice | Choosing a platform: Compute Engine, GKE, and Cloud Run | 1.1 | 1 | 3.1, 3.2 | plat |
| 1.1-resources-and-cost | Sizing resources and controlling cost | 1.1 | 2 | 3.2 | plat |
| 1.1-containers | Building and refactoring containers for Cloud Run and GKE | 1.1 | 3 | 2.2, 3.2 | plat |
| 1.1-regions-and-replication | Regions, zones, latency, and replication for failover | 1.1 | 4 | 1.3 | plat |
| 1.1-load-balancing | Choosing a load balancer and session affinity | 1.1 | 5 | 3.2 | net |
| 1.1-caching | Caching with Memorystore and Cloud CDN | 1.1 | 6 | 4.1 | net |
| 1.1-api-design | Designing and deploying REST and gRPC APIs | 1.1 | 7 | 3.1 | api |
| 1.1-api-management | API management: rate limiting, authentication, and observability with Apigee and API Gateway | 1.1 | 8 | 3.1 | api |
| 1.1-async-events | Asynchronous and event-driven integration with Pub/Sub and Eventarc | 1.1 | 9 | 4.1 | evt |
| 1.1-orchestration | Orchestrating services with Workflows, Cloud Tasks, and Cloud Scheduler | 1.1 | 10 | 3.1 | evt |
| 1.1-traffic-splitting | Traffic splitting: gradual rollouts, rollbacks, and A/B tests | 1.1 | 11 | 3.1, 3.2 | net |
| 1.2-retention-and-org-policy | Data retention and organization policies | 1.2 | 1 | 1.3 | sec |
| 1.2-protect-and-scan | Protecting apps and finding vulnerabilities: IAP, Web Security Scanner, Artifact Analysis, and Security Command Center | 1.2 | 2 | 2.2 | sec |
| 1.2-secrets-and-keys | Secrets, credentials, and keys: Secret Manager, Cloud KMS, and Workload Identity Federation | 1.2 | 3 | 3.1, 3.2 | sec |
| 1.2-authenticating-to-google-cloud | Authenticating code to Google Cloud: ADC, tokens, auth proxies, and Workload Identity Federation | 1.2 | 4 | 4.1, 4.2 | iam |
| 1.2-user-authentication | Authenticating end users: Identity Platform, OAuth 2.0, JWTs, and IAP | 1.2 | 5 | 3.1 | iam |
| 1.2-service-accounts-least-privilege | Service accounts, IAM roles, and least privilege | 1.2 | 6 | 4.2 | iam |
| 1.2-service-to-service | Secure service-to-service communication | 1.2 | 7 | 3.1, 3.2 | sec |
| 1.3-storage-choice | Choosing a storage system by data volume and performance | 1.3 | 1 | 4.1 | data |
| 1.3-relational-schema | Schema design for AlloyDB and Spanner | 1.3 | 2 | | data |
| 1.3-nosql-schema | Schema design for Bigtable and Firestore | 1.3 | 3 | | data |
| 1.3-consistency-and-replication | Consistency and replication: AlloyDB, Bigtable, Cloud SQL, Spanner, and Cloud Storage | 1.3 | 4 | 1.1 | data |
| 1.3-signed-urls | Signed URLs and signed policy documents for Cloud Storage | 1.3 | 5 | 1.2 | dio |
| 1.3-bigquery-writes | Writing data to BigQuery for analytics and AI/ML | 1.3 | 6 | 4.1 | dio |
| 2.1-emulators | Emulating Google Cloud services for local development and unit tests | 2.1 | 1 | 2.3 | dev |
| 2.1-developer-tools | Developer tools: Cloud SDK, Cloud Code, Cloud Shell, Cloud Workstations, and Gemini Cloud Assist | 2.1 | 2 | 4.3 | dev |
| 2.1-ai-assisted-development | AI coding assistants, context, and MCP servers | 2.1 | 3 | 2.3 | dev |
| 2.2-cloud-build-artifact-registry | Building containers with Cloud Build and storing them in Artifact Registry | 2.2 | 1 | 3.1 | cicd |
| 2.2-provenance-binary-authorization | Build provenance and Binary Authorization | 2.2 | 2 | 1.2 | cicd |
| 2.3-unit-tests-with-ai | Writing unit tests with AI coding assistants | 2.3 | 1 | 2.1 | dev |
| 2.3-integration-tests-cloud-build | Automated integration tests in Cloud Build | 2.3 | 2 | 2.2 | cicd |
| 3.1-deploy-from-source | Deploying to Cloud Run from source code | 3.1 | 1 | 2.2 | run |
| 3.1-triggers-and-receivers | Triggering Cloud Run with Eventarc and Pub/Sub, and writing event receivers | 3.1 | 2 | 1.1, 4.1 | evt |
| 3.1-api-versioning-and-exposure | Versioning, exposing, and securing APIs on Cloud Run | 3.1 | 3 | 1.1, 1.2 | api |
| 3.2-gke-deployments | Deploying containerized applications to GKE | 3.2 | 1 | 1.1 | run |
| 3.2-health-checks | Kubernetes health checks: liveness, readiness, and startup probes | 3.2 | 2 | 1.1 | run |
| 3.2-autoscaling | Scaling on GKE: Horizontal Pod Autoscaler attributes and metrics | 3.2 | 3 | 1.1 | run |
| 4.1-datastore-connections | Managing connections to Cloud SQL, Firestore, and Cloud Storage | 4.1 | 1 | 1.2 | dio |
| 4.1-reading-writing-data | Reading and writing data with the client libraries | 4.1 | 2 | | dio |
| 4.1-messaging | Publishing and consuming messages with Pub/Sub | 4.1 | 3 | 1.1 | evt |
| 4.2-calling-google-apis | Calling Google Cloud APIs: enabling services, client libraries, REST, gRPC, and service accounts | 4.2 | 1 | 1.2 | api |
| 4.2-efficient-api-calls | Efficient and resilient API calls: batching, partial responses, pagination, caching, and retries | 4.2 | 2 | | api |
| 4.2-generative-ai-apis | Calling generative AI APIs: Gemini on Agent Platform | 4.2 | 3 | 1.1 | dev |
| 4.3-instrumentation | Instrumenting code with logs, metrics, and traces | 4.3 | 1 | | obs |
| 4.3-tracing-and-correlation | Trace IDs: correlating spans and logs across services | 4.3 | 2 | | obs |
| 4.3-troubleshooting | Finding and fixing issues: Logs Explorer, Error Reporting, and AI-assisted observability | 4.3 | 3 | 2.1 | obs |

### Scope of each page

These bullets are a starting list of topics, not facts. Confirm each topic in the docs before you write it, and drop a topic that the docs do not support.

**1.1-platform-choice** (1.1-1). Decision criteria between Compute Engine, GKE (Autopilot and Standard), and Cloud Run (services, jobs, worker pools, Cloud Run functions). Google's container runtime decision guidance. Stateless HTTP compared with long-running or stateful work. When Kubernetes features, GPUs, OS control, or non-HTTP protocols decide the answer. App Engine as a legacy option only if the docs say so.

**1.1-resources-and-cost** (1.1-10, 1.1-11). Cloud Run CPU and memory limits, concurrency, billing modes (request-based and instance-based), minimum and maximum instances, startup CPU boost. GKE requests and limits, Autopilot resource requests and compute classes. Compute Engine machine families, custom machine types, Spot VMs, committed use discounts, rightsizing recommendations. Labels for cost attribution.

**1.1-containers** (1.1-2). The Cloud Run container runtime contract (listen on `PORT`, stateless, in-memory file system, `SIGTERM` handling). Image best practices (small base images, multi-stage builds, non-root user, one process per container). Dockerfile compared with buildpacks. Refactoring a monolith into services. Configuration through environment variables, logging to stdout, graceful shutdown on GKE. Link to 3.1-deploy-from-source and 3.2-gke-deployments for the deploy commands.

**1.1-regions-and-replication** (1.1-3, 1.1-12). Zonal, regional, multi-regional, and global resources. Where Compute Engine, GKE (zonal and regional clusters), Cloud Run, Cloud Storage, Cloud SQL, Spanner, Firestore, Bigtable, and Memorystore run. Latency: place compute near users and data, serve several regions behind a global load balancer. Zonal failover (automatic, for example Cloud SQL HA and regional MIGs) compared with regional failover (replicas, promotion, multi-region services). Link to 1.3-consistency-and-replication for consistency details.

**1.1-load-balancing** (1.1-4, 1.1-5). Application Load Balancer compared with Network Load Balancer; external and internal; global and regional; proxy and passthrough. Serverless NEGs for Cloud Run. GKE Ingress and Gateway, container-native load balancing. Session affinity options (client IP, generated cookie, header field, HTTP cookie, stateful cookie-based), Cloud Run session affinity, and session affinity on GKE.

**1.1-caching** (1.1-6, 1.1-5). Memorystore products (Valkey, Redis, Redis Cluster, Memcached) and how to choose. Cache-aside and other caching patterns, TTLs, and eviction. Connecting from Cloud Run (Direct VPC egress) and GKE. High availability and persistence. Cloud CDN for cacheable content: cache modes, TTLs, cache keys, invalidation. Why in-memory caches in each instance are not shared. `Cache-Control` headers.

**1.1-api-design** (1.1-7). Google's API design guidance (resource-oriented design, standard methods, errors, naming) from the AIPs. REST compared with gRPC (HTTP/2, Protocol Buffers, streaming). gRPC on Cloud Run (end-to-end HTTP/2) and on GKE. OpenAPI specs. Idempotency and long-running operations. Leave pagination and partial responses to 4.2-efficient-api-calls.

**1.1-api-management** (1.1-8). API Gateway (OpenAPI config, Cloud Run and Cloud Run functions backends, API keys, JWT authentication, quotas and rate limits, Cloud Logging and Cloud Monitoring). Apigee (API proxies, policies such as SpikeArrest, Quota, VerifyAPIKey, OAuthV2, VerifyJWT; API products, developer apps, analytics). Cloud Endpoints only if the docs still recommend it. How to choose between them. Leave versioning and exposure on Cloud Run to 3.1-api-versioning-and-exposure.

**1.1-async-events** (1.1-9). Why asynchronous integration (decoupling, buffering, fan-out). Pub/Sub topics and subscription types (pull, push, BigQuery, Cloud Storage), delivery semantics (at-least-once, exactly-once), ordering keys, retention and replay, dead-letter topics. Eventarc Standard (triggers, direct events and Cloud Audit Logs events) and Eventarc Advanced (bus, pipelines) if GA or Preview. CloudEvents. Idempotent consumers. How to choose Pub/Sub, Eventarc, or Cloud Tasks. Leave client library code to 4.1-messaging and trigger setup to 3.1-triggers-and-receivers.

**1.1-orchestration** (1.1-14). Orchestration compared with choreography. Workflows (steps, connectors, retries, parallel steps, callbacks, Eventarc triggers). Cloud Tasks (explicit invocation, dispatch rate, retries, scheduled tasks, deduplication by task name, HTTP targets with OIDC tokens). Google's guidance on Cloud Tasks compared with Pub/Sub. Cloud Scheduler (cron jobs with HTTP, Pub/Sub, and Workflows targets; authentication; retries).

**1.1-traffic-splitting** (1.1-13). Cloud Run revisions, traffic splits, tags, `--no-traffic`, gradual rollout, and rollback. A/B tests on Cloud Run and GKE. GKE: Gateway API `HTTPRoute` weights and header matches, Deployment rolling update settings (`maxSurge`, `maxUnavailable`), blue/green with Services. Cloud Deploy canary strategies for Cloud Run and GKE. Cloud Service Mesh traffic splitting.

**1.2-retention-and-org-policy** (1.2-1). Object Lifecycle Management (conditions and actions), Object Versioning, soft delete, bucket retention policies and Bucket Lock (permanent), object retention lock, event-based and temporary holds. Organization Policy Service: constraints that affect developers (for example public access prevention, uniform bucket-level access, resource locations, service account key creation, Cloud Run ingress), inheritance, dry run, custom constraints.

**1.2-protect-and-scan** (1.2-2, 1.2-3). IAP for Cloud Run and other backends (who can reach the app, signed headers and JWT verification). Web Security Scanner (managed and custom scans, finding types, safe scanning practice). Artifact Analysis (automatic scanning on push to Artifact Registry, On-Demand Scanning, severity and fix information). Security Command Center findings and remediation. How a developer responds: patch the base image or dependency, rebuild, redeploy, verify.

**1.2-secrets-and-keys** (1.2-4). Secret Manager (secrets and versions, IAM, pinned compared with latest versions, rotation schedules and notifications, regional secrets, replication). Using secrets in Cloud Run (environment variable compared with mounted volume) and GKE. Cloud KMS (key rings, keys, versions, automatic rotation, envelope encryption, CMEK). Workload Identity Federation to remove service account keys. Never put secrets in code, images, or plain environment files.

**1.2-authenticating-to-google-cloud** (1.2-5). Application Default Credentials and its search order. Local development with user credentials or service account impersonation. OAuth 2.0 access tokens compared with ID tokens (OIDC JWTs): which one calls Google APIs and which one calls Cloud Run or IAP. Scopes compared with IAM. Cloud SQL Auth Proxy and the Cloud SQL Language Connectors, AlloyDB Auth Proxy and AlloyDB Language Connectors, IAM database authentication. Workload Identity Federation for external workloads and Workload Identity Federation for GKE.

**1.2-user-authentication** (1.2-5). Identity Platform (providers, MFA, multi-tenancy, blocking functions) and its relation to Firebase Authentication. Verifying ID tokens in a backend. OAuth 2.0 for user authorization (consent screen, scopes, authorization code flow, refresh tokens). JWT validation (signature, issuer, audience, expiry). IAP for workforce users compared with Identity Platform for customers. JWT validation at API Gateway and Apigee (link to 1.1-api-management).

**1.2-service-accounts-least-privilege** (1.2-6, 1.2-8). Service accounts as workload identities. Default service accounts and their broad roles. One dedicated service account per service. Attaching service accounts to Cloud Run, GKE workloads, and VMs. Basic, predefined, and custom roles. Granting on the smallest resource. IAM conditions. `roles/iam.serviceAccountUser` (act as) and `roles/iam.serviceAccountTokenCreator` (impersonate). Role recommendations. Service agents.

**1.2-service-to-service** (1.2-7). Cloud Run service-to-service authentication (ID token for the receiving service, Cloud Run Invoker role, metadata server). Cloud Run internal ingress with Direct VPC egress. Private Google Access, Private Service Connect, and private services access. Cloud Service Mesh (mTLS, authorization policies, service identity). Kubernetes NetworkPolicy on GKE (GKE Dataplane V2). VPC Service Controls in one or two sentences.

**1.3-storage-choice** (1.3-1). A decision table across Cloud Storage, Cloud SQL, AlloyDB, Spanner, Bigtable, Firestore, BigQuery, Memorystore, Filestore, and block storage, by data model, volume, throughput, latency, and consistency. Scale limits from the docs.

**1.3-relational-schema** (1.3-2). Spanner: primary keys that avoid hotspots (no monotonically increasing keys, UUIDv4, bit-reversed sequences), interleaved tables, secondary indexes (`STORING`), foreign keys, commit timestamps, online schema changes. AlloyDB: PostgreSQL schema and index practice, the columnar engine, partitioning. AlloyDB compared with Cloud SQL for PostgreSQL.

**1.3-nosql-schema** (1.3-2). Bigtable: row key design (no leading timestamps, field promotion, salting, reversed domains), tall compared with wide tables, column families, garbage collection, single-row transactions. Firestore: documents, collections, subcollections, document size limit, indexes (single-field, composite, exemptions), hotspots from sequential IDs and values, Native mode compared with Datastore mode.

**1.3-consistency-and-replication** (1.3-3, 1.1-12). Spanner strong reads and stale reads. Cloud SQL HA (synchronous) and read replicas (asynchronous, replication lag). AlloyDB HA, read pool instances, and cross-region secondary clusters. Bigtable replication (eventual consistency) and app profiles (single-cluster routing for read-your-writes, multi-cluster routing for availability). Cloud Storage strong consistency and the cached-object exception. Firestore consistency.

**1.3-signed-urls** (1.3-4). When to use signed URLs. V4 signing and the maximum expiration. Signing without a key file (IAM `signBlob` through the client library or `gcloud storage sign-url` with impersonation). Signed upload URLs and resumable uploads. Signed policy documents for HTML form uploads. CORS for browser uploads. Alternatives (IAM, public access, Cloud CDN signed URLs and cookies). How to revoke access.

**1.3-bigquery-writes** (1.3-5). Batch load jobs, the Storage Write API (default stream, committed and pending streams, exactly-once with offsets), legacy streaming inserts, Pub/Sub BigQuery subscriptions, Dataflow. Choosing by latency, cost, and delivery semantics. DML limits for frequent small writes. Partitioned and clustered tables. Using stored data for AI/ML (BigQuery ML and AI functions), as far as the docs support.

**2.1-emulators** (2.1-1). `gcloud emulators` for Pub/Sub, Firestore, Datastore, Bigtable, and Spanner: start commands, environment variables (`env-init`), what an emulator does not emulate. The Firebase Local Emulator Suite where the docs point to it. Running Cloud Run containers and functions locally (Functions Framework, Cloud Code). Unit tests against emulators compared with integration tests.

**2.1-developer-tools** (2.1-2, 2.1-3). gcloud CLI (configurations, `gcloud auth login` compared with `gcloud auth application-default login`, impersonation, output formats), the other Cloud SDK tools. Cloud Shell (persistent home, editor, limits). Cloud Code for VS Code and JetBrains (Cloud Run and Kubernetes development, Skaffold, Secret Manager, API libraries). Cloud Workstations (configurations, custom images, private networking, idle timeouts). Gemini Cloud Assist in the console. The Google Cloud console features that developers use.

**2.1-ai-assisted-development** (2.1-3, intro). Gemini Code Assist editions and IDE extensions: code completion, chat, smart actions, agent mode. Context: open files, context files, exclusion files, code customization. MCP servers: what the Model Context Protocol does, how Gemini Code Assist and Gemini CLI use MCP servers, Google Cloud MCP servers if documented. Context engineering and automated debugging agents as far as Google docs describe them. Data governance and responsible use of generated code.

**2.2-cloud-build-artifact-registry** (2.2-1). Cloud Build config (`cloudbuild.yaml` steps, builders, substitutions, `images`, timeouts, machine types), builds from source with buildpacks, triggers (repository connections, pull requests, Pub/Sub, webhooks, manual), private pools, the build service account, build caching. Artifact Registry (formats, standard, remote, and virtual repositories, locations, cleanup policies, IAM roles, Docker authentication). Container Registry shutdown. Deploying by image digest.

**2.2-provenance-binary-authorization** (2.2-2, 1.2-9). SLSA and Cloud Build provenance (how to request it, where it is stored, how to view it). Binary Authorization: policies, rules, attestors, attestations, the `built-by-cloud-build` attestor, enforcement on GKE and Cloud Run, dry run, breakglass, continuous validation and check-based platform policies.

**2.3-unit-tests-with-ai** (2.3-1). Generating unit tests with Gemini Code Assist (smart actions, chat, agent mode). Reviewing generated tests: assertions, edge cases, mocks for Google Cloud clients, emulators. Context files that set test conventions. Gemini Code Assist code review on GitHub if documented. Running tests locally and in Cloud Build.

**2.3-integration-tests-cloud-build** (2.3-2). Test steps in `cloudbuild.yaml`: unit tests, then integration tests against dependencies run as containers in the build (emulators, databases), `waitFor`, the `cloudbuild` network. Deploying a tagged Cloud Run revision with no traffic and testing its URL. Failing the build on a test failure. Test reports to Cloud Storage. Pull request triggers. Secrets in builds. Cloud Deploy verification if documented.

**3.1-deploy-from-source** (3.1-1, 1.1-2). `gcloud run deploy --source` (Dockerfile or buildpacks, Cloud Build, the Artifact Registry repository it creates). Deploying functions from source. Automatic base image updates. Service YAML and `gcloud run services replace`. Environment variables, secrets, and the service identity at deploy time. Authentication at deploy time (`--no-allow-unauthenticated`). Continuous deployment from a Git repository. Deploying jobs and worker pools from source if documented.

**3.1-triggers-and-receivers** (3.1-2, 3.1-3). Eventarc triggers for Cloud Run (event filters, path, location rules, the trigger service account and its roles). Pub/Sub push subscriptions to Cloud Run (OIDC token, audience, acknowledgement by HTTP status code, retry and backoff, dead-letter topics). Cloud Storage notifications. Event receiver code: CloudEvents parsing, the Functions Framework, fast acknowledgement, idempotency, duplicate handling, timeouts compared with acknowledgement deadlines. Securing receivers (no unauthenticated access, internal ingress).

**3.1-api-versioning-and-exposure** (3.1-4). API versioning (major version in the path, backward-compatible changes) from the AIPs. Apigee proxy revisions, environments, base paths for versions, API products. Exposing Cloud Run: ingress settings, a global external Application Load Balancer for custom domains, IAP, API Gateway or Apigee in front. Securing: IAM invoker, API keys compared with OAuth 2.0 and JWTs. Revision tags to test a new API version.

**3.2-gke-deployments** (3.2-1, 1.1-2). Deployments (replicas, rolling updates, rollout history and undo), Services (ClusterIP, LoadBalancer), Ingress and the Gateway API on GKE, ConfigMaps and Secrets (Secret Manager add-on), Workload Identity Federation for GKE, pulling images from Artifact Registry, resource requests on Autopilot, namespaces. Cloud Deploy for GKE delivery.

**3.2-health-checks** (3.2-2). Liveness, readiness, and startup probes: what each one does and when it runs. Probe types (HTTP, TCP, exec, gRPC) and settings (`initialDelaySeconds`, `periodSeconds`, `timeoutSeconds`, `failureThreshold`). Common mistakes (a liveness probe that checks a dependency). Load balancer health checks for GKE Ingress and Gateway and how they relate to readiness probes. Graceful shutdown (`preStop`, `terminationGracePeriodSeconds`). PodDisruptionBudgets. Cloud Run startup and liveness probes for comparison.

**3.2-autoscaling** (3.2-3). HorizontalPodAutoscaler: resource metrics (CPU and memory utilization against requests), custom and external metrics (for example Pub/Sub backlog through Cloud Monitoring or Managed Service for Prometheus), `minReplicas`, `maxReplicas`, `behavior` (scale-up and scale-down policies, stabilization window), the scaling formula. HPA needs resource requests. HPA with VPA, multidimensional Pod autoscaling, cluster autoscaler and Autopilot capacity.

**4.1-datastore-connections** (4.1-1). Cloud SQL connection options: Language Connectors, Auth Proxy, private IP over Direct VPC egress, Unix socket from Cloud Run, public IP with authorized networks (not recommended). Connection pooling and sizing against `max_connections` and Cloud Run maximum instances. IAM database authentication. Firestore and Cloud Storage clients: create one client and reuse it, global initialization in Cloud Run and functions, built-in retries.

**4.1-reading-writing-data** (4.1-2). Cloud Storage uploads (single-request, resumable, XML multipart, parallel composite), generation preconditions, streaming and range reads. Firestore reads, queries and indexes, real-time listeners, transactions, batched writes. Spanner read-write and read-only transactions, mutations compared with DML, partitioned DML. Bigtable reads (row ranges, filters) and bulk mutations. BigQuery query results and the Storage Read API.

**4.1-messaging** (4.1-3). Publishing with the client library (batching settings, flow control, ordering keys, retry settings, attributes). Subscribing (streaming pull, flow control, acknowledgement deadlines and lease extension, nack, exactly-once delivery, filters), push compared with pull. Dead-letter topics and retry policies. Seek, snapshots, and replay. Schemas. Message size limit.

**4.2-calling-google-apis** (4.2-1, 4.2-2, 4.2-3). Enabling services (`gcloud services enable`, Service Usage, the `SERVICE_DISABLED` error). Cloud Client Libraries compared with Google API Client Libraries, REST with an access token, gRPC, API Explorer. Authentication in client libraries (ADC). Service accounts for API calls: attached service account, impersonation, quota project. Regional endpoints if documented.

**4.2-efficient-api-calls** (4.2-2). Batching (batch HTTP requests where an API supports them, client library batching). Restricting returned data (partial responses with the `fields` parameter, field masks). Pagination (`pageSize`, `pageToken`, client library pagers). Caching (ETags, conditional requests, local caching of responses). Error handling: retryable errors, truncated exponential backoff with jitter, client library retry settings, idempotency, quota errors.

**4.2-generative-ai-apis** (intro, 4.2-2). Calling Gemini models on Gemini Enterprise Agent Platform (formerly Vertex AI) with the Google Gen AI SDK: ADC authentication compared with API keys, locations and the global endpoint, streaming, system instructions, structured output, function calling, grounding, safety settings, token counting, context caching, batch prediction, embeddings. Quotas and `429` handling (backoff, Provisioned Throughput) as far as the docs describe them. Use the current product names from the docs.

**4.3-instrumentation** (4.3-1). Google Cloud Observability components. OpenTelemetry as the recommended instrumentation (SDKs, the OTLP endpoint or Telemetry API, collectors). Cloud Logging: structured JSON logs to stdout on Cloud Run and GKE, special fields (`severity`, `message`, `logging.googleapis.com/trace`, labels), client libraries, log-based metrics. Cloud Monitoring custom metrics, label cardinality, Managed Service for Prometheus, uptime checks, alerting, SLOs. Cloud Trace and Cloud Profiler.

**4.3-tracing-and-correlation** (4.3-4). Trace context propagation (W3C `traceparent`, the legacy `X-Cloud-Trace-Context` header). How Cloud Run and load balancers start traces and sample them. Propagation across HTTP, gRPC, and Pub/Sub. Writing the trace ID and span ID into log entries so that logs group by trace. Trace Explorer and finding the logs of a trace.

**4.3-troubleshooting** (4.3-2, 4.3-3, 4.3-5). Logs Explorer and the Logging query language, Log Analytics, Metrics Explorer, dashboards, alerts. Common Cloud Run and GKE failures and how to find their cause (container fails to start, port, permissions, `429` and `503`, memory limit exceeded, cold starts, `CrashLoopBackOff`, `ImagePullBackOff`). Error Reporting (how errors get there, grouping, resolution status, notifications). Cloud Profiler for performance. Gemini Cloud Assist investigations and other AI-assisted observability features.

## Labs (`pcd/labs/<id>/`)

Every lab runs from the repository root, starts with `source pcd/labs/env.sh`, and uses the dedicated PCD lab project (`pcd-lab-`).

| ID | Title | Objectives | Owner |
|---|---|---|---|
| 00-setup | Set up the PCD lab project, billing, budget, and gcloud configuration | 4.2 | lead |
| 10-cloud-run-source-deploy | Deploy from source to Cloud Run: revisions, tags, traffic splitting, and rollback | 3.1, 1.1 | L1 |
| 11-api-gateway | API keys and rate limits with API Gateway in front of Cloud Run | 1.1, 3.1 | L1 |
| 12-google-api-calls | Call Google Cloud APIs: client libraries, REST, partial responses, pagination, and retries | 4.2 | L1 |
| 13-gemini-api | Call Gemini on Agent Platform: streaming, structured output, and retries | 4.2 | L1 |
| 20-eventarc-storage-events | Event-driven Cloud Run with Eventarc and Cloud Storage events | 3.1, 1.1 | L2 |
| 21-pubsub-push-pull | Pub/Sub push to Cloud Run with OIDC, and pull with a dead-letter topic | 4.1, 3.1 | L2 |
| 22-workflows-tasks-scheduler | Orchestrate services with Workflows, Cloud Tasks, and Cloud Scheduler | 1.1 | L2 |
| 30-secrets-and-kms | Secret Manager in Cloud Run, rotation, and envelope encryption with Cloud KMS | 1.2 | L3 |
| 31-service-identity | Per-service identities, least privilege, and service-to-service authentication | 1.2 | L3 |
| 32-storage-retention-signed-urls | Cloud Storage lifecycle, retention, and signed URLs without keys | 1.2, 1.3 | L3 |
| 40-cloud-sql-connector | Connect Cloud Run to Cloud SQL with a language connector and IAM database authentication | 4.1, 1.2 | L4 |
| 41-firestore-bigquery | Firestore transactions and BigQuery Storage Write API from code | 4.1, 1.3 | L4 |
| 42-emulators | Local development and unit tests with the gcloud emulators | 2.1, 2.3 | L4 |
| 43-ide-ai-tooling | Set up Cloud Code, Gemini Code Assist, and an MCP server in your IDE | 2.1, 2.3 | L4 |
| 50-cloud-build-artifact-registry | Build with Cloud Build, store in Artifact Registry, and scan for vulnerabilities | 2.2, 1.2 | L5 |
| 51-provenance-binary-authorization | Build provenance and Binary Authorization for Cloud Run | 2.2, 1.2 | L5 |
| 52-cloud-build-tests | Unit and integration tests in a Cloud Build pipeline | 2.3 | L5 |
| 60-gke-probes-hpa | Deploy to GKE Autopilot with probes and a Horizontal Pod Autoscaler | 3.2 | L6 |
| 61-gke-gateway-canary | Canary traffic splitting on GKE with the Gateway API | 1.1, 3.2 | L6 |
| 62-memorystore-cache | Cache-aside with Memorystore from Cloud Run over Direct VPC egress | 1.1, 1.2 | L6 |
| 70-observability | Instrument a Cloud Run service: structured logs, traces, metrics, and Error Reporting | 4.3 | L7 |

A notes page lists its labs in the `labs` frontmatter, and its `## Hands-on` section links them. Use this table:

| Notes page | Labs |
|---|---|
| 1.1-platform-choice | 10-cloud-run-source-deploy, 60-gke-probes-hpa |
| 1.1-resources-and-cost | 10-cloud-run-source-deploy |
| 1.1-containers | 10-cloud-run-source-deploy, 50-cloud-build-artifact-registry |
| 1.1-load-balancing | 61-gke-gateway-canary |
| 1.1-caching | 62-memorystore-cache |
| 1.1-api-design, 1.1-api-management | 11-api-gateway |
| 1.1-async-events | 20-eventarc-storage-events, 21-pubsub-push-pull |
| 1.1-orchestration | 22-workflows-tasks-scheduler |
| 1.1-traffic-splitting | 10-cloud-run-source-deploy, 61-gke-gateway-canary |
| 1.2-retention-and-org-policy | 32-storage-retention-signed-urls |
| 1.2-protect-and-scan | 50-cloud-build-artifact-registry |
| 1.2-secrets-and-keys | 30-secrets-and-kms |
| 1.2-authenticating-to-google-cloud | 31-service-identity, 40-cloud-sql-connector |
| 1.2-service-accounts-least-privilege | 31-service-identity |
| 1.2-service-to-service | 31-service-identity, 62-memorystore-cache |
| 1.3-nosql-schema | 41-firestore-bigquery |
| 1.3-signed-urls | 32-storage-retention-signed-urls |
| 1.3-bigquery-writes | 41-firestore-bigquery |
| 2.1-emulators | 42-emulators |
| 2.1-developer-tools, 2.1-ai-assisted-development | 43-ide-ai-tooling |
| 2.3-unit-tests-with-ai | 43-ide-ai-tooling, 42-emulators |
| 2.2-cloud-build-artifact-registry | 50-cloud-build-artifact-registry |
| 2.2-provenance-binary-authorization | 51-provenance-binary-authorization |
| 2.3-integration-tests-cloud-build | 52-cloud-build-tests |
| 3.1-deploy-from-source | 10-cloud-run-source-deploy |
| 3.1-triggers-and-receivers | 20-eventarc-storage-events, 21-pubsub-push-pull |
| 3.1-api-versioning-and-exposure | 11-api-gateway, 10-cloud-run-source-deploy |
| 3.2-gke-deployments, 3.2-health-checks, 3.2-autoscaling | 60-gke-probes-hpa |
| 4.1-datastore-connections | 40-cloud-sql-connector |
| 4.1-reading-writing-data | 41-firestore-bigquery |
| 4.1-messaging | 21-pubsub-push-pull |
| 4.2-calling-google-apis, 4.2-efficient-api-calls | 12-google-api-calls |
| 4.2-generative-ai-apis | 13-gemini-api |
| 4.3-instrumentation, 4.3-tracing-and-correlation, 4.3-troubleshooting | 70-observability |

Pages that are not in this table have no lab (`labs: []`).

## Question files (`pcd/content/questions/<file>`)

| File | ID prefix | Owner | Targets by objective |
|---|---|---|---|
| plat.json | `plat-` | plat | 1.1: 14 |
| net.json | `net-` | net | 1.1: 12 |
| api.json | `api-` | api | 1.1: 8, 3.1: 8, 4.2: 16 |
| evt.json | `evt-` | evt | 1.1: 12, 3.1: 16, 4.1: 10 |
| sec.json | `sec-` | sec | 1.2: 20 |
| iam.json | `iam-` | iam | 1.2: 16 |
| data.json | `data-` | data | 1.3: 16 |
| dio.json | `dio-` | dio | 1.3: 6, 4.1: 18 |
| dev.json | `dev-` | dev | 2.1: 24, 2.3: 8, 4.2: 6 |
| cicd.json | `cicd-` | cicd | 2.2: 24, 2.3: 10 |
| run.json | `run-` | run | 3.1: 14, 3.2: 32 |
| obs.json | `obs-` | obs | 4.3: 24 |

That is about 314 questions: section 1 about 104, section 2 about 66, section 3 about 70, section 4 about 74. Targets are goals, not quotas. Never add a weak question to reach a number. A delivered count of 80% or more of the target is fine. A question's objective is the objective of the exam guide consideration that it tests, which can differ from the objective of the notes page.

## Flashcard files (`pcd/content/flashcards/<file>`)

One file per owner: `plat.json`, `net.json`, `api.json`, `evt.json`, `sec.json`, `iam.json`, `data.json`, `dio.json`, `dev.json`, `cicd.json`, `run.json`, `obs.json`. Card IDs: `<owner>-f001`, … About 8 to 12 cards for each notes page of the owner.

## Glossary, services, and reference pages

| File | Contents | Owner |
|---|---|---|
| `pcd/content/glossary.json` | Acronyms and key terms (SPEC section 8) | gloss |
| `pcd/content/services.json` | Service profiles and categories (SPEC section 9) | svc |
| `pcd/content/reference/name-changes.md` | Product renames that matter for this guide | lead |
