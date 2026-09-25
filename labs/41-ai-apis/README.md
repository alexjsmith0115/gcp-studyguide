---
id: 41-ai-apis
title: Pre-trained AI APIs compared with Gemini
objectives: ["2.5"]
minutes: 40
cost: "Less than $0.01. Vision (6 units), Natural Language (4 units), and Translation (about 150 characters) stay inside their monthly free tiers. Speech-to-Text V2 has no free tier: the 2-second sample costs less than $0.001 at $0.016 per minute. The Gemini 3.1 Flash-Lite requests cost less than $0.001. No cloud resources remain."
requiresOrg: false
---

## Goal

Call four pre-trained AI APIs with curl: Vision, Speech-to-Text, Natural Language, and Cloud Translation. Then do one of the same tasks with Gemini, and compare the output, the repeatability, and the cost.

## Exam relevance

- Which pre-trained API fits each of the six AI API families, and when a Gemini prompt fits better: [Pre-trained AI APIs, Gemini Enterprise, and Model Garden](note:2.5-ai-apis-and-gemini-enterprise).
- Why Chirp 3 needs Speech-to-Text V2, and when to use batch recognition instead of a synchronous request: [Pre-trained AI APIs, Gemini Enterprise, and Model Garden](note:2.5-ai-apis-and-gemini-enterprise).
- Where a pre-trained API fits among the other AI options (prompting, grounding, tuning, and custom training): [Choosing AI and ML solutions](note:1.3-ai-solutions).
- Why a response schema makes Gemini output usable by a program: [Lab 40](lab:40-gemini-api).

## Before you start

- **IAM:** you are the Owner of the lab project from `labs/00-setup`. The Owner role includes `serviceusage.services.use`, which the quota project header in step 1 needs.
- **Tools:** the gcloud CLI, curl, and Python 3. The lab installs no SDK.
- **Sample files:** the lab reads public sample files from the `cloud-samples-data` bucket. It creates no bucket.
- **Time:** about 40 minutes.

Open a shell in the repo root, and enable the four pre-trained APIs and the Agent Platform API (for the Gemini step).

```bash
source labs/env.sh
gcloud services enable vision.googleapis.com speech.googleapis.com language.googleapis.com \
  translate.googleapis.com aiplatform.googleapis.com --project="$PROJECT_ID"
```

## Steps

1. Make a local work folder and a short shell function for the REST calls. With user credentials, some APIs need a quota project, and the Vision and Translation docs add a header for it. The `x-goog-user-project` header names the project that pays and whose quota the call uses.

```bash
export LAB41_DIR="${TMPDIR:-/tmp}/lab41"
mkdir -p "$LAB41_DIR"
api() {  # usage: api URL REQUEST_FILE RESPONSE_FILE
  curl -s -X POST \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "x-goog-user-project: ${PROJECT_ID}" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d @"$2" "$1" > "$3"
}
```

2. Get labels and text from two images with the Vision API, so that you see the fixed output format with a score for each label. One request can hold several images. Each feature on each image is one billable unit, so this request uses 3 units.

```bash
cat > "$LAB41_DIR/vision-req.json" <<'EOF'
{
  "requests": [
    {
      "image": {"source": {"imageUri": "gs://cloud-samples-data/vision/label/setagaya.jpeg"}},
      "features": [{"type": "LABEL_DETECTION", "maxResults": 5}]
    },
    {
      "image": {"source": {"imageUri": "gs://cloud-samples-data/vision/ocr/sign.jpg"}},
      "features": [{"type": "LABEL_DETECTION", "maxResults": 5}, {"type": "TEXT_DETECTION"}]
    }
  ]
}
EOF
api https://vision.googleapis.com/v1/images:annotate "$LAB41_DIR/vision-req.json" "$LAB41_DIR/vision.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/vision.json"
```

3. Transcribe a short audio sample with Chirp 3, so that you see a Speech-to-Text V2 request. Chirp 3 works only in the V2 API. It is GA in the `us` and `eu` multi-regions, so the hostname and the location are `us`. The recognizer `_` is an empty implicit recognizer, so the call creates no recognizer resource. A synchronous request suits audio shorter than one minute.

```bash
cat > "$LAB41_DIR/speech-req.json" <<'EOF'
{
  "config": {"autoDecodingConfig": {}, "languageCodes": ["en-US"], "model": "chirp_3"},
  "uri": "gs://cloud-samples-data/speech/brooklyn_bridge.flac"
}
EOF
api "https://us-speech.googleapis.com/v2/projects/${PROJECT_ID}/locations/us/recognizers/_:recognize" \
  "$LAB41_DIR/speech-req.json" "$LAB41_DIR/speech.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/speech.json"
```

