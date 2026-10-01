# Numbers to know

The Professional Cloud Architect exam tests fewer raw numbers than the Professional Cloud Developer exam. A PCA question puts numbers in the scenario as constraints: an availability target, an RTO and RPO, a retention period, a data size and a bandwidth, a job duration. You must know the threshold that rules out an option. For example, "the job runs 3 hours" rules out a Cloud Run service, and "keep audit logs for 7 years" rules out the `_Required` bucket alone.

This page collects those thresholds in one place. Each number comes from a notes page, which cites the Google Cloud documentation. Limits change, so the notes pages and their sources win if this page disagrees with them.

Checked on 2026-09-28 against the notes pages.

**How to use this page.** Learn the **Decides answers** rows first. They eliminate options in scenario questions. The other rows help you check a design, but the exam rarely asks for them directly. Do not memorize prices or quotas: the notes and questions in this guide do not test them.

## Availability and SLAs

The composite rules decide more answers than any single SLA. Tiers in series multiply, and a location caps the result ([HA, scalability, and performance](note:1.2-ha-scalability-performance)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| 99.9% one zone, 99.99% multiple zones, 99.999% multiple regions | The platform availability target by location. Redundancy inside one zone stays capped at 99.9%. These are targets, not product SLAs. | Yes | [Building blocks of reliability](https://docs.cloud.google.com/architecture/infra-reliability-guide/building-blocks) |
| Three tiers at 99.9% ≈ 99.7%; four tiers ≈ 99.6% | Tiers in series multiply. The stack is lower than its weakest tier. | Yes | [Building blocks of reliability](https://docs.cloud.google.com/architecture/infra-reliability-guide/building-blocks) |
| 99.99% ≈ 52 minutes a year; 99.9% ≈ 8.75 hours a year | If an hour of regional downtime a year is not acceptable, you need a multi-region DR plan. | Yes | [Architecting disaster recovery for cloud infrastructure outages](https://docs.cloud.google.com/architecture/disaster-recovery) |
| Cloud SQL: Enterprise Plus 99.99% (includes maintenance); Enterprise 99.95% (excludes maintenance) | A 99.99% database target on Cloud SQL needs Enterprise Plus. | Yes | [Cloud SQL editions overview](https://docs.cloud.google.com/sql/docs/postgres/editions-intro) |
| Spanner: regional 99.99%; dual-region and multi-region 99.999% (Enterprise Plus) | 99.999% points to multi-region Spanner. | Yes | [Regional, dual-region, and multi-region configurations](https://docs.cloud.google.com/spanner/docs/instance-configurations) |
| Bigtable: 99.999% with multi-cluster routing across 3 or more regions; 99.99% for fewer regions; 99.9% with single-cluster routing | Single-cluster routing gives the lowest Bigtable SLA. | No | [Cloud Bigtable Service Level Agreement](https://cloud.google.com/bigtable/sla) |
| GKE control plane: 99.95% Autopilot and regional Standard; 99.5% zonal Standard | Production clusters are regional. | Yes | [GKE pricing](https://cloud.google.com/kubernetes-engine/pricing) |
| Network Service Tiers: Premium 99.99%; Standard 99.9% | Global load balancing and Cloud CDN need Premium Tier. | No | [Network Service Tiers overview](https://docs.cloud.google.com/network-tiers/docs/overview) |
| HA VPN: 99.99% only with a tunnel on both interfaces. Classic VPN: 99.9% | One HA VPN tunnel has no 99.99%. An AWS peer gateway needs four tunnels for 99.99%. | Yes | [HA VPN topologies](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies), [Cloud VPN overview](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/overview) |
| Dedicated Interconnect: 99.9% = 2 connections in 1 metro; 99.99% = 4 connections in 2 metros, 2 regions, global dynamic routing | Two connections never give 99.99%. | Yes | [Establish 99.99% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-9999-availability), [Establish 99.9% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-999-availability) |
| Partner Interconnect 99.99% needs 2 regions | This applies even when all VMs are in one region. | Yes | [Establish 99.99% availability for Partner Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/partner-creating-9999-availability) |

## Compute and serverless

Run time limits decide most compute questions. Match the job duration to the product ([Compute choice](note:1.3-compute-choice), [Serverless](note:2.3-serverless)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| Cloud Run service request: default 5 minutes, maximum 60 minutes | Work longer than 60 minutes does not fit a service. Use a job. | Yes | [Configure request timeout for services](https://docs.cloud.google.com/run/docs/configuring/request-timeout) |
| Cloud Run job task: default 10 minutes, maximum 168 hours (7 days); 1 hour with GPUs | Batch work of up to 7 days fits a Cloud Run job. | Yes | [Set task timeout for jobs](https://docs.cloud.google.com/run/docs/configuring/task-timeout) |
| Cloud Run functions: HTTP functions up to 60 minutes; 1st gen up to 9 minutes | A 9-minute limit means the older generation. | Yes | [Compare Cloud Run functions](https://docs.cloud.google.com/run/docs/functions/comparison) |
| Cloud Run functions: up to 1,000 concurrent requests per instance; 1st gen 1 request per instance | Current functions handle concurrency like Cloud Run services. | No | [Compare Cloud Run functions](https://docs.cloud.google.com/run/docs/functions/comparison) |
| Cloud Run service: no more than 8 CPU and 32 GiB per instance | A larger instance shape rules out a Cloud Run service. | Yes | [Is my app a good fit for a Cloud Run service?](https://docs.cloud.google.com/run/docs/fit-for-run) |
| Cloud Run concurrency: default 80 × vCPU (gcloud, Terraform) or 80 (console); maximum 1,000 | Set `1` only when the code cannot process parallel requests. | No | [Maximum concurrent requests for services](https://docs.cloud.google.com/run/docs/about-concurrency) |
| Cloud Run maximum instances: default 100 per revision | Maximum instances cap cost and database connections. | No | [Set maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances) |
| Spot VMs: up to 91% off, no minimum or maximum runtime, no SLA | Spot fits work that tolerates interruption. | Yes | [Spot VMs](https://docs.cloud.google.com/compute/docs/instances/spot) |
| Preemptible VMs: always stop after 24 hours | The older model. Google recommends Spot VMs. | Yes | [Preemptible VM instances](https://docs.cloud.google.com/compute/docs/instances/preemptible) |
| Spot shutdown: default preemption notice 0 seconds; shutdown script best effort, up to 30 seconds | Do not plan on a long, clean shutdown. | No | [Spot VMs](https://docs.cloud.google.com/compute/docs/instances/spot) |
| Custom machine types: 5% more than predefined types | Pick predefined types when one fits. | No | [Create a VM with a custom machine type](https://docs.cloud.google.com/compute/docs/instances/creating-instance-with-custom-machine-type) |
| Flex-start: 10 minutes to 7 days. Calendar-mode future reservation: 1 to 90 days, GPU start at least 87 hours ahead | A fixed start date points to calendar mode. A job that can wait points to Flex-start. | Yes | [About future reservation requests in calendar mode](https://docs.cloud.google.com/compute/docs/instances/future-reservations-calendar-mode-overview) |
| Regional MIG in 3 zones: at least 150% of needed VMs; 2 zones: 200% | The spare capacity to survive the loss of a zone. The same rule applies to GKE autoscaling limits. | Yes | [About regional MIGs](https://docs.cloud.google.com/compute/docs/instance-groups/regional-migs) |
| Autoscaler: initialization period default 60 seconds; stabilization period 10 minutes. Predictive autoscaling for startup over 2 minutes | Slow startup with daily or weekly cycles points to predictive autoscaling. | No | [HA, scalability, and performance](note:1.2-ha-scalability-performance) |
| GKE release channels: Extended keeps a minor version up to 24 months. "No upgrades" exclusion: 90 days at most | To hold a minor version longer than 90 days, use "No minor upgrades". | Yes | [About release channels](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/release-channels), [Maintenance windows and exclusions](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/maintenance-windows-and-exclusions) |
| Cloud Shell: 50 hours a week, 12 hours a session, 40 minutes non-interactive, 5 GB `$HOME` | Cloud Shell is not for scheduled or unattended jobs. | Yes | [Cloud Shell quotas and limits](https://docs.cloud.google.com/shell/docs/quotas-limits) |

## Storage

Minimum storage durations and replication targets decide storage class and location questions ([Configuring Cloud Storage](note:2.2-cloud-storage-config), [Storage choice](note:1.3-storage-choice)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| Minimum storage duration: Nearline 30 days, Coldline 90 days, Archive 365 days | Match the class to how long you keep the data and how often you read it. | Yes | [Storage classes](https://docs.cloud.google.com/storage/docs/storage-classes) |
| Turbo replication: RPO of 15 minutes, dual-region only | A 15-minute RPO for objects needs turbo replication on a dual-region bucket. | Yes | [Data availability and durability](https://docs.cloud.google.com/storage/docs/availability-durability) |
| Default replication: 99.9% of new objects within 1 hour, 100% within 12 hours | Default replication does not meet a 15-minute RPO. | Yes | [Data availability and durability](https://docs.cloud.google.com/storage/docs/availability-durability) |
| Soft delete: on by default, 7 days; 7 to 90 days, or 0 to disable | The recommended protection against accidental or malicious deletion. | Yes | [Soft delete overview](https://docs.cloud.google.com/storage/docs/soft-delete) |
| Bucket Lock: retention up to 100 years | Long regulatory retention of files uses a locked retention policy. | Yes | [Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock) |
| Signed URLs: longest expiration 7 days | Longer access needs another method. | No | [Signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signed-urls) |
| Request rate: about 1,000 writes or 5,000 reads per second without ramp-up; above that, at most double every 20 minutes | Sudden high load on a new bucket needs a gradual ramp-up. | No | [Request rate and access distribution guidelines](https://docs.cloud.google.com/storage/docs/request-rate) |
| Hyperdisk Storage Pools: recommended for 20 TiB or more in one project and zone | Pools suit large, shared block storage capacity. | No | [Storage choice](note:1.3-storage-choice) |

## Databases and analytics

Scale limits choose the database. Backup and PITR windows decide recovery questions ([Database configuration](note:2.2-database-config), [Data protection](note:2.2-data-protection)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| Cloud SQL: up to 64 TB of storage | Larger relational data points to Spanner or AlloyDB. | Yes | [About instance settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings) |
| Cloud SQL HA failover: about 60 seconds unavailable; RPO zero for a zone outage | HA protects against a zone outage, not a region outage. | Yes | [Database configuration](note:2.2-database-config) |
| Cloud SQL PITR log retention: up to 35 days (Enterprise Plus) or 7 days (Enterprise) | A recovery point older than 7 days needs Enterprise Plus. | Yes | [Cloud SQL editions overview](https://docs.cloud.google.com/sql/docs/postgres/editions-intro) |
| Cloud SQL planned maintenance: less than 1 second (Enterprise Plus); less than 30 seconds on average (Enterprise) | Near-zero maintenance downtime points to Enterprise Plus. | No | [Cloud SQL editions overview](https://docs.cloud.google.com/sql/docs/postgres/editions-intro) |
| Cloud SQL automated backups: 1 to 365 days, or up to 10 years with enhanced backups | Long backup retention on Cloud SQL uses enhanced backups. | No | [Choose your backup option](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backup-options) |
| AlloyDB HA: detection up to 30 seconds, then typically less than 30 seconds to start the standby; RPO zero | AlloyDB HA loses no data on failover. | No | [AlloyDB high availability overview](https://docs.cloud.google.com/alloydb/docs/high-availability) |
| Spanner: 10 TiB of data per node | Spanner can reject writes when data outgrows its capacity. | No | [Compute capacity, nodes and processing units](https://docs.cloud.google.com/spanner/docs/compute-capacity) |
| Spanner high-priority CPU: below 65% regional; below 45% per region for dual-region and multi-region | The headroom to lose a zone or a region. | No | [CPU utilization metrics](https://docs.cloud.google.com/spanner/docs/cpu-utilization) |
| Spanner PITR: 1 hour by default, up to 7 days | PITR does not cover a deleted database. | No | [Data protection](note:2.2-data-protection) |
| Bigtable: each value typically no larger than 10 MB | Bigtable is for large, single-keyed data with high throughput. | No | [Storage choice](note:1.3-storage-choice) |
| BigQuery time travel: 2 to 7 days (default 7). Fail-safe: 7 more days, through Cloud Customer Care only | Self-service recovery ends with time travel. | Yes | [Data retention with time travel and fail-safe](https://docs.cloud.google.com/bigquery/docs/time-travel) |
| BigQuery long-term storage: after 90 days without changes, about 50% lower price | The move to long-term storage is automatic. | No | [BigQuery pricing](https://cloud.google.com/bigquery/pricing) |
| BigQuery managed disaster recovery: RPO target 15 minutes, RTO 5 minutes after failover starts (Enterprise Plus) | Cross-region replication alone is not a DR plan. | Yes | [Managed disaster recovery](https://docs.cloud.google.com/bigquery/docs/managed-disaster-recovery) |
| Pub/Sub: unacknowledged messages kept 7 days by default (10 minutes to 31 days); topic retention up to 31 days; snapshot at most 7 days | Replay beyond 7 days needs topic retention. | Yes | [Subscription properties](https://docs.cloud.google.com/pubsub/docs/subscription-properties) |

## Networking

The bandwidth of each connection type decides hybrid questions. The fixed IP ranges decide firewall questions ([Hybrid and multicloud](note:2.1-hybrid-multicloud), [VPC access patterns](note:2.1-vpc-access-patterns)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| HA VPN: 250,000 packets per second (1 to 3 Gbps) per tunnel | For more, add tunnels or use Cloud Interconnect. | Yes | [Hybrid and multicloud](note:2.1-hybrid-multicloud) |
| Dedicated Interconnect: 10, 100, or 400 Gbps circuits | You need a colocation presence and at least a full 10-Gbps connection. | Yes | [Quotas and limits](https://docs.cloud.google.com/network-connectivity/docs/interconnect/quotas) |
| Partner Interconnect: from 50 Mbps per VLAN attachment | Less than 10 Gbps, or no colocation presence, points to Partner Interconnect. | Yes | [Hybrid and multicloud](note:2.1-hybrid-multicloud) |
| HA VPN over Cloud Interconnect: up to 50 Gbps per encrypted attachment | IPsec over a private link. | No | [Hybrid and multicloud](note:2.1-hybrid-multicloud) |
| IAP TCP forwarding source range: `35.235.240.0/20` | Allow SSH and RDP from this range only, never from `0.0.0.0/0`. | Yes | [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding) |
| Health check and GFE ranges: `130.211.0.0/22` and `35.191.0.0/16` | Without these rules, healthy backends show as unhealthy. | Yes | [Set up an application-based health check and autohealing](https://docs.cloud.google.com/compute/docs/instance-groups/autohealing-instances-in-migs) |
| `private.googleapis.com` = `199.36.153.8/30`; `restricted.googleapis.com` = `199.36.153.4/30` | Use `restricted` with VPC Service Controls. | Yes | [Configure Private Google Access](https://docs.cloud.google.com/vpc/docs/configure-private-google-access) |
| Cloud DNS forwarding source range: `35.199.192.0/19` | Advertise it to on-premises so DNS replies return. | Yes | [Hybrid and multicloud](note:2.1-hybrid-multicloud) |
| Auto mode VPC networks: all use `10.128.0.0/9` | Auto mode networks cannot connect to each other. Use custom mode in production. | Yes | [VPC networks](https://docs.cloud.google.com/vpc/docs/vpc) |
| Extra GKE Pod space: `100.64.0.0/10` | Google recommends it over Class E (`240.0.0.0/4`). | No | [Network design](note:1.3-network-design) |

## Data transfer and migration

Data size and bandwidth decide the transfer tool ([Integration and data movement](note:1.1-integration-and-data-movement), [Migration tooling](note:5.1-migration-tooling)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| 1 TB | Below it from on-premises, use `gcloud storage`. Above it, use Storage Transfer Service or Transfer Appliance. | Yes | [Data transfer options](https://docs.cloud.google.com/storage-transfer/docs/transfer-options) |
| 1 GB at 1 Gbps ≈ 8 seconds; 100 TB at 1 Gbps ≈ 12 days; 100 TB at 100 Mbps > 100 days | If the online transfer misses the deadline, use Transfer Appliance. | Yes | [Transfer your large datasets](https://docs.cloud.google.com/architecture/migration-to-google-cloud-transferring-your-large-datasets) |
| Transfer Appliance: capture in under 25 days, then data in Cloud Storage in about 10 more business days (300 TB example) | Offline transfer still takes weeks. | No | [Transfer your large datasets](https://docs.cloud.google.com/architecture/migration-to-google-cloud-transferring-your-large-datasets) |
| Test transfer performance on 3–5% of the data first | The first step before a large transfer. | No | [Transfer your large datasets](https://docs.cloud.google.com/architecture/migration-to-google-cloud-transferring-your-large-datasets) |

## Security, logging, and compliance

Retention periods decide most logging and compliance questions ([Security controls](note:3.1-security-controls), [Observability](note:6.2-observability), [Compliance](note:3.2-compliance)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| `_Required` bucket: 400 days, cannot change | Admin Activity and System Event audit logs. For longer retention, route logs to another bucket. | Yes | [Logging quotas and limits](https://docs.cloud.google.com/logging/quotas) |
| `_Default` bucket: 30 days by default; project buckets 1 to 3,650 days | Up to 10 years: a locked log bucket. More than 10 years: a sink to a locked Cloud Storage bucket. | Yes | [Logging quotas and limits](https://docs.cloud.google.com/logging/quotas) |
| Data Access audit logs: off by default (except some BigQuery services) | You must turn them on to record data reads. | Yes | [Security controls](note:3.1-security-controls) |
| Cloud KMS scheduled destruction: 30 days by default; 24 hours to 120 days, set at key creation | You can restore a key version before the period ends. | Yes | [Delete Cloud KMS resources](https://docs.cloud.google.com/kms/docs/delete-kms-resources), [Create a key](https://docs.cloud.google.com/kms/docs/create-key) |
| Cloud Asset Inventory: up to 35 days of change history | Asset metadata can also be exported. | No | [Cloud Asset Inventory overview](https://docs.cloud.google.com/asset-inventory/docs/asset-inventory-overview) |
| Artifact Analysis: continuous scanning for images pulled in the last 30 days | After 30 days without a pull, results are stale. | No | [Container scanning overview](https://docs.cloud.google.com/artifact-analysis/docs/container-scanning-overview) |
| IAM role recommendations: permissions used in the last 90 days | The basis for least-privilege cleanup. | No | [IAM and the resource hierarchy](note:3.1-iam-and-hierarchy) |
| Backup vault: enforced minimum retention up to 99 years | Immutable backups against ransomware. | No | [Backup and DR overview](https://docs.cloud.google.com/backup-disaster-recovery/docs/concepts/backup-dr) |

## Operations, cost, and support

These numbers decide cost, SRE, and support questions ([Cost optimization](note:4.2-cost-optimization), [Observability](note:6.2-observability), [Support](note:6.4-support)).

| Number | What it decides | Decides answers | Source |
|---|---|---|---|
| Committed use discounts: 1 or 3 years; you cannot cancel a resource-based commitment | Commit only to steady usage. A commitment does not reserve capacity. | Yes | [Resource-based CUDs](https://docs.cloud.google.com/compute/docs/instances/signing-up-committed-use-discounts) |
| Sustained use discounts: automatic above 25% of a billing month, only some series | They need no action. They do not apply to usage that a CUD covers. | No | [Sustained use discounts](https://docs.cloud.google.com/compute/docs/sustained-use-discounts) |
| Recommenders: machine type uses 8 days of data; CUD uses 30 days | Eight days can miss a monthly peak. | Yes | [Machine type recommendations](https://docs.cloud.google.com/compute/docs/instances/apply-machine-type-recommendations-for-instances), [CUD recommendations](https://docs.cloud.google.com/docs/cuds-recommender) |
| Burn-rate alert lookback: 24 hours at most in Cloud Monitoring | Use fast-burn and slow-burn policies, not one 30-day window. | Yes | [Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate) |
| Multiwindow burn rate (99.9% SLO): page at 14.4 (1 hour / 5 minutes) and 6 (6 hours / 30 minutes); ticket at 1 (3 days / 6 hours) | The SRE workbook's recommended alert design. | No | [Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) |
| SLO compliance period: calendar or rolling 1 to 30 days | The error budget is (1 − SLO) × eligible events. | No | [Observability](note:6.2-observability) |
| Toil: below 50% of an SRE's time | The rest goes to engineering. | No | [Production reliability](note:6.6-production-reliability) |
| Managed Service for Prometheus: 24 months of data at no additional cost | You keep PromQL and Grafana dashboards. | No | [Google Cloud Managed Service for Prometheus](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus) |
| Support P1 target response: Enhanced 1 hour; Premium 15 minutes; Standard has no P1 (P2 in 4 hours) | A 1-hour, 24/7 critical response needs at least Enhanced Support. | Yes | [Technical Support Services Guidelines](https://cloud.google.com/terms/tssg) |
| Event Management Service: request 30 days before a planned peak event | Premium Support includes it. | No | [Support](note:6.4-support) |
| Deprecation notice: at least 12 months for a GA service or incompatible API change; none for pre-GA | Prefer GA features in production designs. | No | [Terms of Service](https://cloud.google.com/terms) |
| Stable Gemini models: available at least 12 months; at least 45 days to migrate for short-term models | Pin a model version and track its retirement date. | No | [Model versions and lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions) |
