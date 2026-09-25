# Content plan

This plan lists every notes page, lab, and question file, and the domain that owns it. Use these IDs for cross-links (`note:<id>`, `lab:<id>`, `case:<id>`). Format rules are in `content/SPEC.md`.

## Owners

| Key | Domain |
|---|---|
| arch | Architecture, business requirements, and cost |
| net | Networking |
| data | Storage, databases, and data processing |
| comp | Compute, containers, and serverless |
| ai | AI and ML |
| sec | Security and compliance |
| mig | Migration and implementation |
| ops | Operations, reliability, and technical processes |
| cs | Case studies |

## Notes pages (`content/notes/<id>.md`)

| ID | Title | Objective | Owner |
|---|---|---|---|
| 1.1-business-requirements | Business requirements, trade-offs, and success measures | 1.1 | arch |
| 1.1-integration-and-data-movement | Integration patterns and data movement | 1.1 | arch |
| 1.2-well-architected-framework | The Google Cloud Well-Architected Framework | 1.2 | arch |
| 1.2-ha-scalability-performance | High availability, scalability, and performance | 1.2 | arch |
| 1.2-gemini-cloud-assist | Gemini Cloud Assist | 1.2 | arch |
| 1.3-network-design | Cloud-native network design | 1.3 | net |
| 1.3-load-balancing | Choosing a load balancer | 1.3 | net |
| 1.3-storage-choice | Choosing storage: object, block, file, and databases | 1.3 | data |
| 1.3-data-processing | Choosing data processing solutions | 1.3 | data |
| 1.3-compute-choice | Mapping workloads to compute platforms | 1.3 | comp |
| 1.3-compute-resources | Choosing compute resources | 1.3 | comp |
| 1.3-ai-solutions | Choosing AI and ML solutions | 1.3 | ai |
| 1.4-migration-planning | Planning a migration | 1.4 | mig |
| 1.4-licensing-and-financials | Licensing and financial impact of a migration | 1.4 | mig |
| 1.5-future-improvements | Future improvements and cloud-first design | 1.5 | arch |
| 2.1-hybrid-multicloud | Hybrid and multicloud connectivity | 2.1 | net |
| 2.1-network-security | Network security controls | 2.1 | net |
| 2.1-vpc-access-patterns | Access to Google APIs, the internet, and cloud-adjacent services | 2.1 | net |
| 2.2-cloud-storage-config | Configuring Cloud Storage | 2.2 | data |
| 2.2-database-config | Configuring databases for availability, scale, and growth | 2.2 | data |
| 2.2-data-protection | Data protection: backup, recovery, and retention | 2.2 | data |
| 2.3-compute-engine-ops | Configuring Compute Engine for resilience and operations | 2.3 | comp |
| 2.3-gke | Configuring GKE | 2.3 | comp |
| 2.3-serverless | Configuring Cloud Run, Cloud Run functions, and VMware Engine networking | 2.3 | comp |
| 2.4-ml-workflows | End-to-end ML workflows on Agent Platform | 2.4 | ai |
| 2.4-ai-hypercomputer | AI Hypercomputer: accelerators and consumption models | 2.4 | ai |
| 2.5-ai-apis-and-gemini-enterprise | Pre-trained AI APIs, Gemini Enterprise, and Model Garden | 2.5 | ai |
| 3.1-iam-and-hierarchy | IAM, resource hierarchy, and separation of duties | 3.1 | sec |
| 3.1-data-protection-kms | Encryption, Cloud KMS, and secrets | 3.1 | sec |
| 3.1-security-controls | Organization policy, VPC Service Controls, and audit logging | 3.1 | sec |
| 3.1-secure-access | Secure remote and workload access | 3.1 | sec |
| 3.1-supply-chain | Software supply chain security | 3.1 | sec |
| 3.1-securing-ai | Securing AI workloads | 3.1 | sec |
| 3.2-compliance | Designing for compliance | 3.2 | sec |
| 4.1-sdlc-cicd | SDLC, CI/CD, and service provisioning | 4.1 | ops |
| 4.1-testing-and-troubleshooting | Testing, validation, and root cause analysis | 4.1 | ops |
| 4.1-disaster-recovery | Disaster recovery planning | 4.1 | ops |
| 4.2-business-processes | Business processes: stakeholders, change, skills, and decisions | 4.2 | arch |
| 4.2-cost-optimization | Cost optimization and CapEx/OpEx | 4.2 | arch |
| 5.1-migration-tooling | Data and system migration tooling | 5.1 | mig |
| 5.1-deployment-and-apis | Advising teams: deployment, API management, and testing | 5.1 | mig |
| 5.2-programmatic-access | Working with Google Cloud programmatically | 5.2 | mig |
| 5.2-infrastructure-as-code | Infrastructure as Code | 5.2 | mig |
| 6.1-operational-excellence | The operational excellence pillar | 6.1 | ops |
| 6.2-observability | Google Cloud Observability | 6.2 | ops |
| 6.3-release-management | Deployment and release management | 6.3 | ops |
| 6.4-support | Supporting deployed solutions | 6.4 | ops |
| 6.5-quality-control | Quality control measures | 6.5 | ops |
| 6.6-production-reliability | Reliability in production: chaos, penetration, and load testing | 6.6 | ops |