4. Find entities and sentiment in a short text with the Natural Language API, so that you see how `score` and `magnitude` differ. The text has one positive and one negative idea. The third call moderates the same text. The docs use the v1 API for moderation, and its request has no `encodingType` field, so the step makes a second request body.

```bash
TEXT='The support team in Dublin fixed our Cloud SQL outage in two hours. The new billing dashboard is confusing, but our CFO was impressed by the fast response.'
printf '{"encodingType": "UTF8", "document": {"type": "PLAIN_TEXT", "content": "%s"}}\n' "$TEXT" > "$LAB41_DIR/nl-req.json"
printf '{"document": {"type": "PLAIN_TEXT", "content": "%s"}}\n' "$TEXT" > "$LAB41_DIR/moderate-req.json"
api https://language.googleapis.com/v2/documents:analyzeEntities "$LAB41_DIR/nl-req.json" "$LAB41_DIR/entities.json"
api https://language.googleapis.com/v2/documents:analyzeSentiment "$LAB41_DIR/nl-req.json" "$LAB41_DIR/sentiment.json"
api https://language.googleapis.com/v1/documents:moderateText "$LAB41_DIR/moderate-req.json" "$LAB41_DIR/moderation.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/entities.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/sentiment.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/moderation.json"
```

`score` is the overall emotion, from -1.0 to 1.0. `magnitude` is the total strength of emotion, and it is not normalized. A score near 0 with a high magnitude means mixed emotions, not a neutral text.

5. Translate the same text into German with Cloud Translation - Advanced (the v3 API), so that you see the IAM-based API. The Advanced edition adds glossaries and regional endpoints, and it does not accept API keys.

```bash
printf '{"sourceLanguageCode": "en", "targetLanguageCode": "de", "contents": ["%s"], "mimeType": "text/plain"}\n' "$TEXT" > "$LAB41_DIR/translate-req.json"
api "https://translation.googleapis.com/v3/projects/${PROJECT_ID}:translateText" \
  "$LAB41_DIR/translate-req.json" "$LAB41_DIR/translate.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/translate.json"
```

6. Do the task from step 2 with Gemini, so that you can compare the two approaches. Gemini 3.1 Flash-Lite reads the sign image from Cloud Storage and returns JSON that matches your schema. Send the request two times, and send the Vision request again. Compare each pair of answers and the times.

```bash
cat > "$LAB41_DIR/gemini-req.json" <<'EOF'
{
  "contents": [{"role": "user", "parts": [
    {"fileData": {"fileUri": "gs://cloud-samples-data/vision/ocr/sign.jpg", "mimeType": "image/jpeg"}},
    {"text": "Read all text in this image exactly as written. Then give up to five short labels that describe the image."}
  ]}],
  "generation_config": {
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "object",
      "properties": {
        "text": {"type": "string"},
        "labels": {"type": "array", "items": {"type": "string"}}
      },
      "required": ["text", "labels"]
    }
  }
}
EOF
GEMINI_URL="https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-3.1-flash-lite:generateContent"
time (api "$GEMINI_URL" "$LAB41_DIR/gemini-req.json" "$LAB41_DIR/gemini-1.json")
time (api "$GEMINI_URL" "$LAB41_DIR/gemini-req.json" "$LAB41_DIR/gemini-2.json")
time (api https://vision.googleapis.com/v1/images:annotate "$LAB41_DIR/vision-req.json" "$LAB41_DIR/vision-2.json")
python3 labs/40-gemini-api/show.py "$LAB41_DIR/gemini-1.json"
python3 labs/40-gemini-api/show.py --text "$LAB41_DIR/gemini-2.json"
python3 labs/41-ai-apis/show.py "$LAB41_DIR/vision-2.json"
```

Use this table to compare the results:

| Factor | Vision API | Gemini |
|---|---|---|
| Output | Fixed fields. Each label has a score, and each word has a bounding box. | Only the fields in your schema. The answer has no score for each label. |
| Same request two times | Compare `vision.json` with `vision-2.json`. | Compare `gemini-1.json` with `gemini-2.json`. |
| Price for this task | 2 units for the sign (labels and text). The first 1,000 units each month are free, then $1.50 per 1,000 units for each feature. | The token counts in `usageMetadata`, at $0.25 per 1M input tokens and $1.50 per 1M output tokens |
| More tasks in the same request | No. Each feature is a separate unit. | Yes. For example, add "Translate the text into German" to the prompt and a field to the schema. |

If a step prints `API error 403`, wait one minute after you enable the APIs, and run the step again.

## Check your work

