"""lab20-receiver: a Cloud Run service that receives Cloud Storage events from Eventarc.

Eventarc sends each event as an HTTP POST to "/" in CloudEvents binary content
mode. The context attributes are HTTP headers with the prefix "ce-", and the
request body is the event data. For direct Cloud Storage events, the body is a
StorageObjectData JSON object with the fields of the Cloud Storage Objects
resource (bucket, name, generation, size, and more).

The handler writes one structured log line for each event. To show retries, it
returns HTTP 500 for objects whose name starts with FAIL_PREFIX (an environment
variable). Eventarc delivers the event again until the service returns 2xx.
"""
import json
import os

from flask import Flask, request

app = Flask(__name__)
FAIL_PREFIX = os.environ.get("FAIL_PREFIX", "")


@app.post("/")
def receive():
    # Binary content mode: each CloudEvents attribute is a "ce-" header.
    # source + id identify one event. A retry of an event has the same source and id,
    # so a real handler uses them as an idempotency key.
    ce = {key: request.headers.get(f"ce-{key}") for key in ("id", "source", "type", "subject", "time")}
    # Direct Cloud Storage events use the content type application/json.
    data = request.get_json(silent=True) or {}
    name = data.get("name", "")
    failing = bool(FAIL_PREFIX) and name.startswith(FAIL_PREFIX)

    # One line of JSON on stdout becomes a structured log entry (jsonPayload).
    # Cloud Logging moves "severity" to the severity field of the log entry.
    print(json.dumps({
        "severity": "ERROR" if failing else "INFO",
        "message": f"lab20 {'FAILED' if failing else 'received'} gs://{data.get('bucket')}/{name}",
        "ce": ce,
        "generation": data.get("generation"),
        "size": data.get("size"),
    }), flush=True)

    # Only a 2xx response acknowledges the event. Any other status makes Eventarc retry it.
    if failing:
        return "simulated processing error\n", 500
    return "", 204


if __name__ == "__main__":
    # Local run only. On Cloud Run, the buildpack starts gunicorn on $PORT.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