## Case studies (`content/case-studies/`)

| ID | Files | Owner |
|---|---|---|
| altostrat | `altostrat.md`, `altostrat.analysis.md` | cs |
| cymbal | `cymbal.md`, `cymbal.analysis.md` | cs |
| ehr | `ehr.md`, `ehr.analysis.md` | cs |
| knightmotives | `knightmotives.md`, `knightmotives.analysis.md` | cs |

## Labs (`labs/<id>/`)

| ID | Title | Objectives | Owner |
|---|---|---|---|
| 00-setup | Create the lab project and safety guard | — | lead |
| 01-cost-controls | Budgets, labels, and cost recommendations | 4.2, 1.1 | arch |
| 02-gemini-cloud-assist | Explore Gemini Cloud Assist | 1.2, 5.1 | arch |
| 10-vpc-foundations | VPC foundations: subnets, firewall policy, NAT, Private Google Access, IAP | 1.3, 2.1 | net |
| 11-global-lb-cloud-armor | Global Application Load Balancer with Cloud Armor and Cloud CDN | 1.3, 2.1 | net |
| 12-ha-vpn-hybrid | Simulate hybrid connectivity with HA VPN and Cloud Router | 2.1 | net |
| 13-private-service-connect | Publish and consume a service with Private Service Connect | 1.3, 2.1 | net |
| 20-cloud-storage-lifecycle | Cloud Storage classes, lifecycle, versioning, and retention | 2.2 | data |
| 21-cloud-sql-ha-dr | Cloud SQL high availability, backups, and cross-region replica | 2.2, 4.1 | data |
| 22-bigquery-design | BigQuery partitioning, clustering, cost controls, and time travel | 1.3, 2.2 | data |
| 23-streaming-pipeline | Streaming ingestion: Pub/Sub to BigQuery | 1.3, 2.2 | data |
| 30-mig-autoscaling-spot | Regional MIG with autohealing, autoscaling, rolling updates, and Spot VMs | 2.3, 1.3 | comp |
| 31-gke-autopilot | GKE Autopilot with Workload Identity Federation for GKE | 2.3 | comp |
| 32-cloud-run-networking | Cloud Run revisions, traffic splitting, ingress, and Direct VPC egress | 2.3 | comp |
| 33-vm-manager-patching | Patch and inventory VMs with VM Manager | 2.3 | comp |
| 40-gemini-api | Call Gemini on Agent Platform | 1.3, 2.5 | ai |
| 41-ai-apis | Pre-trained AI APIs compared with Gemini | 2.5 | ai |
| 42-agent-platform-pipeline | Run a small Agent Platform Pipelines workflow | 2.4 | ai |
| 50-iam-impersonation | IAM conditions, custom roles, and service account impersonation | 3.1 | sec |
| 51-kms-cmek-secrets | CMEK with Cloud KMS and Secret Manager | 3.1 | sec |
| 52-iap-ssh | SSH without external IPs: IAP TCP forwarding and OS Login | 3.1 | sec |
| 53-workload-identity-federation | Keyless CI/CD with Workload Identity Federation | 3.1 | sec |
| 54-org-policy-vpc-sc | Organization policy and VPC Service Controls | 3.1 | sec |
| 55-sdp-model-armor | Sensitive Data Protection and Model Armor | 3.1, 3.2 | sec |
| 60-terraform-basics | Terraform with remote state | 5.2 | mig |
| 61-infrastructure-manager | Deploy Terraform with Infrastructure Manager | 5.2 | mig |
| 62-emulators | Local development with Cloud emulators | 5.2 | mig |
| 63-api-gateway | API Gateway in front of Cloud Run | 5.1 | mig |
| 64-migration-center-assessment | Assess a sample inventory with Migration Center | 1.4 | mig |
| 70-observability-slo | SLOs, burn-rate alerts, and log analytics | 6.2, 6.5 | ops |
| 71-cloud-deploy-canary | Canary releases with Cloud Build and Cloud Deploy | 4.1, 6.3 | ops |
| 72-load-test-failure-drill | Load test and failure drill | 6.6, 4.1 | ops |

## Question files (`content/questions/<file>`)

| File | ID prefix | Owner | Targets by objective |
|---|---|---|---|
| arch.json | `arch-` | arch | 1.1: 14, 1.2: 14, 1.5: 4, 4.2: 18 |
| net.json | `net-` | net | 1.3: 14, 2.1: 20 |
| data.json | `data-` | data | 1.3: 14, 2.2: 16 |
| comp.json | `comp-` | comp | 1.3: 10, 2.3: 16 |
| ai.json | `ai-` | ai | 1.3: 8, 2.4: 10, 2.5: 10 |
| sec.json | `sec-` | sec | 3.1: 36, 3.2: 14 |
| mig.json | `mig-` | mig | 1.4: 12, 5.1: 16, 5.2: 16 |
| ops.json | `ops-` | ops | 4.1: 20, 6.1: 5, 6.2: 10, 6.3: 6, 6.4: 5, 6.5: 4, 6.6: 6 |
| cs.json | `cs-alto-`, `cs-cym-`, `cs-ehr-`, `cs-km-` | cs | 15 per case study |

Targets are goals, not quotas. Never add a weak question to reach a number. A delivered count of 80% or more of the target is fine.
