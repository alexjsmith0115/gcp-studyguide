"""lab21-receiver: a Cloud Run service that receives Pub/Sub push messages.

Pub/Sub sends each message as an HTTP POST with a JSON body (the "wrapped"
format). The body has a "message" object and the subscription name. The
message data is base64-encoded, and the attributes are a map of strings.

The handler expects JSON data. It acknowledges a message that it can process,
and it rejects a message whose data is not JSON (a "poison" message). Pub/Sub
retries a rejected message, and the dead-letter topic of the subscription
gets it after the maximum number of delivery attempts.
"""
import base64
import json
import os

from flask import Flask, request

app = Flask(__name__)


@app.post("/")
def receive():
    envelope = request.get_json(silent=True)
    if not isinstance(envelope, dict) or "message" not in envelope:
        return "Bad Request: invalid Pub/Sub message format\n", 400

    message = envelope["message"]
    text = base64.b64decode(message.get("data", "")).decode("utf-8", errors="replace")
    fields = {
        "message_id": message.get("messageId"),
        "attributes": message.get("attributes", {}),
        "ordering_key": message.get("orderingKey"),
        # deliveryAttempt is in the request only when the subscription has a dead-letter topic.
        "delivery_attempt": envelope.get("deliveryAttempt"),
    }
    try:
        order = json.loads(text)
    except ValueError:
        print(json.dumps({"severity": "ERROR", "message": f"lab21 cannot parse {text[:40]!r}", **fields}), flush=True)
        # Any status except 102, 200, 201, 202, and 204 is a negative acknowledgment (nack).
        # Pub/Sub sends the message again after the retry delay of the subscription.
        return "Bad Request: the message data is not JSON\n", 400

    print(json.dumps({"severity": "INFO", "message": f"lab21 processed {order.get('order_id')}", **fields}), flush=True)
    # 204 acknowledges the message. Acknowledge only after the work is done.
    return "", 204


if __name__ == "__main__":
    # Local run only. On Cloud Run, the buildpack starts gunicorn on $PORT.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
