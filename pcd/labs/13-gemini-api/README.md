---
id: 13-gemini-api
title: "Call Gemini on Agent Platform: streaming, structured output, and retries"
objectives: ["4.2"]
minutes: 40
cost: "Less than $0.01. The lab sends four short prompts to Gemini 3.1 Flash-Lite on the global endpoint, at $0.25 per 1M input tokens and $1.50 per 1M output tokens. Output tokens include thinking tokens. Count Tokens requests have no charge, and the retry test runs only on your computer. No cloud resources remain."
requiresOrg: false
---

## Goal

Call Gemini 3.1 Flash-Lite on Gemini Enterprise Agent Platform, or Agent Platform (formerly Vertex AI), with the Google Gen AI SDK for Python and ADC. Count tokens, shape and stream a response, get JSON that follows a schema, and test retries for `429` errors.

## Exam relevance

- ADC for the Gemini API on Agent Platform, the environment variables of the SDK, and the global endpoint. See [Calling generative AI APIs: Gemini on Agent Platform](note:4.2-generative-ai-apis).
- System instructions, generation parameters, streaming, structured output, and token counts. See [Calling generative AI APIs: Gemini on Agent Platform](note:4.2-generative-ai-apis).
- `429` errors, retryable and permanent errors, exponential backoff with jitter, and a maximum number of attempts. See [Calling generative AI APIs: Gemini on Agent Platform](note:4.2-generative-ai-apis) and [Efficient and resilient API calls](note:4.2-efficient-api-calls).
- ADC and the quota project for code that runs on your computer. See [Authenticating code to Google Cloud](note:1.2-authenticating-to-google-cloud).

## Before you start

- Complete [the setup lab](lab:00-setup) first. This lab uses its Application Default Credentials (ADC) and the lab shell. The lab shell sets `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_QUOTA_PROJECT`.
- **IAM:** you are the Owner of the lab project. Another principal needs the Gemini Enterprise Agent Platform User role (`roles/aiplatform.user`), or a role with the `aiplatform.endpoints.predict` permission.
- **Tools:** Python 3.12 or later with the `venv` module. The lab installs the SDK (`google-genai` 2.26.0) in a virtual environment.
- **Model:** `gemini-3.1-flash-lite` is GA. Google calls it the most cost-efficient Gemini model. Its retirement date is May 7, 2027 or later.
- **Time:** about 40 minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the Agent Platform API. The service name is still `aiplatform.googleapis.com`.

```bash
source pcd/labs/env.sh
gcloud services enable aiplatform.googleapis.com
```

## Steps

1. Set the model, the location, and a local work folder. The scripts read these variables and pass the values to the SDK client.

```bash
export LAB13_MODEL=gemini-3.1-flash-lite
export LAB13_LOCATION=global
export LAB13_DIR="${TMPDIR:-/tmp}/lab13"
mkdir -p "$LAB13_DIR"
env | grep -E '^(GOOGLE_CLOUD_(PROJECT|QUOTA_PROJECT)|LAB13_(MODEL|LOCATION))=' | sort
```

| Variable | Value | Why |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Your lab project, from `env.sh` | The script passes it to the client as `project`. It is the project in the request path. |
| `GOOGLE_CLOUD_QUOTA_PROJECT` | Your lab project, from `env.sh` | The project that gets the quota and billing of calls with your user credentials |
| `LAB13_MODEL` | `gemini-3.1-flash-lite` | The model ID that the scripts use |
| `LAB13_LOCATION` | `global` | The endpoint. The model page lists only `global`, `us`, and `eu` for this model, so do not use `$REGION`. |

The client in `gemini_lab.py` gets `enterprise=True`, the project, and the location as arguments. `enterprise=True` selects the Gemini API on Agent Platform. Without it, the client uses the Gemini Developer API, which needs an API key. Older docs samples use `vertexai=True`, which the SDK reference calls the legacy flag for `enterprise`.

