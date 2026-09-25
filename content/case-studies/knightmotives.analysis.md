---
id: knightmotives-analysis
caseStudy: knightmotives
minutes: 25
---

## Summary

KnightMotives builds autonomous, battery electric, hybrid, and combustion vehicles, and it wants one "automotive experience" across all models within five years. Its IT is mostly on-premises, with some applications on other major clouds, an outdated mainframe for the supply chain, and an outdated ERP. The unreliable build-to-order system strains dealers, and dealers have no budget for new equipment. KnightMotives wants to monetize siloed corporate data, replace obsolete AI infrastructure, and build a simulation environment for autonomous driving. Security is paramount after past breaches, and EU data protection rules are critical, especially for autonomous platforms. The technical requirements ask for a hybrid cloud strategy, gradual modernization or replacement of legacy systems, and strict data security and privacy.

## Requirements map

### Business requirements

The case states its business requirements as paragraphs. Each row is one stated requirement.

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "fostering a personalized relationship with the driver" | A SaaS CRM connected to vehicle, order, and dealer data with Application Integration and Integration Connectors | Application Integration has prebuilt connectors for Google Cloud services and business applications, such as Salesforce. | [Application Integration overview](https://docs.cloud.google.com/application-integration/docs/overview), [Salesforce (Integration Connectors)](https://docs.cloud.google.com/integration-connectors/docs/connectors/salesforce/configure) |
| "delivering a cohesive experience across all models" | One vehicle software platform built with Cloud Build and stored in Artifact Registry, with the same AI features for every model | One pipeline and one artifact store reduce the fragmentation of multiple code bases. | [Overview of Cloud Build](https://docs.cloud.google.com/build/docs/overview), [Artifact Registry overview](https://docs.cloud.google.com/artifact-registry/docs/overview) |
| "Creating a better build-to-order model will reduce time on the lot and provide transparency for both dealers and customers." | Order intake on Cloud Run that publishes orders to Pub/Sub; a subscriber writes them to the ERP | Pub/Sub decouples the order website from the ERP. Pub/Sub redelivers an unacknowledged message until its retention duration expires (7 days by default). | [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview), [Overview of the Pub/Sub service](https://docs.cloud.google.com/pubsub/docs/pubsub-basics), [Subscription properties](https://docs.cloud.google.com/pubsub/docs/subscription-properties), [What is Cloud Run](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run) |
| "monetize corporate data to finance new technology investments" | BigQuery data clean rooms in BigQuery sharing (formerly Analytics Hub) | Partners join and analyze data without seeing or moving the underlying records. | [Share sensitive data with data clean rooms](https://docs.cloud.google.com/bigquery/docs/data-clean-rooms) |
| "their current AI infrastructure is obsolete and corporate data remains siloed" | AI Hypercomputer consumption options for training; Knowledge Catalog (formerly Dataplex Universal Catalog) across BigQuery and Cloud Storage | Consumption options match capacity to each workload. The catalog gives discovery, data quality, and lineage across silos. | [Consumption options for AI Hypercomputer](https://docs.cloud.google.com/ai-hypercomputer/docs/consumption-models), [Knowledge Catalog overview](https://docs.cloud.google.com/knowledge-catalog/docs/introduction) |
| "Security is a paramount concern due to past data breaches." | Security Command Center Premium; VPC Service Controls perimeters around data projects | Premium adds threat detection and attack paths. VPC Service Controls reduces the risk of data exfiltration from BigQuery and Cloud Storage. | [Security Command Center service tiers](https://docs.cloud.google.com/security-command-center/docs/service-tiers), [Overview of VPC Service Controls](https://docs.cloud.google.com/vpc-service-controls/docs/overview) |
| "Adherence to European Union (EU) data protection regulations, especially for emerging autonomous platforms, is critical." | An Assured Workloads folder with an EU Data Boundary control package | Each EU package sets data location controls to support EU-only regions. Some EU packages also limit support access to personnel based in the EU. | [Control packages](https://docs.cloud.google.com/assured-workloads/docs/control-packages) |
| "fully autonomous driving capabilities, with initial implementation targeting regions with favorable regulatory environments" | A separate Assured Workloads folder for each launch region, with that region's data boundary package where one exists | Assured Workloads applies predefined control packages to folders. Google lists data boundary packages for many countries and regions. | [Overview of Assured Workloads](https://docs.cloud.google.com/assured-workloads/docs/overview), [Control packages](https://docs.cloud.google.com/assured-workloads/docs/control-packages) |
| "Prioritizing employee upskilling, attracting top-tier talent, and fostering better communication between business and technical teams" | An assessment with the Google Cloud Adoption Framework, then training plans for the gaps | The framework assesses readiness in four themes, including Learn and Lead. | [Migrate to Google Cloud: Get started](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started) |

### Technical requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "Modernizing the in-vehicle experience" (consistent AI UX, updates for legacy models, rural connectivity) | One software platform with CI/CD; update packages served through Media CDN; vehicles buffer data and publish to Pub/Sub when they reconnect | Google recommends Media CDN when demand for software downloads is large. Pub/Sub gathers events from many clients at the same time. | [Choose a CDN product](https://docs.cloud.google.com/media-cdn/docs/choose-cdn-product), [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview) |
| "Network upgrades are necessary to support increased data traffic and improve connectivity between plants and headquarters." | Cloud Interconnect at plants and headquarters, joined as hybrid spokes of a Network Connectivity Center (NCC) hub with site-to-site data transfer | NCC lets you use Google's network as part of a WAN between external sites. | [Site-to-site data transfer overview](https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/concepts/data-transfer), [NCC overview](https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/concepts/overview) |
| "IT infrastructure modernization" (hybrid cloud, gradual modernization or replacement of legacy systems) | Keep plant systems on-premises where needed; Cross-Cloud Interconnect to the other clouds; mainframe path of Mainframe Assessment Tool, Mainframe Connector, and Dual Run | Google gives a phased approach and tools for mainframe modernization. | [Mainframe modernization overview](https://docs.cloud.google.com/mainframe-assessment-tool/docs/mainframe-modernization-overview), [Cross-Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview) |
| "Autonomous vehicle development and testing" (AI and ML, simulation environment, regulatory compliance) | Future reservations in calendar mode for large training runs; Batch on Spot VMs for simulation; Assured Workloads for regulated regions | Calendar mode reserves clustered GPUs for up to 90 days. Batch schedules and runs batch work, and Spot VMs cut the cost of fault-tolerant jobs. | [Consumption options for AI Hypercomputer](https://docs.cloud.google.com/ai-hypercomputer/docs/consumption-models), [Get started with Batch](https://docs.cloud.google.com/batch/docs/get-started), [Spot VMs](https://docs.cloud.google.com/compute/docs/instances/spot) |
| "Data monetization and insights" (data management platform, security and privacy, scalable AI/ML) | BigQuery with Knowledge Catalog; data clean rooms for partners; Sensitive Data Protection (includes Cloud DLP) pseudonymization of driver identifiers | Clean rooms enforce analysis rules set by the data owner. Pseudonymization replaces identifiers with consistent tokens, so teams can still join tables in BigQuery. | [Knowledge Catalog overview](https://docs.cloud.google.com/knowledge-catalog/docs/introduction), [Share sensitive data with data clean rooms](https://docs.cloud.google.com/bigquery/docs/data-clean-rooms), [Pseudonymization](https://docs.cloud.google.com/sensitive-data-protection/docs/pseudonymization) |
| "Increased focus on security and risk management" (security framework, incident response plan, awareness training) | Security Command Center Premium and VPC Service Controls; an incident runbook with clear roles and blameless post-incident reviews; security training for all staff | Premium adds threat detection. The Well-Architected Framework asks for clear incident roles, a runbook, and post-incident reviews. | [Security Command Center service tiers](https://docs.cloud.google.com/security-command-center/docs/service-tiers), [Manage incidents and problems](https://docs.cloud.google.com/architecture/framework/operational-excellence/manage-incidents-and-problems) |
| "Providing a delightful experience for dealers and customers" (build-to-order, dealer tools, CRM) | Pub/Sub-based order intake; web dealer tools on Cloud Run; Gemini Enterprise for technicians and sales staff; a SaaS CRM | Gemini Enterprise gives permissions-aware search across connected sources. Staff use it through web and mobile apps. | [What is Gemini Enterprise?](https://docs.cloud.google.com/gemini/enterprise/docs), [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview) |

### Other stated needs (company overview and environment)

| Stated need | Google Cloud solution | Why | Source |
|---|---|---|---|
| "some applications on major cloud platforms" | Cross-Cloud Interconnect | It gives high-bandwidth dedicated connectivity between Google Cloud and another cloud provider. | [Cross-Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview) |
| "Their supply chain runs on an outdated mainframe" | Mainframe Assessment Tool first; Mainframe Connector to move data to BigQuery | The assessment splits the application into business domains and migratable units. Mainframe Connector offloads report workloads. | [Mainframe Assessment Tool overview](https://docs.cloud.google.com/mainframe-assessment-tool/docs/overview), [Mainframe modernization overview](https://docs.cloud.google.com/mainframe-assessment-tool/docs/mainframe-modernization-overview), [Mainframe Connector overview](https://docs.cloud.google.com/mainframe-connector/docs/overview) |
| "Dealers have no budget for new equipment." | Managed web tools: Gemini Enterprise, Gemini Notebook Enterprise (formerly NotebookLM Enterprise), and dealer web apps on Cloud Run | Cloud Run is a fully managed platform, and each service has an HTTPS endpoint. Gemini Enterprise has web and mobile apps. | [What is Gemini Enterprise?](https://docs.cloud.google.com/gemini/enterprise/docs), [What is Gemini Notebook Enterprise?](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/overview), [What is Cloud Run](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run) |
| "vehicle connectivity in rural areas" | Store data on the vehicle and send it when a connection is available; Pub/Sub absorbs the bursts | Pub/Sub decouples producers from consumers and gathers events from many clients. | [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview) |
| "Investment in this new technology will require a shift in financial priorities on a global scale." | Pay-as-you-go consumption; commitments only for steady use; Spot and Flex-start for flexible AI work | Commitments suit predictable use. Spot and Flex-start give discounted, best-effort capacity. | [Committed use discounts](https://docs.cloud.google.com/docs/cuds), [Consumption options for AI Hypercomputer](https://docs.cloud.google.com/ai-hypercomputer/docs/consumption-models) |

## Key design decisions

### 1. How do you modernize the mainframe and ERP without stopping production?

| Option | Fit for KnightMotives |
|---|---|
| Assess with Mainframe Assessment Tool, move data with Mainframe Connector, validate with Dual Run | Good. Gradual, and each step lowers risk. |
| Rewrite everything and cut over in one weekend | Weak. Unknown dependencies make a single cutover risky. |
| Leave the mainframe as it is | Weak. The case asks for gradual modernization or replacement. |

**Recommendation:** Start with an assessment that splits the application into business domains and migratable units. Move data to BigQuery early with Mainframe Connector, and decouple order intake from the ERP with Pub/Sub ([Mainframe modernization overview](https://docs.cloud.google.com/mainframe-assessment-tool/docs/mainframe-modernization-overview), [Mainframe Connector overview](https://docs.cloud.google.com/mainframe-connector/docs/overview)).

### 2. How do you connect plants, headquarters, and other clouds?

| Option | Fit for KnightMotives |
|---|---|
| Cloud Interconnect plus an NCC hub with site-to-site data transfer | Good. One hub gives full mesh connectivity between spokes, and the same links reach VPC networks. |
| Cross-Site Interconnect between plant sites | Good for Layer 2 links between sites. It does not connect to VPC networks, so cloud access needs Dedicated Interconnect too. |
| A mesh of VPN tunnels over the internet | Weak. The number of tunnels grows with each plant, and traffic uses the public internet. |
| Cross-Cloud Interconnect to other clouds | Good for the applications on other major clouds. |

**Recommendation:** Connect each plant and headquarters with Cloud Interconnect, and attach the connections as hybrid spokes of one NCC hub. Site-to-site data transfer is available only in supported locations, so check each plant ([Site-to-site data transfer overview](https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/concepts/data-transfer), [Cross-Site Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cross-site-overview), [Choosing a Network Connectivity product](https://docs.cloud.google.com/network-connectivity/docs/how-to/choose-product)).

### 3. How do you ingest and store vehicle telemetry?

| Option | Fit for KnightMotives |
|---|---|
| Pub/Sub, then Dataflow, then Bigtable for per-vehicle reads and BigQuery for analytics | Good. Scales with the fleet and absorbs bursts. |
| Direct writes from each vehicle to one relational database | Weak. Vehicles and the database are tightly coupled, and Google documents Bigtable for time-series and IoT data. |
| Files per vehicle | Weak. No low-latency queries. |

**Recommendation:** Use Pub/Sub for ingestion. Store readings in Bigtable, with a row key that includes the vehicle ID and ends with the timestamp. Load analytics data into BigQuery ([What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview), [Bigtable overview](https://docs.cloud.google.com/bigtable/docs/overview), [Schema design for time series data](https://docs.cloud.google.com/bigtable/docs/schema-design-time-series)).

### 4. How do you build the data platform and monetize data safely?

| Option | Fit for KnightMotives |
|---|---|
| BigQuery, Knowledge Catalog, and data clean rooms | Good. Discovery, quality, and lineage inside; privacy controls for partners. |
| Standard data exchanges with full tables | Weak for sensitive data. Partners can read the records. |
| File exports to partners | Weak. Partners get copies, which repeats the breach risk. |

**Recommendation:** Catalog the data with Knowledge Catalog, pseudonymize driver identifiers, and share insights through data clean rooms with approved query templates ([Knowledge Catalog overview](https://docs.cloud.google.com/knowledge-catalog/docs/introduction), [Share sensitive data with data clean rooms](https://docs.cloud.google.com/bigquery/docs/data-clean-rooms)).

### 5. Which AI infrastructure fits autonomous driving training and simulation?

| Workload | Consumption option |
|---|---|
| Planned, tightly coupled training for a few weeks | Future reservation in calendar mode (up to 90 days) |
| Large-scale, long-running training on clustered GPUs | Future reservations for capacity blocks (reservations of one year or longer need an attached commitment) |
| Short jobs that can wait for capacity | Flex-start (up to seven days) |
| Independent, restartable simulation tasks | Batch on Spot VMs with automatic task retries |

**Recommendation:** Match each workload to a consumption option instead of buying fixed hardware ([Consumption options for AI Hypercomputer](https://docs.cloud.google.com/ai-hypercomputer/docs/consumption-models), [Automate task retries](https://docs.cloud.google.com/batch/docs/automate-task-retries)).

### 6. How do you meet EU rules for the autonomous platform?

| Option | Fit for KnightMotives |
|---|---|
| Assured Workloads folder with an EU Data Boundary package | Good. Predefined controls for data location, and optional support access controls. |
| Resource location organization policy only | Partial. It limits where new resources are created, but it has no support access controls. |
| CMEK only | Weak. Encryption does not control where data is stored. |

**Recommendation:** Choose the EU package by need. EU Data Boundary sets data location controls only. EU Data Boundary and Support also limits support access to personnel based in the EU. EU Data Boundary with Access Justifications adds data residency and data sovereignty assurances ([Control packages](https://docs.cloud.google.com/assured-workloads/docs/control-packages), [Restrict resource locations](https://docs.cloud.google.com/organization-policy/restrict-locations), [Data residency](https://docs.cloud.google.com/assured-workloads/docs/data-residency)).

### 7. How do you respond to past breaches?

| Option | Fit for KnightMotives |
|---|---|
| Security Command Center Premium, VPC Service Controls, and a tested incident process | Good. Detection, exfiltration controls, and a way to learn from incidents. |
| Broad Owner access for the security team | Weak. It increases the impact of a stolen account. |
| Fewer audit logs | Weak. It removes evidence for incident response. |

**Recommendation:** Activate Security Command Center Premium at the organization level. Put data projects in VPC Service Controls perimeters, and hold blameless post-incident reviews ([Security Command Center service tiers](https://docs.cloud.google.com/security-command-center/docs/service-tiers), [Manage incidents and problems](https://docs.cloud.google.com/architecture/framework/operational-excellence/manage-incidents-and-problems)).

### 8. How do you give dealers and technicians better tools without new equipment?

| Option | Fit for KnightMotives |
|---|---|
| Gemini Enterprise with connectors to manuals and dealer systems | Good. Prebuilt connectors, permissions-aware search, and web and mobile apps. |
| A custom retrieval app on Gemini Enterprise Agent Platform (formerly Vertex AI) | Works, but KnightMotives builds and operates it. |
| New tablets with offline apps | Breaks the dealer budget constraint. |

**Recommendation:** Deploy Gemini Enterprise for technicians and sales staff, and use Gemini Notebook Enterprise for focused research on selected documents ([What is Gemini Enterprise?](https://docs.cloud.google.com/gemini/enterprise/docs), [What is Gemini Notebook Enterprise?](https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/overview)).

## Likely exam angles

| Phrase in the case | Points to | Trap |
|---|---|---|
| "gradually modernizing or replacing legacy systems" | Mainframe Assessment Tool first, then phased moves | A big-bang rewrite with one cutover. |
| "online ordering system, which is unreliable" | Pub/Sub between the website and the ERP | Longer timeouts or more web servers: the ERP stays the bottleneck. |
| "improve connectivity between plants and headquarters" | NCC site-to-site data transfer over Cloud Interconnect | VPC Network Peering: it connects VPC networks, not external sites. |
| "some applications on major cloud platforms" | Cross-Cloud Interconnect | Dedicated Interconnect: it connects on-premises networks. |
| "real-time AI features and data transmission" | Pub/Sub and Bigtable | One relational database for all telemetry. |
| "robust simulation environment" | Batch on Spot VMs with task retries | Standard VMs sized for peak with a self-managed scheduler. |
| "scalable AI/ML infrastructure" | AI Hypercomputer consumption options, such as calendar mode | Flex-start for a multi-week run: its capacity is best-effort, and it runs for up to seven days. |
| "monetize corporate data" with "strict data security and privacy" | Data clean rooms | Standard sharing of full tables, or CSV exports. |
| "corporate data remains siloed" | Knowledge Catalog | Cloud Asset Inventory: it inventories resource metadata, not data quality or lineage. |
| "European Union (EU) data protection regulations" | Assured Workloads EU Data Boundary packages | CMEK alone, or a location policy when support access controls are also needed. |
| "past data breaches" | Security Command Center Premium and VPC Service Controls | The Enterprise tier: Google lists it as deprecated. |
| "Dealers have no budget for new equipment." | Gemini Enterprise and web apps | New tablets or on-premises servers at dealers. |
| "employee upskilling" | Google Cloud Adoption Framework assessment | Outsource all cloud work. |

Sources: [Mainframe modernization overview](https://docs.cloud.google.com/mainframe-assessment-tool/docs/mainframe-modernization-overview), [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview), [Site-to-site data transfer overview](https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/concepts/data-transfer), [VPC Network Peering](https://docs.cloud.google.com/vpc/docs/vpc-peering), [Cross-Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview), [Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/overview), [Cloud Asset Inventory overview](https://docs.cloud.google.com/asset-inventory/docs/asset-inventory-overview), [Bigtable overview](https://docs.cloud.google.com/bigtable/docs/overview), [Get started with Batch](https://docs.cloud.google.com/batch/docs/get-started), [Consumption options for AI Hypercomputer](https://docs.cloud.google.com/ai-hypercomputer/docs/consumption-models), [Share sensitive data with data clean rooms](https://docs.cloud.google.com/bigquery/docs/data-clean-rooms), [Knowledge Catalog overview](https://docs.cloud.google.com/knowledge-catalog/docs/introduction), [Control packages](https://docs.cloud.google.com/assured-workloads/docs/control-packages), [Security Command Center service tiers](https://docs.cloud.google.com/security-command-center/docs/service-tiers), [What is Gemini Enterprise?](https://docs.cloud.google.com/gemini/enterprise/docs), [Migrate to Google Cloud: Get started](https://docs.cloud.google.com/architecture/migration-to-gcp-getting-started).

## Read in the docs

1. [Mainframe modernization overview](https://docs.cloud.google.com/mainframe-assessment-tool/docs/mainframe-modernization-overview) — the phased mainframe path and its tools (about 12 min)
2. [Site-to-site data transfer overview](https://docs.cloud.google.com/network-connectivity/docs/network-connectivity-center/concepts/data-transfer) — Google's network as a WAN between sites (about 8 min)
3. [Cross-Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/cci-overview) — private links to other clouds (about 10 min)
4. [What is Pub/Sub?](https://docs.cloud.google.com/pubsub/docs/overview) — decoupling and event ingestion (about 10 min)
5. [Bigtable overview](https://docs.cloud.google.com/bigtable/docs/overview) — time-series and IoT data (about 10 min)
6. [Consumption options for AI Hypercomputer](https://docs.cloud.google.com/ai-hypercomputer/docs/consumption-models) — reservations, Flex-start, Spot, and on-demand (about 12 min)
7. [Share sensitive data with data clean rooms](https://docs.cloud.google.com/bigquery/docs/data-clean-rooms) — privacy-safe data sharing (about 10 min)
8. [Control packages](https://docs.cloud.google.com/assured-workloads/docs/control-packages) — EU data boundary options (about 10 min)
9. [Security Command Center service tiers](https://docs.cloud.google.com/security-command-center/docs/service-tiers) — what each tier includes (about 8 min)
10. [Manage incidents and problems](https://docs.cloud.google.com/architecture/framework/operational-excellence/manage-incidents-and-problems) — incident roles and post-incident reviews (about 10 min)

## Related notes

- [Planning a migration](note:1.4-migration-planning) — phased modernization of legacy systems
- [Data and system migration tooling](note:5.1-migration-tooling) — Mainframe Connector
- [Hybrid and multicloud connectivity](note:2.1-hybrid-multicloud) — NCC and Cross-Cloud Interconnect
- [Choosing data processing solutions](note:1.3-data-processing) — Pub/Sub, Dataflow, and Bigtable
- [High availability, scalability, and performance](note:1.2-ha-scalability-performance) — decoupling with queues
- [AI Hypercomputer: accelerators and consumption models](note:2.4-ai-hypercomputer) — training capacity
- [Configuring Compute Engine for resilience and operations](note:2.3-compute-engine-ops) — Spot VMs and Batch
- [Pre-trained AI APIs, Gemini Enterprise, and Model Garden](note:2.5-ai-apis-and-gemini-enterprise) — tools for dealers and technicians
- [Organization policy, VPC Service Controls, and audit logging](note:3.1-security-controls) — perimeters and detection
- [Designing for compliance](note:3.2-compliance) — EU data residency
- [Business processes: stakeholders, change, skills, and decisions](note:4.2-business-processes) — upskilling
- [The operational excellence pillar](note:6.1-operational-excellence) — incident management
- Labs: [Streaming ingestion: Pub/Sub to BigQuery](lab:23-streaming-pipeline), [Regional MIG with autohealing, autoscaling, rolling updates, and Spot VMs](lab:30-mig-autoscaling-spot), [Organization policy and VPC Service Controls](lab:54-org-policy-vpc-sc), [Simulate hybrid connectivity with HA VPN and Cloud Router](lab:12-ha-vpn-hybrid)
