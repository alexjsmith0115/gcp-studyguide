# AI product name changes (Vertex AI → Gemini Enterprise Agent Platform)

Source: [Gemini Enterprise Agent Platform name changes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes) (retrieved 2026-09-24).

Google renamed Vertex AI to **Gemini Enterprise Agent Platform** (short form: **Agent Platform**). The exam guide v6.1 uses the new names.

Identifiers that did not change (checked 2026-09-24):

- The API service is still `aiplatform.googleapis.com` ([Agent Platform API reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest)).
- The gcloud command group is still `gcloud ai` (its help text still says "Vertex AI").
- Old docs URLs under `/vertex-ai/docs/` redirect to `/gemini-enterprise-agent-platform/`.

| Previous name | New name |
|---|---|
| Vertex AI Platform | Gemini Enterprise Agent Platform |
| Generative AI on Vertex AI | Generative AI on Gemini Enterprise Agent Platform |
| Vertex AI Studio | Agent Studio on Gemini Enterprise Agent Platform |
| Vertex AI API | Gemini Enterprise Agent Platform API |
| Vertex AI Model Garden | Gemini Enterprise Agent Platform Model Garden |
| Vertex AI MaaS (Model as a Service) | Model as a Service on Gemini Enterprise Agent Platform |
| Gemini/Imagen/Veo on Vertex AI | [Model Name] on Gemini Enterprise Agent Platform |
| Claude/Llama/Deepseek/etc on Vertex AI | [Model Name], available on Gemini Enterprise Agent Platform |
| Pre-trained APIs on Vertex AI | Pre-trained APIs on Gemini Enterprise Agent Platform |
| [Consumption Model Type] on Vertex AI | [Consumption Model Type] on Gemini Enterprise Agent Platform |
| Gemini Live API on Vertex AI | Gemini Live API on Gemini Enterprise Agent Platform |
| Vertex AI Search | Agent Search on Gemini Enterprise Agent Platform |
| Vertex AI Search for Industry | Agent Search for Industry on Gemini Enterprise Agent Platform |
| Vertex AI Search for Commerce | AI Commerce Search on Gemini Enterprise for Customer Experience |
| Recommendations from Vertex AI Search | Recommendations from Agent Search (or Recommendations AI) |
| Vertex AI Conversation | Agent Conversation on Gemini Enterprise Agent Platform |
| RAG Engine on Gemini Enterprise Agent Platform | RAG Engine on Gemini Enterprise Agent Platform |
| Vertex AI Vector Search | Vector Search on Gemini Enterprise Agent Platform |
| Vertex AI Vector Search 2.0 | Agent Retrieval on Gemini Enterprise Agent Platform |
| Vertex AI Agent Engine | Agent Runtime on Gemini Enterprise Agent Platform |
| Vertex AI Studio App Builder | App Builder in Agent Studio on Gemini Enterprise Agent Platform |
| Vertex AI Agent Engine Memory Bank | Gemini Enterprise Agent Platform Memory Bank |
| Vertex AI Agent Engine Sessions | Gemini Enterprise Agent Platform Sessions |
| Vertex AI Agent Engine Code Execution | Gemini Enterprise Agent Platform Code Execution |
| Grounding with Google X in Vertex AI | Grounding with Google X in Gemini Enterprise Agent Platform |
| Grounding with Google X in Vertex AI Search | Grounding with Google X in Agent Search on Gemini Enterprise Agent Platform |
| Grounding with Google X in Vertex AI Studio | Grounding with Google X in Agent Studio on Gemini Enterprise Agent Platform |
| Vertex AI Training | Gemini Enterprise Agent Platform Managed Training |
| Vertex AI Serverless Training | Gemini Enterprise Agent Platform Serverless Training |
| Vertex AI Training Clusters (VTC) | Managed Training Clusters on Gemini Enterprise Agent Platform |
| Ray on Vertex AI | Ray on Gemini Enterprise Agent Platform |
| Reinforcement Learning from Human Feedback (RLHF) / Reinformcement Learning (RL) on Vertex AI | Reinforcement Learning on Gemini Enterprise Agent Platform |
| Vertex AI Neural Architecture Search | Neural Architecture Search on Gemini Enterprise Agent Platform |
| Vertex AI Inference / Vertex AI Inference | Gemini Enterprise Agent Platform Inference |
| Vertex AI Vision | Gemini Enterprise Agent Platform Vision |
| Vertex AI Batch Inference | Gemini Enterprise Agent Platform Batch Inference |
| Vertex AI Online Inference | Gemini Enterprise Agent Platform Online Inference |
| Vertex AI Endpoints | Gemini Enterprise Agent Platform Endpoints |
| Vertex AI Forecasting / Forecasting with AutoML | Forecasting on Gemini Enterprise Agent Platform |
| Vertex AI Pipelines | Gemini Enterprise Agent Platform Pipelines |
| Vertex AI Notebooks | Gemini Enterprise Agent Platform Notebooks |
| Vertex AI Colab Enterprise | Gemini Enterprise Agent Platform Colab Enterprise |
| Vertex AI Workbench | Gemini Enterprise Agent Platform Workbench |
| Vertex AI Workbench Instances | Gemini Enterprise Agent Platform Workbench Instances |
| Vertex AI Feature Store | Feature Store on Gemini Enterprise Agent Platform |
| Vertex AI Model Registry | Model Registry on Gemini Enterprise Agent Platform |
| Vertex AI Model Evaluation | Model Evaluation on Gemini Enterprise Agent Platform |
| Gen AI evaluation service on Vertex AI | Gemini Enterprise Agent Platform Evals |
| Vertex AI AutoML (Vision/Video/Tables) | AutoML on Gemini Enterprise Agent Platform |
| Data Labeling on Vertex AI | Data Labeling on Gemini Enterprise Agent Platform |
| Prompt management in Vertex AI | Prompt management in Gemini Enterprise Agent Platform |
| Vertex AI on GDC | Gemini Enterprise Agent Platform on Google Distributed Cloud / Distributed Cloud |
| Vertex AI Experiments | Experiments on Agent Platform |
| Vertex AI in Firebase | Gemini Enterprise Agent Platform in Firebase |
| Vertex AI Model Monitoring | Model Monitoring on Gemini Enterprise Agent Platform |
| Vertex AI Media Studio | Agent Media Studio on Gemini Enterprise Agent Platform |
| Vertex AI | Agent Platform |
| Vertex AI Generative AI | Agent Platform Generative AI |

**Two rows in this table name services that changed.** The table copies Google's rename page, but on the exam, remember the current status ([Vertex AI deprecations](https://docs.cloud.google.com/vertex-ai/docs/deprecations), checked 2026-09-25):

- **AutoML:** AutoML Video shut down on July 31, 2025, and AutoML Text shut down on June 15, 2025. AutoML now trains models on image and tabular data only. For text or video, tune a Gemini model instead.
- **Data Labeling:** the Vertex AI Data Labeling Service shut down on October 3, 2024. For new labeling tasks, add labels in the Google Cloud console, or use a partner labeling solution from Cloud Marketplace.