The SDK can also read these settings from environment variables. The docs use two names for one of them: `GOOGLE_GENAI_USE_ENTERPRISE`, and the older `GOOGLE_GENAI_USE_VERTEXAI` in some samples. The settings in code avoid this conflict.

Model IDs change. The **Model versions and lifecycle** page lists each model ID with its release date, retirement date, and replacement model. Each model page lists its locations. To try a newer model, change only `LAB13_MODEL`.

2. Install the SDK in a virtual environment, so that the lab does not change your other Python packages.

```bash
python3 -m venv "$LAB13_DIR/venv"
"$LAB13_DIR/venv/bin/pip" install -q -r pcd/labs/13-gemini-api/requirements.txt
"$LAB13_DIR/venv/bin/pip" show google-genai | grep -E '^(Name|Version):'
```

Expected output: `Name: google-genai` and `Version: 2.26.0`.

3. Read the script, then send a first prompt. The `basic` part counts the input tokens first, then sends the prompt and prints the token usage.

```bash
cat pcd/labs/13-gemini-api/gemini_lab.py
"$LAB13_DIR/venv/bin/python" pcd/labs/13-gemini-api/gemini_lab.py basic
```

The script logs each HTTP request of the SDK. The SDK uses the `httpx` library for HTTP.

| Output | What it shows |
|---|---|
| `HTTP Request: POST https://aiplatform.googleapis.com/v1/projects/PROJECT_ID/locations/global/publishers/google/models/gemini-3.1-flash-lite:countTokens` | The global endpoint has no region in the host name. The path has `locations/global`. |
| `count_tokens: N input tokens` | The input size before you send the prompt. The Count Tokens API has no charge. |
| `...:generateContent "HTTP/1.1 200 OK"` | The method that returns the whole response at one time |
| The answer, then `usage_metadata: input N, output N, thinking N, total N` | The token counts that billing uses. The thinking count is small or zero, because `MINIMAL` is the default thinking level of this model. |

Other locations use other hosts. A regional location uses `LOCATION-aiplatform.googleapis.com`. The `us` and `eu` multi-regions use `aiplatform.us.rep.googleapis.com` and `aiplatform.eu.rep.googleapis.com`. The `v1` in the path comes from `api_version="v1"` in the script. Without it, the SDK uses the beta API endpoints.

The SDK also logs one warning about automatic function calling (AFC). With AFC, the SDK calls the Python functions that you pass as tools. This lab passes no tools, so ignore the warning.

4. Shape the response with a system instruction and a generation config. The `config` part sends the same prompt with three settings.

```bash
"$LAB13_DIR/venv/bin/python" pcd/labs/13-gemini-api/gemini_lab.py config
```

| Setting | Value | Effect |
|---|---|---|
| `system_instruction` | A role and a style | Applies to the whole request, before the prompt. It can set a role, a format, a tone, and rules. It does not fully prevent jailbreaks or leaks, so do not put sensitive data in it. |
| `temperature` | `0.2` | Lower values give less random output. At `0`, the output is mostly deterministic. The range for this model is 0.0 to 2.0, and the default is 1.0. |
| `max_output_tokens` | `30` | A hard limit for the response length. A token is about four characters. |

Expected output: an answer that stops early, and `finish_reason: MAX_TOKENS`. Check the finish reason before you use the text. `MAX_TOKENS` means that the response is not complete. When a content filter blocks a response, the finish reason is `SAFETY` and the content is empty. The input count is larger than in step 3, because the system instruction is part of the input.

For Gemini 3.6 Flash and later models, the API ignores custom `temperature`, `top_p`, and `top_k` values. Custom penalty values return an error. Check these limits when you change the model.

5. Stream the same prompt, so that the text appears while the model generates it.

```bash
"$LAB13_DIR/venv/bin/python" pcd/labs/13-gemini-api/gemini_lab.py stream
```

Expected output: the method is `streamGenerateContent?alt=sse`, and the text appears in parts. The last line shows the number of chunks, and the first chunk arrives before the last chunk. A non-streaming call returns the response after the model generates all output tokens. Streaming reduces the latency that a person sees, so use it for chat interfaces. Multiple candidates (Preview) do not work with `streamGenerateContent`.

