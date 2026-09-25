---
id: 40-gemini-api
title: Call Gemini on Agent Platform
objectives: ["1.3", "2.5"]
minutes: 40
cost: "About $0.02. The lab sends about 12 short requests to Gemini 3.1 Flash-Lite, which costs $0.25 per 1M input tokens and $1.50 per 1M output tokens on the global endpoint. Grounding with Google Search includes 5,000 grounding queries per month at no charge across Gemini 3 models, then $14 per 1,000. No cloud resources remain."
requiresOrg: false
---

## Goal

Call Gemini 3.1 Flash-Lite on Agent Platform (formerly Vertex AI) with curl and an OAuth token from gcloud. Use a system instruction, a response schema, Grounding with Google Search, and token counts, and learn what each one costs.

## Exam relevance

- When a prompt is enough, and when to add grounding, RAG, or tuning. Which model tier fits a cost-sensitive, high-volume workload: [Choosing AI and ML solutions](note:1.3-ai-solutions).
- Why the global endpoint gives no data residency, and when to use the `us` or `eu` multi-region endpoint: [Choosing AI and ML solutions](note:1.3-ai-solutions).
- Grounding with Google Search compared with Web Grounding for Enterprise for regulated industries: [Choosing AI and ML solutions](note:1.3-ai-solutions).
- When a Gemini prompt with a response schema replaces a pre-trained API: [Pre-trained AI APIs, Gemini Enterprise, and Model Garden](note:2.5-ai-apis-and-gemini-enterprise).
- Token-based prices and the batch discount: [Cost optimization and CapEx/OpEx](note:4.2-cost-optimization).
- This lab does not cover Model Armor or prompt security. See [Securing AI workloads](note:3.1-securing-ai).

## Before you start

- **IAM:** you are the Owner of the lab project from `labs/00-setup`. A person who is not an Owner needs the Agent Platform User role (`roles/aiplatform.user`).
- **Tools:** the gcloud CLI, curl, and Python 3. The lab installs no SDK.
- **Model:** `gemini-3.1-flash-lite` is GA. Google calls it the most cost-efficient Gemini model. It runs only on the global endpoint and on the `us` and `eu` multi-region endpoints.
- **Time:** about 40 minutes.

Open a shell in the repo root, and enable the Agent Platform API. The API name is still `aiplatform.googleapis.com`.

```bash
source labs/env.sh
gcloud services enable aiplatform.googleapis.com --project="$PROJECT_ID"
```

## Steps

1. Set the model, the endpoint, and a local work folder, so that every step uses the same values. The global endpoint has no region in the hostname, and the location in the path is `global`.

```bash
export MODEL=gemini-3.1-flash-lite
export GEMINI_URL="https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/${MODEL}"
export LAB40_DIR="${TMPDIR:-/tmp}/lab40"
mkdir -p "$LAB40_DIR"
```

2. Send a first prompt with curl, so that you see the request format and the `usageMetadata` that billing uses. The OAuth access token comes from your gcloud sign-in, so you need no API key. The `show.py` script prints the answer, the token counts, and an estimated cost.

```bash
cat > "$LAB40_DIR/basic-req.json" <<'EOF'
{
  "contents": [{"role": "user", "parts": [{"text": "What is the difference between RPO and RTO?"}]}]
}
EOF
curl -s -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d @"$LAB40_DIR/basic-req.json" \
  "${GEMINI_URL}:generateContent" > "$LAB40_DIR/basic.json"
python3 labs/40-gemini-api/show.py "$LAB40_DIR/basic.json"
```

The next steps use this short shell function. It sends the same curl command. The optional fourth argument changes the endpoint.

```bash
gemini() {  # usage: gemini METHOD REQUEST_FILE RESPONSE_FILE [MODEL_URL]
  curl -s -X POST \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d @"$2" "${4:-$GEMINI_URL}:$1" > "$3"
}
```

3. Add a system instruction, so that you see how one instruction changes every answer without a change to the user prompt. Compare the answer and the `prompt` count with step 2. The system instruction adds input tokens.

```bash
cat > "$LAB40_DIR/system-req.json" <<'EOF'
{
  "system_instruction": {"parts": [{"text": "You explain cloud terms to a finance team. Use plain words and at most 60 words. End with one Google Cloud example."}]},
  "contents": [{"role": "user", "parts": [{"text": "What is the difference between RPO and RTO?"}]}]
}
EOF
gemini generateContent "$LAB40_DIR/system-req.json" "$LAB40_DIR/system.json"
python3 labs/40-gemini-api/show.py "$LAB40_DIR/system.json"
```

4. Get JSON that matches a schema, so that a program can use the answer without parsing free text. The docs say that only a response schema together with the `application/json` MIME type ensures valid JSON. The enum lists limit `category` and `priority` to fixed values.