```bash
for f in vision speech entities sentiment translate; do
  echo "== $f"; python3 labs/41-ai-apis/show.py "$LAB41_DIR/$f.json" | head -4
done
python3 labs/40-gemini-api/show.py --text "$LAB41_DIR/gemini-1.json"
```

Expected results:

- `vision`: labels for image 1, such as `Street` and `Town`. For image 2, the text `WAITING? | PLEASE | TURN OFF | YOUR | ENGINE`.
- `speech`: a transcript like `how old is the Brooklyn Bridge`, and the billed audio duration.
- `entities`: entities such as `Dublin` with the type `LOCATION`.
- `sentiment`: a document score near 0 or slightly positive, and one sentence score for each sentence.
- `translate`: a German sentence.
- `gemini-1.json`: JSON with the fields `text` and `labels`. The text matches the Vision text, maybe with different line breaks.

## Explore

1. A retailer wants to know which of 20 product categories each customer photo shows. The categories are its own, and they change each season. Do you use Vision label detection or Gemini?

<details><summary>Answer</summary>

Use Gemini with a response schema that lists the categories as an enum. Vision label detection returns generalized labels that Google defines, so you would need a mapping layer that changes each season. With Gemini, you change the prompt or the schema. Use a pre-trained API when one feature matches the task exactly.

</details>

2. A social media app must block unsafe images and toxic comments before it publishes them. It needs the same thresholds every day, at a low cost per item. What do you recommend?

<details><summary>Answer</summary>

Use Vision SafeSearch detection for the images and Natural Language text moderation for the comments. Both return fixed categories with a likelihood or confidence value, so you can set fixed thresholds. SafeSearch has no extra charge when you also request label detection. Moderation units are 100 characters.

</details>

3. A contact center stores 45-minute call recordings in Cloud Storage in the EU. It needs transcripts the next morning, and it wants Chirp 3 for accuracy. What do you change from step 3?

<details><summary>Answer</summary>

Use the V2 `BatchRecognize` method instead of `Recognize`, and use the `eu` multi-region (`eu-speech.googleapis.com` and the location `eu`). Synchronous recognition suits audio shorter than one minute. Batch recognition handles long files in Cloud Storage, and Chirp 3 is GA in the `eu` multi-region. For Chirp 3, speaker diarization is available only in `BatchRecognize`.

</details>

4. A company translates product descriptions. Brand names must never change, and the security team forbids API keys. Which Translation edition and feature do you use?

<details><summary>Answer</summary>

Use Cloud Translation - Advanced (v3) with a glossary. Advanced adds glossaries and regional endpoints, and it uses IAM instead of API keys. Cloud Translation - Basic does not support glossaries or custom models.

</details>

## Clean up

Run the teardown script:

```bash
bash labs/41-ai-apis/teardown.sh
```

The script deletes these items:

- the local work folder `${TMPDIR:-/tmp}/lab41`
- the enablement of the Vision, Speech-to-Text, Natural Language, and Cloud Translation APIs

The lab creates no cloud resources. The Agent Platform API stays enabled, because labs 40 and 42 also use it. Service Usage, which enables and disables APIs, is free of charge.

## Docs used

- [Authenticate with REST: set the quota project](https://docs.cloud.google.com/docs/authentication/rest)
- [Detect labels](https://docs.cloud.google.com/vision/docs/labels)
- [Detect and extract text from images](https://docs.cloud.google.com/vision/docs/ocr)
- [Cloud Vision pricing](https://cloud.google.com/vision/pricing)
- [Chirp 3 Transcription](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)
- [Method: projects.locations.recognizers.recognize (V2)](https://docs.cloud.google.com/speech-to-text/docs/reference/rest/v2/projects.locations.recognizers/recognize)
- [Speech-to-Text pricing](https://cloud.google.com/speech-to-text/pricing)
- [Analyzing entities](https://docs.cloud.google.com/natural-language/docs/analyzing-entities)
- [Analyzing sentiment](https://docs.cloud.google.com/natural-language/docs/analyzing-sentiment)
- [Natural Language API basics](https://docs.cloud.google.com/natural-language/docs/basics)
- [Moderate text](https://docs.cloud.google.com/natural-language/docs/moderating-text)
- [Cloud Natural Language pricing](https://cloud.google.com/products/natural-language/pricing)
- [Translate text with Cloud Translation](https://docs.cloud.google.com/translate/docs/translate-text)
- [Overview of the Cloud Translation API](https://docs.cloud.google.com/translate/docs/api-overview)
- [Cloud Translation pricing](https://cloud.google.com/products/translate/pricing)
- [Structured output](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
- [Gemini 3.1 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite)
- [Agent Platform pricing for generative AI](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing)
- [Service Usage pricing](https://cloud.google.com/service-usage/pricing)