6. Get structured output. The `schema` part sends a response schema and parses the JSON response with no extra cleanup.

```bash
"$LAB13_DIR/venv/bin/python" pcd/labs/13-gemini-api/gemini_lab.py schema
```

Expected output: three rows, each with a service name, `serverless=True` or `serverless=False`, and a use case. The request sets both fields that structured output needs:

| Field | Value | Why |
|---|---|---|
| `response_mime_type` | `application/json` | Without a schema, JSON mode is only a strong hint. The model can return malformed JSON. |
| `response_schema` | `SCHEMA` in the script | With both fields, the output always follows the schema. |

The fields of a schema are optional by default, so the script lists them in `required`. With the Python SDK, the output keeps the property order of your schema. The schema counts toward the input token limit, and a complex schema can cause an `InvalidArgument: 400` error. Do not repeat the schema in the prompt, because output quality can drop.

7. See how the SDK handles `429` errors. The real service seldom returns `429` for a few requests. So `retries.py` starts a test server on `127.0.0.1` that returns planned status codes. No request leaves your computer.

```bash
cat pcd/labs/13-gemini-api/retries.py
"$LAB13_DIR/venv/bin/python" pcd/labs/13-gemini-api/retries.py
```

| Part | Test server log | Result | Why |
|---|---|---|---|
| A | One request | `ClientError 429 RESOURCE_EXHAUSTED` | The client has no `retry_options`, so the SDK sends one request only. |
| B | Requests at about 0, 1 to 2, and 3 to 5 seconds | `Hello from the test server.` | `429` is in `http_status_codes`, so the SDK waits and retries. Each wait is longer than the previous one, plus a random part. The third attempt succeeds. |
| C | One request | `ClientError 400 INVALID_ARGUMENT` | `400` is not in `http_status_codes`. A `400` error means that the request is not valid, so a retry cannot fix it. |
| D | Three requests | `ClientError 429 RESOURCE_EXHAUSTED` | `attempts=3` stops the retries. The SDK raises the last error, and your code must handle it. |

The retry options come from `RETRY` in `gemini_lab.py`. The client in steps 3 to 6 uses the same options.

| Setting | Value | Meaning |
|---|---|---|
| `attempts` | `3` | The first request and at most two retries. The API errors page recommends no more than two retries. |
| `initial_delay` | `1.0` | The first wait, in seconds. The API errors page gives one second as the minimum delay. |
| `exp_base` | `2.0` | Each wait is two times the previous wait (exponential backoff). |
| `max_delay` | `8.0` | The longest wait, in seconds |
| `jitter` | `1.0` | Adds a random delay to each wait, so that many clients do not retry at the same time |
| `http_status_codes` | `408`, `429`, `500`, `502`, `503`, `504` | The transient errors that the SDK retries |

Part A shows an important detail. The Retry strategy page says that the Python SDK retries transient errors by default, up to four times. In this run, the client without `retry_options` sends one request and raises the error at once. So always set `retry_options` in your code. Then the behavior does not depend on the SDK version. If you set `HttpRetryOptions()` with no values, the docs give these defaults: 5 attempts, a 1-second first delay, and a 60-second maximum delay.

Other rules from the Retry strategy page:

- `generateContent` is not strictly idempotent, but it is generally safe to retry, because it does not change server-side state.
- For real-time use, such as chat, fail fast with few attempts.
- For Flex PayGo, do not retry aggressively. Increase the request timeout instead, for example to 30 minutes.
- With Provisioned Throughput, frequent errors usually mean that you use more than the purchased capacity. More retries may not help.

## Check your work

1. The Agent Platform API is enabled:

```bash
gcloud services list --enabled --filter="config.name=aiplatform.googleapis.com" --format="value(config.name)"
```

Expected output: `aiplatform.googleapis.com`.

2. The virtual environment has the pinned SDK version:

```bash
"$LAB13_DIR/venv/bin/pip" show google-genai | grep '^Version:'
```

