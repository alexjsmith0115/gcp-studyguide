---
id: cymbal-analysis
caseStudy: cymbal
minutes: 25
---

## Summary

Cymbal is an online retailer that grows fast and sells a large assortment of products across several retail sub-verticals. Manual management of its extensive product catalog is time-consuming and error-prone. Cymbal wants change in three areas: catalog and content enrichment with generative AI, conversational commerce with product discovery, and technical stack modernization. The current environment mixes on-premises and cloud systems, four database engines, Kubernetes clusters, SFTP and ETL batch integrations, and an IVR. Data silos limit a unified view of the customer journey, and new technologies are difficult to integrate. The executive statement names "Google Cloud's Generative AI for Digital Commerce solutions", which points to managed commerce products instead of custom builds.

## Requirements map

### Business requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "Automate Product Catalog Enrichment: Reduce manual effort, minimize errors…" | Gemini on Gemini Enterprise Agent Platform (formerly Vertex AI) with a response schema; Gemini batch inference (formerly batch prediction) for bulk runs; associate review before publication | A response schema makes the output always follow the defined structure. Batch inference suits large, non-urgent jobs. | [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output), [Batch inference with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference) |
| "Improve Product Discoverability: Enhance search relevance…" | AI Commerce Search (formerly Vertex AI Search for commerce, earlier Retail Search) | It gives Google-quality search, browse, and recommendations for ecommerce, and it reduces search abandonment and "No Results Found". | [What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it), [AI Commerce Search release notes](https://docs.cloud.google.com/retail/docs/release-notes) |
| "Increase Customer Engagement: Create a more interactive and personalized shopping experience…" | The Conversational agent of AI Commerce Search | Shoppers use natural language with follow-up questions instead of keywords. | [Conversational agent overview](https://docs.cloud.google.com/retail/conversational_search_backup/conversational-search) |
| "Drive Sales Conversion…" | AI Commerce Search ranking and recommendations | Search optimized for product ranking increases click-through, order value, and conversions. | [What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it) |
| "Reduce costs: Reduce call center staffing costs…" | A CX Agent Studio (the evolution of Dialogflow CX) voice agent on a Google Telephony Platform number; Agent Assist for the human agents | CX Agent Studio agents take on more inquiries, so human representatives focus on specialized calls. Agent Assist helps humans resolve issues faster. | [Gemini Enterprise for CX](https://docs.cloud.google.com/gemini-enterprise-cx), [CX Agent Studio](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio), [Google Telephony Platform](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/deploy/google-telephony-platform) |
| "…and data-center hosting costs." | Managed databases (Cloud SQL, Memorystore for Valkey, Firestore with MongoDB compatibility), GKE Autopilot, and committed use discounts for steady load | Memorystore for Valkey removes manual OS patching, replication setup, and custom backup scripts. In Autopilot, Google manages the nodes. CUDs discount predictable use. | [Migrate Redis and Valkey workloads](https://docs.cloud.google.com/memorystore/docs/valkey/migrate-workloads), [GKE Autopilot overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview), [Committed use discounts](https://docs.cloud.google.com/docs/cuds) |

### Technical requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "Attribute Generation: Accurately derive relevant product attributes… align with the product category and Cymbal's existing catalog structure." | Gemini with text and image input and a response schema that lists the allowed attribute values per category | A response schema can restrict the model to user-defined labels instead of labels that the model invents. | [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output) |
| "Image Generation and Enhancement: Generate different product image variations from a base image…" | Gemini image models on Agent Platform, such as Gemini 3 Pro Image (GA), with multi-turn image editing | Google calls Gemini 3 Pro Image the best model for complex and multi-turn image generation and editing. The Imagen editing pages are deprecated. | [Gemini 3 Pro Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro-image), [Imagen documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/imagen-links) |
| "Automate Product Discovery: Process customer requests expressed in natural language…" | The Conversational agent of AI Commerce Search, with the Search API for product results | The Conversational API suggests refinements, and you call the Search API for the products. | [Conversational agent overview](https://docs.cloud.google.com/retail/conversational_search_backup/conversational-search) |
| "Scalability and Performance… extensive product catalog… anticipated growth" | AI Commerce Search (fully managed); BigQuery catalog import; Provisioned Throughput for the baseline of real-time Gemini traffic | Google handles training, load balancing, and provisioning for AI Commerce Search. BigQuery import has no data limit. | [What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it), [Import catalog information](https://docs.cloud.google.com/retail/docs/upload-catalog), [Consumption options](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/consumption-options) |
| "Human-in-the-Loop (HITL) Review: Provide a user interface (UI) for associates…" | A review UI on Cloud Run with IAP; a workflow in Workflows that waits on a callback for each decision | IAP secures a Cloud Run service directly. Workflows callbacks wait for human interaction without polling. | [Configure IAP for Cloud Run](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run), [Wait using callbacks](https://docs.cloud.google.com/workflows/docs/creating-callback-endpoints) |
| "Data Security and Compliance… interactions with virtual agents…" | Redaction with Sensitive Data Protection (DLP) in CX Agent Studio; a hosted payment page for card data; pseudonymization for downstream data | Redaction runs before conversation data is written to storage. A fully outsourced payment page keeps card data away from Cymbal. | [Conversation history](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/conversation-history), [PCI Data Security Standard compliance](https://docs.cloud.google.com/architecture/pci-dss-compliance-in-gcp), [Pseudonymization](https://docs.cloud.google.com/sensitive-data-protection/docs/pseudonymization) |

### Other stated needs (solution concept and environment)

| Stated need | Google Cloud solution | Why | Source |
|---|---|---|---|
| "3rd party integrations", "data transfer, error handling and remediation", "SFTP file transfers, ETL batch processing" | Application Integration with Integration Connectors (SFTP connector) and task retry strategies; Dataflow for large batch ETL | An iPaaS with prebuilt connectors, schedule or event triggers, and per-task error handling. The Connectors task supports payloads of up to 10 MB. | [Application Integration overview](https://docs.cloud.google.com/application-integration/docs/overview), [SFTP connector](https://docs.cloud.google.com/integration-connectors/docs/connectors/sftp/configure), [Error handling strategies](https://docs.cloud.google.com/application-integration/docs/error-handling-strategy), [Limits](https://docs.cloud.google.com/integration-connectors/docs/quotas), [Dataflow overview](https://docs.cloud.google.com/dataflow/docs/overview) |
| "proactive monitoring and security"; "Grafana, Nagios, and Elastic" | Cloud Monitoring synthetic monitors and uptime checks with alerting policies; Ops Agent; Managed Service for Prometheus for Grafana users | Synthetic monitors test a sequence such as an ecommerce checkout and alert on failure. | [Synthetic monitoring overview](https://docs.cloud.google.com/monitoring/uptime-checks/introduction), [Ops Agent overview](https://docs.cloud.google.com/logging/docs/agent/ops-agent), [Managed Service for Prometheus](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus) |
| "MySQL, Microsoft SQL Server, Redis, and MongoDB" | Database Migration Service to Cloud SQL; Memorystore automated migration to Memorystore for Valkey (only from Redis that runs on Google Cloud), or an RDB import into Memorystore for Redis; Datastream and Dataflow to Firestore with MongoDB compatibility | Each path is a documented migration into a managed service. DMS and the Firestore path keep downtime low. | [Database Migration Service overview](https://docs.cloud.google.com/database-migration/docs/overview), [Memorystore for Valkey release notes](https://docs.cloud.google.com/memorystore/docs/valkey/release-notes), [About importing and exporting data](https://docs.cloud.google.com/memorystore/docs/redis/about-importing-exporting), [Migrate to Firestore with MongoDB compatibility](https://docs.cloud.google.com/firestore/mongodb-compatibility/docs/migrate-data) |
| "data silos limit a unified view of the customer journey" | BigQuery as the shared analytics store, with Datastream replication from MySQL, SQL Server, and MongoDB | Datastream replicates data from operational databases into BigQuery for near real-time insights. The customer data then sits in one place. | [Datastream overview](https://docs.cloud.google.com/datastream/docs/overview) |
| "Kubernetes clusters to run containerized applications" | GKE Autopilot | Google manages nodes, scaling, and security settings. | [GKE Autopilot overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/autopilot-overview) |

## Key design decisions

### 1. Buy AI Commerce Search, or build search on the current databases?

| Option | Fit for Cymbal |
|---|---|
| AI Commerce Search | Good. Fully managed, tuned for ecommerce conversion, with search, browse, recommendations, and a Conversational agent. |
| Keyword queries on the relational databases | Weak. This is today's design. Keyword matching forces shoppers to use exact words. |
| Custom embeddings with Vector Search (formerly Vertex AI Vector Search) on Agent Platform | Possible, but Cymbal then builds the embeddings, ranking, and personalization itself. |

**Recommendation:** Buy. The executive statement asks for Google's digital commerce solutions, and Google operates the models and infrastructure ([What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it), [Conversational agent overview](https://docs.cloud.google.com/retail/conversational_search_backup/conversational-search), [Vector Search](https://docs.cloud.google.com/gemini-enterprise-agent-platform/build/vector-search/overview)).

**About the name "Discovery AI":** The case says that the agents "will utilize Google Cloud's Discovery AI". The AI Commerce Search docs and release notes do not use this name. The mapping to AI Commerce Search is an interpretation. It is the best fit for two reasons. First, the AI Commerce Search product page lists a customer video, "Macy's delivers a personalized shopping experience with Google Cloud Discovery AI". Second, the agents must "retrieve the most relevant products", and AI Commerce Search gives Google-quality search, browse, and recommendations for ecommerce ([AI Commerce Search on Gemini Enterprise for Customer Experience](https://cloud.google.com/gemini-enterprise-cx/commerce), [What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it)).

### 2. How do you make generated attributes fit the catalog structure?

| Option | Fit for Cymbal |
|---|---|
| Gemini with a response schema that lists allowed values | Good. The output always follows the schema, so loads do not fail on invented values. |
| Free-form Gemini output parsed by code | Weak. Output format varies, which brings back errors and manual fixes. |
| Pre-trained Vision or Natural Language labels | Weak. They return generic labels, not Cymbal's attribute names. |

**Recommendation:** Send supplier text and images to Gemini with a response schema per category. Run large jobs, such as the back catalog, as batch inference, the most cost-effective option for high-volume inference ([Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output), [Consumption options](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/consumption-options), [Detect Labels](https://docs.cloud.google.com/vision/docs/labels), [Classifying Content](https://docs.cloud.google.com/natural-language/docs/classifying-text)).

### 3. Which model creates the image variations?

| Option | Fit for Cymbal |
|---|---|
| Gemini image models, such as Gemini 3 Pro Image | Good. GA, and designed for complex and multi-turn editing. |
| Imagen editing (inpaint, background replacement) | Weak. Google lists these pages as deprecated. |
| A custom image model | Weak. Training effort without a stated need. |

**Recommendation:** Use a Gemini image model and let associates refine an image over several turns ([Gemini 3 Pro Image](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro-image), [Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images), [Imagen documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/imagen-links)).

### 4. How do you build the human-in-the-loop review?

| Option | Fit for Cymbal |
|---|---|
| Cloud Run UI with IAP, and Workflows that waits on a callback per item | Good. Serverless UI, employee-only access, and nothing reaches the catalog without a decision. |
| Auto-publish generated content and fix errors later | Breaks the HITL requirement. |
| A VM-based UI behind a VPN | Works, but adds servers and network work. |

**Recommendation:** Keep generated content in a staging store. Publish it only when a callback from the review UI resumes the workflow ([Wait using callbacks](https://docs.cloud.google.com/workflows/docs/creating-callback-endpoints), [Configure IAP for Cloud Run](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)).

### 5. How do you reduce call-center staffing costs?

| Option | Fit for Cymbal |
|---|---|
| CX Agent Studio voice agent on the phone line, with Agent Assist for escalated calls | Good. The agent handles routine calls, and humans get real-time help for the rest. |
| Customer Experience Insights (formerly Conversational Insights) only | Partial. It finds call drivers, but it does not answer calls. |
| A web chat widget only | Partial. The phone volume stays the same. |

**Recommendation:** Put a CX Agent Studio agent on a Google Telephony Platform number, and give human agents Agent Assist ([Gemini Enterprise for CX](https://docs.cloud.google.com/gemini-enterprise-cx), [Deploy agent applications](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/deploy), [Customer Experience Insights release notes](https://docs.cloud.google.com/gemini-enterprise-cx/insights/release-notes)).

### 6. How do you protect customer and payment data in conversations?

| Option | Fit for Cymbal |
|---|---|
| Redaction with a Sensitive Data Protection inspect template | Good. Sensitive data is scrubbed before any write. |
| Hosted third-party payment page | Good for cards. Cymbal "can't touch customer card data in any way" (SAQ A). |
| Encryption of stored transcripts only | Partial. The data is still stored. |

**Recommendation:** Enable redaction and send card payments to a hosted payment page. Use pseudonymization for PII that downstream systems need ([Conversation history](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/conversation-history), [Package google.cloud.ces.v1](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/reference/rpc/google.cloud.ces.v1#redactionconfig), [PCI Data Security Standard compliance](https://docs.cloud.google.com/architecture/pci-dss-compliance-in-gcp), [Pseudonymization](https://docs.cloud.google.com/sensitive-data-protection/docs/pseudonymization)).

### 7. Which targets and tools move the databases?

| Source | Target and tool |
|---|---|
| MySQL, SQL Server | Cloud SQL for MySQL and Cloud SQL for SQL Server with Database Migration Service |
| Redis | Memorystore for Valkey with the Memorystore automated migration (only from Redis that runs on Google Cloud). For Redis in the data center: RDB files imported from Cloud Storage into Memorystore for Redis |
| MongoDB | Firestore with MongoDB compatibility, with Datastream and Dataflow |

**Recommendation:** Use homogeneous migrations for MySQL and SQL Server. They keep the database engine, so application changes stay small. Firestore with MongoDB compatibility is a different engine, but it accepts existing MongoDB application code and drivers. The Memorystore automated migration works only from Redis that already runs on Google Cloud. For Redis in the data center, export RDB files to Cloud Storage and import them into Memorystore for Redis ([Database Migration Service overview](https://docs.cloud.google.com/database-migration/docs/overview), [Migrate your SQL Server databases](https://docs.cloud.google.com/database-migration/docs/sqlserver/guide), [Migrate Redis and Valkey workloads](https://docs.cloud.google.com/memorystore/docs/valkey/migrate-workloads), [Memorystore for Valkey release notes](https://docs.cloud.google.com/memorystore/docs/valkey/release-notes), [About importing and exporting data](https://docs.cloud.google.com/memorystore/docs/redis/about-importing-exporting), [Firestore with MongoDB compatibility overview](https://docs.cloud.google.com/firestore/mongodb-compatibility/docs/overview)).

### 8. How do you replace the SFTP and ETL integrations?

| Option | Fit for Cymbal |
|---|---|
| Application Integration with the SFTP connector and retry strategies | Good. Managed, with prebuilt connectors, triggers, and error handling. |
| Lift the ETL scripts to a VM with cron | Weak. Manual remediation stays. |
| Custom Cloud Run functions (formerly Cloud Functions) per supplier | Works, but Cymbal writes and maintains the retry logic. |

**Recommendation:** Application Integration, because the case targets cost "around manual processes, data transfer, error handling and remediation". The Connectors task supports payloads of up to 10 MB, so run large batch ETL jobs in Dataflow ([Application Integration overview](https://docs.cloud.google.com/application-integration/docs/overview), [Error handling strategies](https://docs.cloud.google.com/application-integration/docs/error-handling-strategy), [Limits](https://docs.cloud.google.com/integration-connectors/docs/quotas), [Dataflow overview](https://docs.cloud.google.com/dataflow/docs/overview)).

## Likely exam angles

| Phrase in the case | Points to | Trap |
|---|---|---|
| "Google Cloud's Discovery AI" | AI Commerce Search (an interpretation: the docs do not use the name "Discovery AI"; see decision 1) | Agent Search (formerly Vertex AI Search) with a website data store: it is not the commerce product with catalog, events, and conversion ranking. |
| "querying the relational databases for names and categories" | Replace keyword search with AI Commerce Search | Tuning SQL full-text indexes: still rigid keyword matching. |
| "align with… Cymbal's existing catalog structure" | Response schema with enum values | Free-form prompts plus regex parsing: output varies, so errors return. |
| "Image Generation and Enhancement" | Gemini image models | Imagen editing features: Google lists the Imagen pages as deprecated. |
| "Human-in-the-Loop (HITL) Review" | Staging plus a review UI and a callback-driven workflow | Any design that writes generated content straight to the catalog. |
| "Reduce call center staffing costs" | CX Agent Studio on the phone line plus Agent Assist | A web chat widget only: phone calls keep coming. |
| "interactions with virtual agents… handled securely" | Redaction before persistence | CMEK alone: encryption does not remove the data from transcripts. |
| "comply with relevant industry regulations" (payments) | Hosted payment page (SAQ A) | Collecting card numbers in chat and encrypting them: Cymbal is then in full PCI scope. |
| "SFTP file transfers, ETL batch processing" | Application Integration with the SFTP connector; Dataflow for large batch ETL | Moving the scripts to a VM with cron: manual rework remains. |
| "proactive monitoring" | Synthetic monitors on the checkout journey | An uptime check on the home page: each check is one independent request, not a multi-step checkout test. |
| Bulk enrichment of the whole catalog | Gemini batch inference | Online calls in a loop: pay the standard rate and manage rate limits in code. |

Sources: [What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it), [AI Commerce Search on Gemini Enterprise for Customer Experience](https://cloud.google.com/gemini-enterprise-cx/commerce), [Gemini Enterprise Agent Platform name changes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes), [Conversational agent overview](https://docs.cloud.google.com/retail/conversational_search_backup/conversational-search), [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output), [Imagen documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/imagen-links), [Wait using callbacks](https://docs.cloud.google.com/workflows/docs/creating-callback-endpoints), [Gemini Enterprise for CX](https://docs.cloud.google.com/gemini-enterprise-cx), [Conversation history](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/conversation-history), [PCI Data Security Standard compliance](https://docs.cloud.google.com/architecture/pci-dss-compliance-in-gcp), [Application Integration overview](https://docs.cloud.google.com/application-integration/docs/overview), [Dataflow overview](https://docs.cloud.google.com/dataflow/docs/overview), [Synthetic monitoring overview](https://docs.cloud.google.com/monitoring/uptime-checks/introduction), [Batch inference with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference).

## Read in the docs

1. [What is AI Commerce Search?](https://docs.cloud.google.com/retail/docs/what-is-it) — what the managed commerce search does for developers and the business (about 8 min)
2. [Conversational agent overview](https://docs.cloud.google.com/retail/conversational_search_backup/conversational-search) — natural-language product discovery and the two-API model (about 10 min)
3. [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output) — response schemas and enum labels for attribute generation (about 10 min)
4. [Consumption options](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/consumption-options) — Provisioned Throughput, PayGo, Flex, and batch compared (about 10 min)
5. [Edit images with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-edit-images) — the current image editing path (about 6 min)
6. [Gemini Enterprise for CX](https://docs.cloud.google.com/gemini-enterprise-cx) — CX Agent Studio, Agent Assist, and Customer Experience Insights (about 5 min)
7. [Conversation history (CX Agent Studio)](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio/conversation-history) — redaction and storage of conversation data (about 6 min)
8. [PCI Data Security Standard compliance](https://docs.cloud.google.com/architecture/pci-dss-compliance-in-gcp) — SAQ types and how to reduce scope (about 20 min)
9. [Database Migration Service overview](https://docs.cloud.google.com/database-migration/docs/overview) — continuous and homogeneous migrations (about 8 min)
10. [Import catalog information](https://docs.cloud.google.com/retail/docs/upload-catalog) — BigQuery import and daily refresh (about 10 min)

## Related notes

- [Choosing AI and ML solutions](note:1.3-ai-solutions) — managed commerce AI compared with custom models
- [Pre-trained AI APIs, Gemini Enterprise, and Model Garden](note:2.5-ai-apis-and-gemini-enterprise) — conversational agents and image models
- [End-to-end ML workflows on Agent Platform](note:2.4-ml-workflows) — batch inference and consumption models
- [Business requirements, trade-offs, and success measures](note:1.1-business-requirements) — build or buy, and conversion KPIs
- [Integration patterns and data movement](note:1.1-integration-and-data-movement) — replacing SFTP and ETL
- [Planning a migration](note:1.4-migration-planning) — database migration waves
- [Data and system migration tooling](note:5.1-migration-tooling) — Database Migration Service and Datastream
- [Configuring Cloud Run, Cloud Run functions, and VMware Engine networking](note:2.3-serverless) — the review UI on Cloud Run with IAP
- [Securing AI workloads](note:3.1-securing-ai) — Sensitive Data Protection and Model Armor
- [Designing for compliance](note:3.2-compliance) — PCI DSS and PII
- [Cost optimization and CapEx/OpEx](note:4.2-cost-optimization) — committed use discounts and hosting costs
- [Google Cloud Observability](note:6.2-observability) — synthetic monitors and uptime checks
- Labs: [Call Gemini on Agent Platform](lab:40-gemini-api), [Sensitive Data Protection and Model Armor](lab:55-sdp-model-armor), [Cloud Run revisions, traffic splitting, ingress, and Direct VPC egress](lab:32-cloud-run-networking)