```bash
cat > "$LAB40_DIR/ticket-req.json" <<'EOF'
{
  "contents": [{"role": "user", "parts": [{"text": "Classify this support ticket: Since 09:10 UTC our checkout page returns HTTP 502 for all users in Europe, and payments fail. We run the app on Cloud Run with Cloud SQL."}]}],
  "generation_config": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "category": {"type": "string", "enum": ["billing", "outage", "access", "question"]},
        "priority": {"type": "string", "enum": ["P1", "P2", "P3", "P4"]},
        "products": {"type": "array", "items": {"type": "string"}},
        "summary": {"type": "string"}
      },
      "required": ["category", "priority", "products", "summary"]
    }
  }
}
EOF
gemini generateContent "$LAB40_DIR/ticket-req.json" "$LAB40_DIR/ticket.json"
python3 labs/40-gemini-api/show.py --text "$LAB40_DIR/ticket.json" | python3 -m json.tool
```

The structured output guide uses `responseSchema`. The v1 REST reference marks `responseSchema` as deprecated and names `responseFormat` as its replacement. If the API rejects the field later, check the current guide.

5. Ground an answer with Google Search, so that the model can use current public web pages and show its sources. Send the same question without and with the `googleSearch` tool. Then compare both answers with your local gcloud version and with the [gcloud CLI release notes](https://docs.cloud.google.com/sdk/docs/release-notes).

```bash
Q='What is the latest version number of the Google Cloud CLI (gcloud), and on what date was it released?'
printf '{"contents": [{"role": "user", "parts": [{"text": "%s"}]}]}\n' "$Q" > "$LAB40_DIR/plain-req.json"
printf '{"contents": [{"role": "user", "parts": [{"text": "%s"}]}], "tools": [{"googleSearch": {}}]}\n' "$Q" > "$LAB40_DIR/grounded-req.json"
gemini generateContent "$LAB40_DIR/plain-req.json" "$LAB40_DIR/plain.json"
gemini generateContent "$LAB40_DIR/grounded-req.json" "$LAB40_DIR/grounded.json"
python3 labs/40-gemini-api/show.py "$LAB40_DIR/plain.json"
python3 labs/40-gemini-api/show.py "$LAB40_DIR/grounded.json"
gcloud version | head -1
```

The grounded response has `groundingMetadata`: the search queries that the model sent (`webSearchQueries`), the source pages (`groundingChunks`), and `searchEntryPoint`. `searchEntryPoint` holds the HTML and CSS that show Google Search Suggestions. Read the display rules for Search Suggestions in the grounding docs before you show grounded answers to users. For Gemini 3 models, Google bills each search query that the model sends, and one prompt can send more than one query.

6. Count tokens before you send a request, so that you can estimate the cost and check the context window. The `countTokens` method takes the same `contents` as `generateContent`. Compare its result with the `prompt` count from step 2.

```bash
gemini countTokens "$LAB40_DIR/basic-req.json" "$LAB40_DIR/count.json"
python3 labs/40-gemini-api/show.py "$LAB40_DIR/count.json"
python3 -c 'import json,sys; print("promptTokenCount from step 2:", json.load(open(sys.argv[1]))["usageMetadata"]["promptTokenCount"])' "$LAB40_DIR/basic.json"
```

7. Compare two thinking levels, so that you see how thinking changes the cost and the response time. Gemini 3.1 Flash-Lite uses the `MINIMAL` thinking level by default. Google bills thinking tokens at the output price. Compare the `thoughts` counts and the times.

```bash
cat > "$LAB40_DIR/think-req.json" <<'EOF'
{
  "contents": [{"role": "user", "parts": [{"text": "A web app runs in one region with Cloud SQL. Plan how to add a second region with an RPO of 5 minutes and an RTO of 1 hour. Give at most five steps."}]}],
  "generation_config": {"thinkingConfig": {"thinkingLevel": "HIGH"}}
}
EOF
sed 's/"HIGH"/"MINIMAL"/' "$LAB40_DIR/think-req.json" > "$LAB40_DIR/think-min-req.json"
time (gemini generateContent "$LAB40_DIR/think-req.json" "$LAB40_DIR/think.json")
time (gemini generateContent "$LAB40_DIR/think-min-req.json" "$LAB40_DIR/think-min.json")
python3 labs/40-gemini-api/show.py "$LAB40_DIR/think.json" | tail -2
python3 labs/40-gemini-api/show.py "$LAB40_DIR/think-min.json" | tail -2
```

8. Optional: send the step 2 prompt to the US multi-region endpoint, so that you see how to keep ML processing in the United States. The hostname and the location in the path both change. For this model, non-global prices are 10% higher than global prices.

```bash
export GEMINI_US_URL="https://aiplatform.us.rep.googleapis.com/v1/projects/${PROJECT_ID}/locations/us/publishers/google/models/${MODEL}"
gemini generateContent "$LAB40_DIR/basic-req.json" "$LAB40_DIR/us.json" "$GEMINI_US_URL"
python3 labs/40-gemini-api/show.py --non-global "$LAB40_DIR/us.json"
```

If a step prints `API error 403`, wait one minute after you enable the API, and run the step again.

## Check your work

```bash
gcloud services list --enabled --filter="config.name=aiplatform.googleapis.com" \
  --format="value(config.name)"
```

Expected: `aiplatform.googleapis.com`

```bash
python3 labs/40-gemini-api/show.py --text "$LAB40_DIR/ticket.json" \
  | python3 -c 'import json,sys; t=json.load(sys.stdin); print(sorted(t), t["category"], t["priority"])'
```

Expected: `['category', 'priority', 'products', 'summary']`, then one value from each enum list, for example `outage P1`.

```bash
python3 -c 'import json,sys; g=json.load(open(sys.argv[1]))["candidates"][0].get("groundingMetadata", {}); print(len(g.get("webSearchQueries", [])) > 0, len(g.get("groundingChunks", [])))' \
  "$LAB40_DIR/grounded.json"
```

Expected: `True`, then the number of source pages (1 or more). The same command for `plain.json` prints `False 0`.

Also expect these results:

- Step 3 has a higher `prompt` count and a shorter answer than step 2.
- In step 6, `totalTokens` is equal to the step 2 `promptTokenCount`, or very close to it.
- In step 7, the `HIGH` request has more `thoughts` tokens and takes longer.

## Explore

1. A German insurer wants to summarize claims with Gemini. Regulators require that ML processing of claims data stays in the European Union. Which endpoint do you choose, and how do you stop developers from using the global endpoint?

<details><summary>Answer</summary>

Use the EU multi-region endpoint, `https://aiplatform.eu.rep.googleapis.com` with the location `eu`, for a model that is available there. Requests to the global endpoint can be processed in any Google Cloud location, so the global endpoint gives no data residency. In an organization, the `constraints/gcp.restrictEndpointUsage` constraint can block requests to the global endpoint.

</details>

2. An app team asks Gemini for JSON by writing "Reply in JSON" in the prompt. Some replies fail to parse. What do you recommend?

<details><summary>Answer</summary>

Set `responseMimeType` to `application/json` and add a `responseSchema`. Only both together ensure valid JSON. JSON mode without a schema is only a strong hint to the model. Put the schema only in the schema field, not also in the prompt. If the team cannot define a schema in advance, validate the JSON in the client and retry.

</details>

3. A hospital's assistant for clinicians needs current information from the public web. Compliance requires that the grounding service does not log customer data. The project is inside a VPC Service Controls perimeter. Which grounding option do you use?

<details><summary>Answer</summary>

Use Web Grounding for Enterprise (the `enterpriseWebSearch` tool). It does not log customer data, and it supports VPC Service Controls. Its index is a subset of the web that fits healthcare, finance, and the public sector. Grounding with Google Search has a broader and fresher index, but it keeps reliability logs for up to 3 days.

</details>

4. A company must classify 5 million support tickets each night. Nobody reads the results before the morning. How do you reduce the cost?

<details><summary>Answer</summary>

Use batch inference instead of online requests. For Gemini models, batch costs 50% less than Standard PayGo, and Google recommends batch for large backlogs when latency does not matter. Use a low-cost model such as Gemini 3.1 Flash-Lite, keep the `MINIMAL` thinking level, and estimate the input size with `countTokens` on a sample.

</details>

## Clean up

Run the teardown script:

```bash
bash labs/40-gemini-api/teardown.sh
```

The script deletes the local work folder `${TMPDIR:-/tmp}/lab40`. The lab creates no cloud resources. The Agent Platform API stays enabled, because lab 42 also uses it. Service Usage, which enables APIs, is free of charge.

## Docs used

- [Gemini 3.1 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite)
- [Use system instructions](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions)
- [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
- [GenerationConfig in the REST reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.tuningJobs#GenerationConfig)
- [Grounding with Google Search](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/grounding-with-google-search)
- [Web Grounding for Enterprise](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/grounding/web-grounding-enterprise)
- [CountTokens API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/count-tokens)
- [Thinking](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking)
- [Deployments and endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations)
- [Agent Platform access control with IAM](https://docs.cloud.google.com/gemini-enterprise-agent-platform/machine-learning/general/access-control)
- [Agent Platform pricing for generative AI](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
- [gcloud CLI release notes](https://docs.cloud.google.com/sdk/docs/release-notes)
- [Service Usage pricing](https://cloud.google.com/service-usage/pricing)