Expected output: `Version: 2.26.0`.

3. The retry test gives the four results. This check sends no request to Google:

```bash
"$LAB13_DIR/venv/bin/python" pcd/labs/13-gemini-api/retries.py 2>/dev/null | grep 'result:'
```

Expected output, in this order: `ClientError 429 RESOURCE_EXHAUSTED`, `Hello from the test server.`, `ClientError 400 INVALID_ARGUMENT`, and `ClientError 429 RESOURCE_EXHAUSTED`.

## Explore

1. Your chat feature runs on Standard PayGo in `us-central1`. At peak times, it gets `429` errors. What do you change first?

<details><summary>Answer</summary>

On Standard PayGo, a `429` error does not mean that you hit a fixed quota. It means temporary high contention for shared capacity. Retry with exponential backoff and jitter, with few attempts for a chat. Also use the global endpoint: it sends each request to the region with the most available capacity at that time. Smooth the traffic, and avoid sharp spikes. For more consistent performance, Google suggests Priority PayGo. For dedicated capacity, buy Provisioned Throughput.

</details>

2. A customer requires that ML processing stays in the European Union. Which location do you pass to the client?

<details><summary>Answer</summary>

`eu`. The multi-region endpoint for `eu` is `aiplatform.eu.rep.googleapis.com`. With a multi-region endpoint, ML processing stays in that jurisdiction. The `eu` endpoint covers only EU member states, not the United Kingdom or Switzerland. Gemini 3.1 Flash-Lite supports `eu`. Do not use `global`, because Google can process a global request in any Google Cloud location.

</details>

3. Your code parses the JSON output of the model, and it fails for some responses. The request sets `response_mime_type` to `application/json`. What is wrong?

<details><summary>Answer</summary>

JSON mode without a schema is only a strong hint, so the model can return malformed JSON. Set both `response_schema` and `response_mime_type: application/json`, as in step 6. Then the output always follows the schema. Mark the fields that your code needs as `required`. Keep the schema simple. It counts toward the input token limit, and a complex schema can cause a `400` error.

</details>

4. How do you estimate the size of a prompt before you send it? Where do you find the usage that Google bills?

<details><summary>Answer</summary>

Call `count_tokens`. The Count Tokens API has no charge. For images, video, and audio, its count is an estimate. The billed usage is in `usage_metadata` of each response. Output tokens include thinking tokens, at the output price. Google charges only for requests that return `200`, so a failed attempt has no charge. The Count Tokens page recommends the integrated tokenizer of the SDK instead (List and count tokens, Preview).

</details>

## Clean up

```bash
bash pcd/labs/13-gemini-api/teardown.sh
unset LAB13_MODEL LAB13_LOCATION LAB13_DIR
```

The teardown script deletes:

- The local work folder `${TMPDIR:-/tmp}/lab13`, with the Python virtual environment.

The lab creates no cloud resources. The Agent Platform API stays enabled. The `unset` command removes the lab variables from your shell, because a script cannot change the variables of its parent shell.

## Docs used

- [Google Gen AI SDK](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/sdks/overview)
- [Google Gen AI SDK for Python reference](https://googleapis.github.io/python-genai/)
- [Google Gen AI SDK for Python: submodules (genai.client)](https://googleapis.github.io/python-genai/genai.html)
- [Gemini Enterprise Agent Platform name changes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/vertex-ai-name-changes)
- [Access control](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/access-control)
- [Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)
- [Deployments and endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations)
- [Data residency](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency)
- [Gemini 3.1 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite)
- [Model versions and lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)
- [Generate content with the Gemini API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/inference)
- [Text generation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/send-chat-prompts-gemini)
- [Use system instructions](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions)
- [Thinking](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking)
- [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
- [Use the Count Tokens API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/get-token-count)
- [List and count tokens](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/list-token)
- [Retry strategy](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/retry-strategy)
- [API errors](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/api-errors)
- [Error code 429](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/deploy/error-code-429)
- [Standard PayGo](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/standard-paygo)
- [Agent Platform pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
