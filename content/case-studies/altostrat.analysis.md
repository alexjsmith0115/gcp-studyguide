---
id: altostrat-analysis
caseStudy: altostrat
minutes: 25
---

## Summary

Altostrat is a media company with a large library of podcasts, interviews, news broadcasts, and documentaries. Most of its platform already runs on Google Cloud. It uses GKE for content management and delivery, Cloud Storage for media, BigQuery for analytics, and Cloud Run functions (formerly Cloud Functions) for event-driven tasks. The main change driver is generative AI: Altostrat wants summaries, metadata extraction, content moderation, recommendations, and a 24/7 natural-language support agent. A second driver is the hybrid estate, because legacy on-premises systems still run content ingestion and archival. The executive statement gives the tie-breakers for every design choice: "Reliability and cost management are our top priorities."

## Requirements map

### Business requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "Accelerate and enhance the reliability of operational workflows across all environments. [Google Cloud + On-premises]" | GKE fleet management for cloud and on-premises clusters, Config Sync, Google Cloud Managed Service for Prometheus | A fleet groups clusters so you manage them together. Config Sync syncs configuration from Git and prevents drift. Managed Service for Prometheus collectors run in other clouds and on-premises. | [Fleet management](https://docs.cloud.google.com/kubernetes-engine/docs/fleets-overview), [Config Sync overview](https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/overview), [Google Cloud Managed Service for Prometheus](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus) |
| "Simplify infrastructure management for rapid application deployment." | GKE Autopilot for new cloud clusters, Cloud Deploy for release promotion | Autopilot gives fully managed nodes. Cloud Deploy is a managed service that promotes releases through a defined sequence of targets. | [GKE overview](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/kubernetes-engine-overview), [Overview of Cloud Deploy](https://docs.cloud.google.com/deploy/docs/overview) |
| "Optimize cloud storage costs while maintaining high availability and scalability for media content." | Autoclass on the media buckets; multi-region bucket location | Autoclass moves objects that are not accessed to colder classes and moves accessed objects back to Standard. Multi-region buckets fail over automatically on a regional failure. | [Autoclass](https://docs.cloud.google.com/storage/docs/autoclass), [Bucket locations](https://docs.cloud.google.com/storage/docs/locations) |
| "Enable natural language interaction with the platform with 24/7 user support." | CX Agent Studio in Gemini Enterprise for Customer Experience (formerly Customer Engagement Suite and Contact Center AI) | CX Agent Studio builds agents that combine generative AI with deterministic steps for self-service. | [Gemini Enterprise for CX](https://docs.cloud.google.com/gemini-enterprise-cx), [CX Agent Studio](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio), [Google Cloud Platform Services Summary](https://cloud.google.com/terms/services) |
| "Automatically generate concise summaries of media content." | Gemini models on Gemini Enterprise Agent Platform (formerly Vertex AI) with audio and video input | Gemini models understand text, video, audio, and images natively. One request can summarize a video with audio. | [Long context](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/long-context), [Video understanding](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/video-understanding) |
| "Extract rich metadata from media assets using NLP and computer vision." | Gemini multimodal prompts; Video Intelligence API for shot-level and frame-level annotations | Video Intelligence annotates videos per video, segment, shot, and frame. Gemini can enrich metadata with multimodal understanding. | [Video Intelligence API documentation](https://docs.cloud.google.com/video-intelligence/docs), [Long context](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/long-context) |
| "Detect and filter inappropriate content." | Gemini as a content moderation model with Altostrat's own policy; Vision SafeSearch and Video Intelligence explicit content detection as extra signals | Gemini analyzes text, images, video, and audio and can apply a custom policy. The pre-trained APIs use fixed categories. | [Gemini for safety filtering and content moderation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-for-filtering-and-moderation), [Detect explicit content (SafeSearch)](https://docs.cloud.google.com/vision/docs/detecting-safe-search) |
| "Analyze media content to identify trends and extract insights." | BigQuery object tables over the Cloud Storage media, with `AI.GENERATE` | Object tables let you analyze unstructured data in Cloud Storage and join the results with structured data. `AI.GENERATE` reads only the first two minutes of a video. For long videos, write Gemini batch inference (formerly batch prediction) output to a BigQuery table and analyze that. | [Introduction to object tables](https://docs.cloud.google.com/bigquery/docs/object-table-introduction), [Generative AI overview (BigQuery)](https://docs.cloud.google.com/bigquery/docs/generative-ai-overview), [The AI.GENERATE function](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/bigqueryml-syntax-ai-generate), [Batch inference with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference), [Batch inference for BigQuery](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference/new-job-from-bigquery) |
| "Inform content strategy and decision-making with data." | BigQuery as the single analytics store for engagement data and AI-derived content features | Joining content features with viewing data in the existing warehouse avoids a new data silo. | [Introduction to object tables](https://docs.cloud.google.com/bigquery/docs/object-table-introduction) |

### Technical requirements

| Requirement | Google Cloud solution | Why | Source |
|---|---|---|---|
| "Modernize CI/CD for containerized deployments with a centralized management platform." | Cloud Build, Artifact Registry, and Cloud Deploy; Config Sync for fleet-wide configuration | Artifact Registry is one location for images. Cloud Deploy promotes releases in order and can target on-premises clusters through Connect gateway. | [Overview of Cloud Build](https://docs.cloud.google.com/build/docs/overview), [Artifact Registry overview](https://docs.cloud.google.com/artifact-registry/docs/overview), [Deploy to GKE attached clusters](https://docs.cloud.google.com/deploy/docs/anthos-targets) |
| "Secure, high-performance hybrid cloud connectivity for data ingestion." | Dedicated Interconnect with MACsec for Cloud Interconnect; HA VPN over Cloud Interconnect if IPsec is mandatory | Interconnect traffic does not use the public internet, and capacity scales. MACsec encrypts traffic between the on-premises router and Google's edge routers. | [Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/overview), [MACsec for Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview) |
| "Provide scalable, performant kubernetes environments both on-premises and in the cloud." | GKE in the cloud; Google Distributed Cloud (software only) for bare metal (formerly Google Distributed Cloud Virtual and Anthos clusters on bare metal) on-premises; one fleet for each environment | Distributed Cloud runs GKE clusters on your own servers, including GPU and SSD hardware. You manage them in Google Cloud as part of a fleet. | [Distributed Cloud software only for bare metal overview](https://docs.cloud.google.com/kubernetes-engine/distributed-cloud/bare-metal/docs/concepts/about-bare-metal), [Plan fleet resources](https://docs.cloud.google.com/kubernetes-engine/fleet-management/docs/fleet-concepts/plan-fleets) |
| "Optimize cloud storage costs for growing media volumes." | Autoclass where access is unpredictable; Archive storage for known archive data | Autoclass is not recommended when data clearly fits one class. Archive storage is the lowest-cost class for data read less than once a year. | [Autoclass](https://docs.cloud.google.com/storage/docs/autoclass), [Storage classes](https://docs.cloud.google.com/storage/docs/storage-classes) |
| "Design AI-powered detection of harmful content." | Gemini moderation for the media library; Model Armor for chatbot prompts and responses | Gemini can apply custom moderation policies. Model Armor screens LLM prompts and responses against prompt injection, jailbreaks, and unsafe content. | [Gemini for safety filtering and content moderation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-for-filtering-and-moderation), [Model Armor overview](https://docs.cloud.google.com/model-armor/overview) |
| "Ensure that AI systems are auditable and their decisions can be explained" | Data Access audit logs for Agent Platform; Gemini reasoning in moderation output; for a custom model, open-source SHAP or LIME | You must enable Data Access audit logs explicitly. Gemini can explain its reasoning. Google deprecated Vertex Explainable AI on March 16, 2026, and suggests SHAP or LIME instead. | [Agent Platform audit logging information](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/general/audit-logging), [Gemini for safety filtering and content moderation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-for-filtering-and-moderation), [Vertex AI deprecations](https://docs.cloud.google.com/vertex-ai/docs/deprecations) |
| "Leverage LLMs and conversational AI for personalized experiences and content virality." | Agent Search media recommendations (formerly recommendations from Vertex AI Search); Gemini models for generated experiences | Media recommendations use user events and optimization objectives, such as click-through rate or conversion rate. | [Introduction to media search and recommendations](https://docs.cloud.google.com/generative-ai-app-builder/docs/about-media) |
| "Develop advanced chatbots with natural language understanding to provide personalized assistance." | CX Agent Studio for a minimal-code agent. For a code-first agent, Agent Development Kit (ADK) on Agent Runtime (formerly Vertex AI Agent Engine). Add Memory Bank (formerly Vertex AI Agent Engine Memory Bank). | CX Agent Studio is the evolution of Dialogflow CX. Memory Bank lets an agent recall information across sessions. | [CX Agent Studio](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio), [Agent Platform overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/overview), [Gemini Enterprise Agent Platform name changes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes) |
| "Automated summarization for diverse media." | Gemini multimodal models; Gemini batch inference for the back catalog | Batch inference costs less than real-time inference and suits large, non-urgent jobs. | [Batch inference with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference) |

## Key design decisions

### 1. One multimodal model, or a chain of single-purpose APIs for summaries and metadata?

| Option | Fit for Altostrat |
|---|---|
| Gemini on Agent Platform with the media file as input | Good. One model reads the audio and the pictures together. Fewest components. |
| Speech-to-Text, then a text model, then Video Intelligence | Weak. Google says that a chain of a speech-to-text model and a text model adds latency and lowers performance. |
| Custom summarization model | Weak. No stated need, and it adds training and serving work. |

**Recommendation:** Send the media from Cloud Storage to a Gemini model. Use batch inference for the existing library, because batch costs less and has higher rate limits than real-time calls ([Long context](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/long-context), [Batch inference with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference)).

### 2. How should Altostrat detect harmful content in audio and video?

| Option | Fit for Altostrat |
|---|---|
| Gemini as a moderation model with Altostrat's policy in the system instruction | Good. It reads audio, video, images, and text, applies custom policies, and can explain its reasoning. |
| Video Intelligence explicit content detection | Partial. It detects adult content per frame and uses visual content only. It ignores the audio of a podcast. |
| Vision SafeSearch | Partial. Images only, with five fixed categories. |
| Natural Language API `moderateText` | Partial. Text only, so it needs a transcript and misses on-screen content. |

**Recommendation:** Use Gemini with Altostrat's policy, temperature 0, and JSON output. Use human-in-the-loop evaluation to check the results against the policy ([Gemini for safety filtering and content moderation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-for-filtering-and-moderation), [AI and ML perspective: Operational excellence](https://docs.cloud.google.com/architecture/framework/perspectives/ai-ml/operational-excellence), [Detect explicit content in videos](https://docs.cloud.google.com/video-intelligence/docs/analyze-safesearch), [Detect explicit content (SafeSearch)](https://docs.cloud.google.com/vision/docs/detecting-safe-search), [Moderate text](https://docs.cloud.google.com/natural-language/docs/moderating-text)).

### 3. Autoclass, lifecycle rules, or a fixed storage class?

| Option | Fit for Altostrat |
|---|---|
| Autoclass | Good for the live library. Nobody can predict which items stay popular. |
| Lifecycle rules by object age | Good for data with a known pattern. Poor for popular old items, which then pay retrieval fees. |
| Archive storage class | Good for the archival workflow, where data is read less than once a year. |

**Recommendation:** Enable Autoclass on the live media buckets. Put known archive content in an Archive-class bucket. Google does not recommend Autoclass when you know which objects fit which class. It also does not recommend Autoclass when other Google Cloud services read the bucket regularly, so run the AI analysis once per object ([Autoclass](https://docs.cloud.google.com/storage/docs/autoclass), [Storage classes](https://docs.cloud.google.com/storage/docs/storage-classes)).

### 4. How do you run Kubernetes on-premises and in the cloud with one control point?

| Option | Fit for Altostrat |
|---|---|
| Google Distributed Cloud (software only) for bare metal, registered to a fleet with the GKE clusters | Good. GKE clusters run on Altostrat's own servers and are managed in Google Cloud as part of a fleet. |
| Google Distributed Cloud (software only) for VMware (formerly part of Anthos) | Good only if the site already runs vSphere. The case does not say so. |
| Self-managed upstream Kubernetes on-premises | Weak. Altostrat must operate the Kubernetes distribution itself. |
| Move all workloads to GKE in the cloud | Breaks the requirement for on-premises environments. |

**Recommendation:** Use Distributed Cloud for bare metal for the workloads that stay on-premises. Register the cloud and on-premises clusters of each environment, such as production, to one fleet for that environment. Google says that a fleet should contain clusters from only one environment ([Distributed Cloud software only for bare metal overview](https://docs.cloud.google.com/kubernetes-engine/distributed-cloud/bare-metal/docs/concepts/about-bare-metal), [Fleet management](https://docs.cloud.google.com/kubernetes-engine/docs/fleets-overview), [Plan fleet resources](https://docs.cloud.google.com/kubernetes-engine/fleet-management/docs/fleet-concepts/plan-fleets), [Google Distributed Cloud (software only) for VMware overview](https://docs.cloud.google.com/kubernetes-engine/distributed-cloud/vmware/docs/overview)).

### 5. Which hybrid link carries the ingestion traffic?

| Option | Fit for Altostrat |
|---|---|
| Dedicated Interconnect with MACsec | Good. High throughput, no public internet, and encryption between the on-premises router and Google's edge. |
| HA VPN over Cloud Interconnect | Good when the security team requires IPsec end to end. |
| HA VPN over the internet | Weak. Google positions Cloud VPN for lower bandwidth needs. |
| Direct Peering | Weak. Google recommends Cloud Interconnect instead. |

**Recommendation:** Dedicated Interconnect with MACsec. Add HA VPN over Cloud Interconnect only if policy requires IPsec, because MACsec does not encrypt traffic inside Google ([MACsec for Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview), [Choosing a Network Connectivity product](https://docs.cloud.google.com/network-connectivity/docs/how-to/choose-product)).

### 6. Build or buy the support agent and the recommendations?

| Option | Fit for Altostrat |
|---|---|
| CX Agent Studio | Good for a 24/7 support agent that non-developers maintain. Minimal code, generative plus deterministic steps. |
| ADK on Agent Runtime with Memory Bank | Good for a code-first agent with memory across sessions. Needs developers. |
| Agent Search media recommendations | Good for "what to watch next". Managed, trained on user events, tuned by an optimization objective. |
| Custom recommendation model on Agent Platform | Possible, but it adds model work that the case does not ask for. |

**Recommendation:** Buy before you build. Use CX Agent Studio for support and Agent Search media recommendations for discovery. This follows the "reliability and cost management" priority ([CX Agent Studio](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio), [Introduction to media search and recommendations](https://docs.cloud.google.com/generative-ai-app-builder/docs/about-media)).

### 7. How do you make the AI auditable and explainable?

| Option | Fit for Altostrat |
|---|---|
| Data Access audit logs for Agent Platform | Records who read or wrote data, including prediction calls. You must enable them. |
| Vertex Explainable AI feature attributions | Deprecated since March 16, 2026. The APIs stop on March 16, 2027. Google suggests open-source SHAP or LIME instead. |
| Model Monitoring (formerly Vertex AI Model Monitoring) | Tracks drift over time. It does not explain a single prediction. |
| Request-response logging to BigQuery (Preview) | Keeps samples of Gemini prompts and answers for review. |

**Recommendation:** Enable Data Access audit logs. Ask Gemini to return its reasoning for moderation decisions. For a custom model, use SHAP or LIME, because Vertex Explainable AI is deprecated ([Agent Platform audit logging information](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/general/audit-logging), [Gemini for safety filtering and content moderation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-for-filtering-and-moderation), [Vertex AI deprecations](https://docs.cloud.google.com/vertex-ai/docs/deprecations), [Introduction to Model Monitoring](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/model-monitoring/overview), [Log and share requests and responses](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/request-response-logging)).

## Likely exam angles

| Phrase in the case | Points to | Trap |
|---|---|---|
| "across all environments. [Google Cloud + On-premises]" | Fleet management, Google Distributed Cloud, Managed Service for Prometheus | A cloud-only answer, such as GKE Autopilot alone, ignores the on-premises clusters. |
| "Optimize cloud storage costs … growing media volumes" | Autoclass | A lifecycle rule that moves all media to Archive after a fixed age. Popular old items then pay retrieval fees and a 365-day minimum duration. |
| "Secure, high-performance hybrid cloud connectivity" | Dedicated Interconnect with MACsec | HA VPN over the internet for bulk media: Google positions Cloud VPN for lower bandwidth needs. |
| "slated for modernization and migration to Google Cloud" | Storage Transfer Service for on-premises data, over Cloud Interconnect, to move the archive | Transfer Appliance when the network has enough bandwidth. Google suggests Transfer Appliance when bandwidth cannot meet the deadline. |
| "Design AI-powered detection of harmful content" | Gemini with a custom moderation policy | Video Intelligence explicit content detection alone: it checks frames only and does not use the audio. |
| "auditable and their decisions can be explained" | Data Access audit logs, and Gemini reasoning in the output | Assuming that audit logs record prediction calls by default. Data Access logs must be enabled explicitly. Vertex Explainable AI is deprecated. |
| "Develop advanced chatbots with natural language understanding" | CX Agent Studio, or ADK with Agent Runtime and Memory Bank | Dialogflow ES: Google lists it under legacy conversational agents. |
| "Modernize CI/CD … centralized management platform" | Cloud Build, Artifact Registry, Cloud Deploy, Config Sync | Per-cluster scripts with `kubectl`: no promotion sequence and no drift control. |
| "alerts primarily delivered via email" | Alerting policies with several notification channel types | One channel type only. Google recommends redundant channel types, and SMS alone is not fully reliable. |
| "Reliability and cost management are our top priorities" | Managed services; batch inference for large, non-urgent AI jobs | Real-time Gemini calls for the whole back catalog cost more than batch inference. |
| "Google Identity and third-party identity providers" | The case does not say if these users are staff or customers. Workforce Identity Federation for staff; Identity Platform for customer sign-in | Syncing every external user into Cloud Identity. Workforce Identity Federation is sync-less. |

Sources: [Fleet management](https://docs.cloud.google.com/kubernetes-engine/docs/fleets-overview), [Autoclass](https://docs.cloud.google.com/storage/docs/autoclass), [Storage classes](https://docs.cloud.google.com/storage/docs/storage-classes), [Choosing a Network Connectivity product](https://docs.cloud.google.com/network-connectivity/docs/how-to/choose-product), [Detect explicit content in videos](https://docs.cloud.google.com/video-intelligence/docs/analyze-safesearch), [Agent Platform audit logging information](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/general/audit-logging), [CX Agent Studio](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio), [Config Sync overview](https://docs.cloud.google.com/kubernetes-engine/config-sync/docs/overview), [Create and manage notification channels](https://docs.cloud.google.com/monitoring/support/notification-options), [Batch inference with Gemini](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference), [Workforce Identity Federation](https://docs.cloud.google.com/iam/docs/workforce-identity-federation), [Identity Platform documentation](https://docs.cloud.google.com/identity-platform/docs/), [Vertex AI deprecations](https://docs.cloud.google.com/vertex-ai/docs/deprecations), [Migrate to Google Cloud: Transfer your large datasets](https://docs.cloud.google.com/architecture/migration-to-google-cloud-transferring-your-large-datasets).

## Read in the docs

1. [Gemini for safety filtering and content moderation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/gemini-for-filtering-and-moderation) — why Gemini has advantages over a fixed-category moderation API for custom policies (about 8 min)
2. [Long context](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/long-context) — multimodal audio and video use cases, and why one model replaces a chain (about 15 min)
3. [Autoclass](https://docs.cloud.google.com/storage/docs/autoclass) — when to use it, and when Google does not recommend it (about 10 min)
4. [Bucket locations](https://docs.cloud.google.com/storage/docs/locations) — availability and price of region, dual-region, and multi-region (about 10 min)
5. [Distributed Cloud software only for bare metal overview](https://docs.cloud.google.com/kubernetes-engine/distributed-cloud/bare-metal/docs/concepts/about-bare-metal) — GKE clusters on your own servers in a fleet (about 8 min)
6. [MACsec for Cloud Interconnect overview](https://docs.cloud.google.com/network-connectivity/docs/interconnect/concepts/macsec-overview) — what MACsec encrypts and what it does not (about 8 min)
7. [Overview of Cloud Deploy](https://docs.cloud.google.com/deploy/docs/overview) — delivery pipelines, targets, and promotion (about 10 min)
8. [CX Agent Studio](https://docs.cloud.google.com/gemini-enterprise-cx/cx-agent-studio) — the current tool for support agents, and its link to Dialogflow CX (about 6 min)
9. [Agent Platform audit logging information](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/general/audit-logging) — which AI operations each audit log type records (about 6 min)
10. [Google Cloud Managed Service for Prometheus](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus) — keep PromQL and Grafana, stop running Prometheus storage (about 10 min)

## Related notes

- [Choosing AI and ML solutions](note:1.3-ai-solutions) — Gemini, pre-trained APIs, and Agent Search compared
- [Pre-trained AI APIs, Gemini Enterprise, and Model Garden](note:2.5-ai-apis-and-gemini-enterprise) — Video Intelligence, Vision, and conversational agents
- [End-to-end ML workflows on Agent Platform](note:2.4-ml-workflows) — pipelines, explanations, and monitoring
- [Securing AI workloads](note:3.1-securing-ai) — Model Armor and safe model deployment
- [Configuring Cloud Storage](note:2.2-cloud-storage-config) — Autoclass, lifecycle rules, and storage classes
- [Hybrid and multicloud connectivity](note:2.1-hybrid-multicloud) — Cloud Interconnect, MACsec, and HA VPN
- [Configuring GKE](note:2.3-gke) — fleets, Config Sync, and Autopilot
- [SDLC, CI/CD, and service provisioning](note:4.1-sdlc-cicd) — Cloud Build, Artifact Registry, and Cloud Deploy
- [Google Cloud Observability](note:6.2-observability) — Managed Service for Prometheus and alerting
- [Data and system migration tooling](note:5.1-migration-tooling) — Storage Transfer Service for the on-premises archive
- Labs: [Cloud Storage classes, lifecycle, versioning, and retention](lab:20-cloud-storage-lifecycle), [Sensitive Data Protection and Model Armor](lab:55-sdp-model-armor), [Canary releases with Cloud Build and Cloud Deploy](lab:71-cloud-deploy-canary)
