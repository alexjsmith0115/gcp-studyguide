"""lab22-steps: small HTTP steps for the Workflows and Cloud Tasks lab.

POST /reserve {"order_id"}               200, but 503 for the first FAIL_FIRST calls for each order
POST /charge  {"order_id", "amount"}     200, or 402 (payment declined) when amount > LIMIT
POST /release {"order_id"}               200: undoes a reservation (the compensation step)
POST /notify  {"order_id", "fail_first"} called by Cloud Tasks: 503 until the retry count reaches fail_first

The 503 answers simulate a short outage of a dependency. The in-memory counter
is only a test aid: a real service keeps state in a database, not in an instance.
"""
import collections
import json
import os
import time

from flask import Flask, request

app = Flask(__name__)
FAIL_FIRST = int(os.environ.get("FAIL_FIRST", "2"))
LIMIT = float(os.environ.get("LIMIT", "100"))
reserve_calls = collections.Counter()


def log(message, **fields):
    # One line of JSON on stdout becomes a structured log entry (jsonPayload) in Cloud Logging.
    print(json.dumps({"message": f"lab22 {message}", **fields}), flush=True)


@app.post("/reserve")
def reserve():
    order_id = request.get_json()["order_id"]
    reserve_calls[order_id] += 1
    if reserve_calls[order_id] <= FAIL_FIRST:
        log("reserve 503", order_id=order_id, call=reserve_calls[order_id])
        # 503 is in http.default_retry_predicate, so the workflow retries this step.
        return {"error": "inventory service unavailable"}, 503
    log("reserve 200", order_id=order_id, call=reserve_calls[order_id])
    return {"order_id": order_id, "reservation": f"r-{order_id}"}


@app.post("/charge")
def charge():
    body = request.get_json()
    if body["amount"] > LIMIT:
        log("charge 402", order_id=body["order_id"], amount=body["amount"])
        # A business error: a retry gives the same answer, so the workflow catches it instead.
        return {"error": "payment declined"}, 402
    log("charge 200", order_id=body["order_id"], amount=body["amount"])
    return {"order_id": body["order_id"], "charged": body["amount"]}


@app.post("/release")
def release():
    order_id = request.get_json()["order_id"]
    log("release 200", order_id=order_id)
    return {"order_id": order_id, "released": True}


@app.post("/notify")
def notify():
    body = request.get_json(force=True)
    # Cloud Tasks adds X-CloudTasks-* headers to each attempt. They give information, not identity.
    retry_count = int(request.headers.get("X-CloudTasks-TaskRetryCount", "0"))
    task = request.headers.get("X-CloudTasks-TaskName", "")
    time.sleep(2)  # Slow work, so that the rate limits of the queue show in the log timestamps.
    if retry_count < int(body.get("fail_first", 0)):
        log("notify 503", task=task, retry_count=retry_count, order_id=body.get("order_id"))
        # Any status outside 200-299 makes Cloud Tasks retry the task, with the backoff of the queue.
        return {"error": "mail server unavailable"}, 503
    log("notify 200", task=task, retry_count=retry_count, order_id=body.get("order_id"))
    return {"sent": True}


if __name__ == "__main__":
    # Local run only. On Cloud Run, the buildpack starts gunicorn on $PORT.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
