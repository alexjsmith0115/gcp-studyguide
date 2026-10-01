"""lab13: call Gemini on Agent Platform with the Google Gen AI SDK. Run one part:
basic, config, stream, or schema. The client gets the project, the location, and the model
from the lab shell. ADC from pcd/labs/00-setup gives the credentials.
"""
import json
import logging
import os
import sys
import time

from google import genai
from google.genai import types

MODEL = os.environ["LAB13_MODEL"]
LOCATION = os.environ["LAB13_LOCATION"]
PROMPT = "In five sentences, explain what a Cloud Run revision is."
# Retry only transient errors (408, 429, and 5xx), with exponential backoff and jitter.
# attempts=3 is the first request and at most two retries.
RETRY = types.HttpRetryOptions(attempts=3, initial_delay=1.0, exp_base=2.0, max_delay=8.0,
                               jitter=1.0, http_status_codes=[408, 429, 500, 502, 503, 504])


def show_usage(response):
    u = response.usage_metadata  # the token counts that billing uses
    print(f"  usage_metadata: input {u.prompt_token_count}, output {u.candidates_token_count},"
          f" thinking {u.thoughts_token_count or 0}, total {u.total_token_count}")


def basic(client):
    # The Count Tokens API has no charge. It gives the input size before you send the prompt.
    count = client.models.count_tokens(model=MODEL, contents=PROMPT)
    print(f"  count_tokens: {count.total_tokens} input tokens")
    response = client.models.generate_content(model=MODEL, contents=PROMPT)
    print(response.text)
    show_usage(response)


def config(client):
    settings = types.GenerateContentConfig(
        system_instruction="You explain Google Cloud to new developers in short, plain sentences.",
        temperature=0.2,       # less random than the default, 1.0
        max_output_tokens=30,  # a hard limit for the response length, and so for its cost
    )
    response = client.models.generate_content(model=MODEL, contents=PROMPT, config=settings)
    print(response.text or "")
    # Check the finish reason before you use the text.
    print(f"  finish_reason: {response.candidates[0].finish_reason.name}")
    show_usage(response)


def stream(client):
    start, times = time.monotonic(), []  # the arrival time of each chunk
    for chunk in client.models.generate_content_stream(model=MODEL, contents=PROMPT):
        times.append(time.monotonic() - start)
        print(chunk.text or "", end="", flush=True)
    print(f"\n  {len(times)} chunks: first after {times[0]:.1f} s, last after {times[-1]:.1f} s")


# A response schema: a list of objects. Each object must have the three fields in `required`.
SCHEMA = {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
    "service": {"type": "STRING", "description": "The Google Cloud product name"},
    "serverless": {"type": "BOOLEAN"},
    "use_case": {"type": "STRING", "description": "One typical use, in one short sentence"},
}, "required": ["service", "serverless", "use_case"]}}


def schema(client):
    settings = types.GenerateContentConfig(response_mime_type="application/json",
                                           response_schema=SCHEMA)
    prompt = "List three Google Cloud services that run containers."
    response = client.models.generate_content(model=MODEL, contents=prompt, config=settings)
    for row in json.loads(response.text):  # valid JSON, because the request sets both fields
        print(f"  {row['service']:<24} serverless={row['serverless']!s:<6} {row['use_case']}")
    show_usage(response)


if __name__ == "__main__":
    # Log each HTTP request: the endpoint host, the API version, the location, and the method.
    logging.basicConfig(format="  %(message)s")
    logging.getLogger("httpx").setLevel(logging.INFO)
    # enterprise=True selects the Gemini API on Agent Platform. env.sh sets GOOGLE_CLOUD_PROJECT.
    lab13_client = genai.Client(
        enterprise=True, project=os.environ["GOOGLE_CLOUD_PROJECT"], location=LOCATION,
        http_options=types.HttpOptions(api_version="v1", timeout=120 * 1000,  # milliseconds
                                       retry_options=RETRY))
    parts = {"basic": basic, "config": config, "stream": stream, "schema": schema}
    parts[sys.argv[1]](lab13_client)
