---
id: ehr-analysis
caseStudy: ehr
minutes: 25
---

## Summary

EHR Healthcare sells electronic health record software as a service to multi-national medical offices, hospitals, and insurance providers, and its business grows exponentially. Google Cloud replaces its colocation facilities, and the lease on one data center is about to expire. Many customer-facing web applications already run in containers on Kubernetes, and the data is in MySQL, SQL Server, Redis, and MongoDB. Legacy insurance integrations stay on-premises for now, and Microsoft Active Directory manages users. The executive statement names three causes of outages: misconfigured systems, too little capacity for traffic spikes, and inconsistent monitoring. These causes call for managed, consistent, and automated operations instead of custom tools.

## Requirements map

### Business requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "On-board new insurance providers as quickly as possible." | Apigee API proxies with a developer portal | Providers find the documentation and register apps themselves. Policies in the proxy layer add security and rate limits, so the backends stay unchanged. | [What is Apigee?](https://docs.cloud.google.com/apigee/docs/api-platform/get-started/what-apigee) |
| "Provide a minimum 99.9% availability for all customer-facing systems." | Regional GKE clusters with replicas across zones; Cloud SQL high availability (HA) | Google recommends regional clusters for production. Cloud SQL HA fails over to a standby in a second zone. | [About cluster configuration choices](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/configuration-overview), [About high availability](https://docs.cloud.google.com/sql/docs/mysql/high-availability) |
| "Provide centralized visibility and proactive action on system performance and usage." | One Cloud Monitoring metrics scope over all projects; SLOs with burn-rate alerts | A scoping project shows the metrics of all monitored projects. The burn rate shows how fast the service uses its error budget. | [Metrics scopes overview](https://docs.cloud.google.com/monitoring/settings), [Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate) |
| "Increase ability to provide insights into healthcare trends." | Cloud Healthcare API FHIR stores with BigQuery streaming; Looker for analysis; a GA Gemini model on Agent Platform (formerly Vertex AI) for unstructured notes | FHIR changes reach BigQuery in near real time. This analysis does not use the Healthcare Natural Language API, because Google deprecated it on May 27, 2025. Its shutdown date is May 27, 2026. Google names a GA Gemini model as the alternative. | [Streaming FHIR resource changes to BigQuery](https://docs.cloud.google.com/healthcare-api/docs/how-tos/fhir-bigquery-streaming), [Feature deprecations](https://docs.cloud.google.com/healthcare-api/docs/deprecations), [Healthcare Natural Language API](https://docs.cloud.google.com/healthcare-api/docs/concepts/nlp), [Looker](https://docs.cloud.google.com/looker/docs/intro) |
| "Reduce latency to all customers." | Backends in several regions behind a global external Application Load Balancer | One anycast IP address fronts backends in regions around the world, so connections end close to users. | [External Application Load Balancer overview](https://docs.cloud.google.com/load-balancing/docs/https), [Cloud Load Balancing overview](https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview) |
| "Maintain regulatory compliance." | If HIPAA applies: accept the Google Cloud Business Associate Agreement (BAA). Use only covered products, and no Pre-GA products, for protected health information (PHI). | The case names no regulation, and the customers are multi-national. EHR must decide if HIPAA applies. HIPAA compliance is a shared responsibility, and no HHS-recognized HIPAA certification exists. | [HIPAA Compliance on Google Cloud](https://cloud.google.com/security/compliance/hipaa) |
| "Decrease infrastructure administration costs." | GKE Autopilot; managed databases instead of self-managed servers | In Autopilot, Google manages nodes, scaling, and security settings. Memorystore removes manual OS patching and replication setup. | [GKE Autopilot overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview), [Migrate your Redis and Valkey workloads into Memorystore for Valkey](https://docs.cloud.google.com/memorystore/docs/valkey/migrate-workloads) |
| "Make predictions and generate reports on industry trends based on provider data." | BigQuery ML `AI.FORECAST` with the built-in TimesFM model; Looker reports | Analysts forecast in SQL without moving data and without creating a model. | [Forecasting overview](https://docs.cloud.google.com/bigquery/docs/forecasting-overview), [Introduction to ML in BigQuery](https://docs.cloud.google.com/bigquery/docs/bqml-introduction) |

### Technical requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "Maintain legacy interfaces to insurance providers with connectivity to both on-premises systems and cloud providers." | Keep the legacy integrations on-premises. Reach them over Cloud Interconnect. Use Cross-Cloud Interconnect when EHR needs a private link to its own network in another cloud. | The case says there is no plan to move these systems. "Cloud providers" is ambiguous. This analysis reads it as the clouds where EHR runs its own systems, including Google Cloud. Cross-Cloud Interconnect connects to EHR's own network in AWS, Azure, OCI, or Alibaba Cloud. It does not connect to the network of an insurance provider. | [Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/overview), [Cross-Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview) |
| "Provide a consistent way to manage customer-facing applications that are container-based." | GKE clusters in a fleet, with Config Sync from a Git repository | Config Sync syncs configuration across any number of clusters and prevents configuration drift. | [Fleet management](https://docs.cloud.google.com/kubernetes-engine/docs/fleets-overview), [Config Sync overview](https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/overview) |
| "Provide a secure and high-performance connection between on-premises systems and Google Cloud." | Dedicated Interconnect in the 99.99% topology, with MACsec | Google recommends the 99.99% topology for mission-critical production use. MACsec encrypts traffic between the on-premises router and Google's edge routers. | [Establish 99.99% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-9999-availability), [MACsec for Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview) |
| "Provide consistent logging, log retention, monitoring, and alerting capabilities." | Aggregated sinks to a central log bucket with custom retention; alerting through an on-call channel with email or Pub/Sub as the redundant channel | Aggregated sinks combine logs from an organization or folder in one place. Log buckets have configurable retention. | [Collate and route organization- and folder-level logs to supported destinations](https://docs.cloud.google.com/logging/docs/export/aggregated_sinks), [Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets), [Create and manage notification channels](https://docs.cloud.google.com/monitoring/support/notification-options) |
| "Maintain and manage multiple container-based environments." | One fleet for each environment; Policy Controller guardrails; Cloud Deploy promotion from test to production | Google says that a fleet should contain clusters from only one environment. Policy Controller enforces programmable policies across clusters. Cloud Deploy delivers to targets in a defined promotion sequence. | [Plan fleet resources](https://docs.cloud.google.com/kubernetes-engine/fleet-management/docs/fleet-concepts/plan-fleets), [Policy Controller overview](https://docs.cloud.google.com/kubernetes-engine/policy-controller/docs/overview), [Overview of Cloud Deploy](https://docs.cloud.google.com/deploy/docs/overview) |
| "Dynamically scale and provision new environments." | GKE Autopilot for scaling; Terraform with Infrastructure Manager to create environments from code | Infrastructure Manager runs Terraform configurations as a managed Infrastructure as Code (IaC) service. | [GKE Autopilot overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview), [Infrastructure Manager overview](https://docs.cloud.google.com/infrastructure-manager/docs/overview) |
| "Create interfaces to ingest and process data from new providers." | Apigee for provider APIs; Cloud Healthcare API stores (FHIR, HL7v2, DICOM); BigQuery streaming | The Cloud Healthcare API uses industry-standard protocols and formats to ingest and store healthcare data. | [Overview of the Cloud Healthcare API](https://docs.cloud.google.com/healthcare-api/docs/introduction), [Streaming FHIR resource changes to BigQuery](https://docs.cloud.google.com/healthcare-api/docs/how-tos/fhir-bigquery-streaming) |

### Other stated needs (solution concept, environment, and executive statement)

| Stated need | Google Cloud solution | Why | Source |
|---|---|---|---|
| "The lease on one of the data centers is about to expire." | Rehost the containerized applications on GKE first, and optimize after the move | A rehost migration takes the least time, because refactoring is kept to a minimum. | [Migrate to Google Cloud: Get started](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started) |
| "MySQL, MS SQL Server, Redis, and MongoDB" | Database Migration Service to Cloud SQL; Memorystore for Valkey, seeded from RDB files in Cloud Storage; Firestore with MongoDB compatibility | Each is a documented migration path into a managed service. | [Database Migration Service overview](https://docs.cloud.google.com/database-migration/docs/overview), [Manage backups](https://docs.cloud.google.com/memorystore/docs/valkey/manage-backups), [Migrate to Firestore with MongoDB compatibility](https://docs.cloud.google.com/firestore/mongodb-compatibility/docs/migrate-data) |
| "Users are managed via Microsoft Active Directory." | Google Cloud Directory Sync (GCDS) to Cloud Identity, and SAML single sign-on to Active Directory | Only Active Directory manages credentials, and its MFA policies still apply. | [Federate Google Cloud with Active Directory](https://docs.cloud.google.com/architecture/identity/federating-gcp-with-active-directory-introduction) |
| "adapt their disaster recovery plan" | Cloud SQL cross-region read replica; standby GKE cluster in a second region; Backup for GKE | A cross-region replica fails over faster than a restore from backups. | [About disaster recovery (DR) in Cloud SQL](https://docs.cloud.google.com/sql/docs/mysql/intro-to-cloud-sql-disaster-recovery), [Backup for GKE overview](https://docs.cloud.google.com/kubernetes-engine/docs/add-on/backup-for-gke/concepts/backup-for-gke) |
| "roll out new continuous deployment capabilities" | Cloud Build and Cloud Deploy with a canary strategy | A canary sends a new version to a subset of users before the full rollout. | [Use a canary deployment strategy](https://docs.cloud.google.com/deploy/docs/deployment-strategies/canary) |

## Key design decisions

### 1. What moves first before the lease expires?

| Option | Fit for EHR |
|---|---|
| Rehost the containerized applications on GKE, then optimize | Good. Many of the applications already run in containers, and a rehost is the quickest migration type. |
| Refactor or rebuild the applications before the move | Weak. These migration types take longer than a rehost, and the lease is about to expire. |
| Move the legacy insurance integrations too | Not needed. The case says there is no plan to move them now. |

**Recommendation:** Move the workloads of the expiring facility first, as a rehost to GKE. Migrate their MySQL and SQL Server databases with Database Migration Service in the same wave. Leave the legacy integrations on-premises and reach them over Cloud Interconnect ([Migrate to Google Cloud: Get started](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started), [Database Migration Service overview](https://docs.cloud.google.com/database-migration/docs/overview), [Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/overview)).

### 2. How do you meet 99.9% availability and reduce latency?

| Option | Fit for EHR |
|---|---|
| Regional GKE clusters in several regions behind a global external Application Load Balancer | Good. A zone failure does not stop a cluster, and users connect to a nearby region. |
| One zonal cluster with auto-repair | Weak. A zonal cluster has one control plane in one zone. |
| Cloud CDN in front of one region | Partial. It helps static content, but Google says not to cache PHI, and uncached requests still travel far. |

**Recommendation:** Use regional clusters (Autopilot clusters are always regional) with Cloud SQL HA. Add regions near large customer groups behind one global external Application Load Balancer ([About cluster configuration choices](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/configuration-overview), [Cloud Load Balancing overview](https://docs.cloud.google.com/load-balancing/docs/load-balancing-overview), [HIPAA Compliance on Google Cloud](https://cloud.google.com/security/compliance/hipaa)).

### 3. How do you manage many container environments the same way?

| Option | Fit for EHR |
|---|---|
| Fleet, Config Sync, and Policy Controller | Good. Git is the single source of truth, drift is corrected, and guardrails block noncompliant changes. |
| Per-cluster changes with kubectl | Weak. Nothing corrects drift, and misconfiguration caused many past outages. |
| Custom scripts that copy configuration | Weak. Scripts are code to maintain and give no policy enforcement. |

**Recommendation:** Use one fleet for each environment, such as development, staging, and production. Sync configuration with Config Sync, enforce policy bundles with Policy Controller, and release through Cloud Deploy ([Plan fleet resources](https://docs.cloud.google.com/kubernetes-engine/fleet-management/docs/fleet-concepts/plan-fleets), [Config Sync overview](https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/overview), [Policy Controller overview](https://docs.cloud.google.com/kubernetes-engine/policy-controller/docs/overview)).

### 4. Which hybrid connection is "secure and high-performance"?

| Option | Fit for EHR |
|---|---|
| Dedicated Interconnect, 99.99% topology, with MACsec | Good. Private, high-bandwidth, and encrypted on the physical links. |
| Dedicated Interconnect, 99.9% topology | Weaker. Google points to this topology for non-critical applications. |
| HA VPN over the internet | Secure, but the encrypted traffic crosses the public internet. Google suggests Cloud VPN for lower bandwidth needs. |

**Recommendation:** Use the multi-region 99.99% topology: four Dedicated Interconnect connections across two metros, with MACsec. Google suggests Dedicated or Partner Interconnect for an enterprise-grade connection with higher throughput ([Choosing a Network Connectivity product](https://docs.cloud.google.com/network-connectivity/docs/how-to/choose-product), [Establish 99.99% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-9999-availability), [Establish 99.9% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-999-availability), [MACsec for Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview)).

### 5. How do you onboard insurance providers and ingest their data?

| Option | Fit for EHR |
|---|---|
| Apigee in front of the APIs, and Cloud Healthcare API stores for the data | Good. Self-service onboarding, central security and rate limits, and standard healthcare formats. |
| A VPN tunnel and a custom interface for each provider | Weak. Each onboarding becomes a project. |
| Files in Cloud Storage with a nightly import | Weak. FHIR imports from Cloud Storage are not streamed to BigQuery. |

**Recommendation:** Publish provider APIs through Apigee with a developer portal. Store clinical data in FHIR stores with BigQuery streaming for trend analysis ([What is Apigee?](https://docs.cloud.google.com/apigee/docs/api-platform/get-started/what-apigee), [Streaming FHIR resource changes to BigQuery](https://docs.cloud.google.com/healthcare-api/docs/how-tos/fhir-bigquery-streaming)).

### 6. How do you fix inconsistent monitoring and ignored alerts?

| Option | Fit for EHR |
|---|---|
| Central logs and metrics, SLOs, and burn-rate alerts to an on-call tool | Good. One view, fewer and more meaningful alerts, and a redundant channel. |
| More email alerts | Weak. Email alerts are already ignored. |
| Each team keeps its own tools | Weak. This is the current inconsistency. |

**Recommendation:** Route logs with aggregated sinks to a central log bucket with the retention that compliance needs. Monitor all projects from one metrics scope. Alert on error budget burn rate through PagerDuty or a similar channel, with email or Pub/Sub as the redundant channel ([Collate and route organization- and folder-level logs to supported destinations](https://docs.cloud.google.com/logging/docs/export/aggregated_sinks), [Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate), [Create and manage notification channels](https://docs.cloud.google.com/monitoring/support/notification-options)).

### 7. How do you adapt the disaster recovery plan?

| Option | Fit for EHR |
|---|---|
| Cross-region Cloud SQL replica and a standby GKE cluster in a second region | Good. RTO and RPO in minutes. |
| Cloud SQL HA only | Weak for DR. An HA instance is regional, so a regional outage stops it. |
| Backups and restore in another region | Cheaper, but the recovery takes longer, especially for large databases. |

**Recommendation:** Set RTO and RPO for each application first. For the customer-facing tier, keep a cross-region read replica and deploy the same releases to a standby cluster ([About disaster recovery (DR) in Cloud SQL](https://docs.cloud.google.com/sql/docs/mysql/intro-to-cloud-sql-disaster-recovery), [Disaster recovery planning guide](https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide)).

### 8. How do you handle identity and HIPAA?

| Option | Fit for EHR |
|---|---|
| GCDS and SAML single sign-on to Active Directory | Good. One set of credentials, and deletions in Active Directory reach Google Cloud. |
| Manual Cloud Identity accounts | Weak. A second set of passwords, and no automatic deletion. |
| BAA plus covered products for PHI | Required first steps for HIPAA on Google Cloud. |

**Recommendation:** Federate with Active Directory. If HIPAA applies, accept the BAA and keep PHI in covered, GA products ([Federate Google Cloud with Active Directory](https://docs.cloud.google.com/architecture/identity/federating-gcp-with-active-directory-introduction), [HIPAA Compliance on Google Cloud](https://cloud.google.com/security/compliance/hipaa)).

## Likely exam angles

| Phrase in the case | Points to | Trap |
|---|---|---|
| "The lease on one of the data centers is about to expire." | Rehost the containers on GKE first | A refactor to serverless before the move: it takes longer than a rehost. |
| "minimum 99.9% availability" | Regional GKE clusters and Cloud SQL HA | A zonal cluster with more nodes: one control plane in one zone. |
| "Reduce latency to all customers" | Multi-region backends behind a global external Application Load Balancer | Cloud CDN for everything: Google says not to cache PHI. |
| "secure and high-performance connection" | Dedicated Interconnect with MACsec | HA VPN over the internet: secure, but Google suggests it for lower bandwidth needs. |
| "consistent way to manage… container-based" | Fleet with Config Sync and Policy Controller | Scripts or manual kubectl changes: no drift correction, and misconfiguration caused many past outages. |
| "Alerts are sent via email and are often ignored." | SLO burn-rate alerts to an on-call tool, with a redundant channel | More email recipients: more noise, same problem. |
| "log retention" | Aggregated sinks to a central log bucket with custom retention | The default buckets in each project: logs stay spread out. |
| "On-board new insurance providers as quickly as possible." | Apigee with a developer portal | A VPN tunnel per provider: slow onboarding. |
| "Make predictions… on industry trends" | BigQuery ML forecasting in SQL | Custom training on Agent Platform (formerly Vertex AI): needs ML programming skills and data movement. |
| "Users are managed via Microsoft Active Directory." | GCDS and SAML single sign-on | Password sync: Active Directory is then not the only system that manages credentials. |
| "Maintain regulatory compliance." | BAA and covered products, if HIPAA applies | A "HIPAA certification": no HHS-recognized certification exists. |
| "adapt their disaster recovery plan" | Cross-region read replica and standby cluster | Cloud SQL HA as DR: it is regional. |

Sources: [Migrate to Google Cloud: Get started](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started), [About cluster configuration choices](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/configuration-overview), [External Application Load Balancer overview](https://docs.cloud.google.com/load-balancing/docs/https), [Choosing a Network Connectivity product](https://docs.cloud.google.com/network-connectivity/docs/how-to/choose-product), [MACsec for Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview), [Config Sync overview](https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/overview), [Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate), [Configure log buckets](https://docs.cloud.google.com/logging/docs/buckets), [Route log entries](https://docs.cloud.google.com/logging/docs/routing/overview), [What is Apigee?](https://docs.cloud.google.com/apigee/docs/api-platform/get-started/what-apigee), [Introduction to ML in BigQuery](https://docs.cloud.google.com/bigquery/docs/bqml-introduction), [Federate Google Cloud with Active Directory](https://docs.cloud.google.com/architecture/identity/federating-gcp-with-active-directory-introduction), [HIPAA Compliance on Google Cloud](https://cloud.google.com/security/compliance/hipaa), [About disaster recovery (DR) in Cloud SQL](https://docs.cloud.google.com/sql/docs/mysql/intro-to-cloud-sql-disaster-recovery).

## Read in the docs

1. [Migrate to Google Cloud: Get started](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started) — migration types and phases (about 20 min)
2. [About cluster configuration choices](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/configuration-overview) — regional and zonal clusters (about 10 min)
3. [Establish 99.99% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-9999-availability) — the topology for mission-critical links (about 10 min)
4. [Config Sync overview](https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/overview) — GitOps across a fleet (about 8 min)
5. [Policy Controller overview](https://docs.cloud.google.com/kubernetes-engine/policy-controller/docs/overview) — guardrails for clusters (about 8 min)
6. [What is Apigee?](https://docs.cloud.google.com/apigee/docs/api-platform/get-started/what-apigee) — API proxies and the developer portal (about 10 min)
7. [Streaming FHIR resource changes to BigQuery](https://docs.cloud.google.com/healthcare-api/docs/how-tos/fhir-bigquery-streaming) — near-real-time analytics on clinical data (about 10 min)
8. [Alerting on your burn rate](https://docs.cloud.google.com/stackdriver/docs/solutions/slo-monitoring/alerting-on-budget-burn-rate) — SLO-based alerts (about 10 min)
9. [About disaster recovery (DR) in Cloud SQL](https://docs.cloud.google.com/sql/docs/mysql/intro-to-cloud-sql-disaster-recovery) — cross-region replicas and failover (about 12 min)
10. [HIPAA Compliance on Google Cloud](https://cloud.google.com/security/compliance/hipaa) — shared responsibility and the BAA (about 15 min)

## Related notes

- [Planning a migration](note:1.4-migration-planning) — migration types and waves
- [High availability, scalability, and performance](note:1.2-ha-scalability-performance) — regional design for 99.9%
- [Choosing a load balancer](note:1.3-load-balancing) — the global external Application Load Balancer
- [Hybrid and multicloud connectivity](note:2.1-hybrid-multicloud) — Dedicated Interconnect, MACsec, and Cross-Cloud Interconnect
- [Configuring GKE](note:2.3-gke) — regional clusters, Autopilot, and fleets
- [Configuring databases for availability, scale, and growth](note:2.2-database-config) — Cloud SQL HA and replicas
- [Advising teams: deployment, API management, and testing](note:5.1-deployment-and-apis) — Apigee
- [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy) — Active Directory federation
- [Designing for compliance](note:3.2-compliance) — HIPAA
- [Google Cloud Observability](note:6.2-observability) — log buckets, sinks, and SLO alerts
- [Disaster recovery planning](note:4.1-disaster-recovery) — RTO, RPO, and DR patterns
- [Deployment and release management](note:6.3-release-management) — canary releases
- [Infrastructure as Code](note:5.2-infrastructure-as-code) — new environments from code
- Labs: [Cloud SQL high availability, backups, and cross-region replica](lab:21-cloud-sql-ha-dr), [GKE Autopilot with Workload Identity Federation for GKE](lab:31-gke-autopilot), [SLOs, burn-rate alerts, and log analytics](lab:70-observability-slo), [Canary releases with Cloud Build and Cloud Deploy](lab:71-cloud-deploy-canary), [Simulate hybrid connectivity with HA VPN and Cloud Router](lab:12-ha-vpn-hybrid)
