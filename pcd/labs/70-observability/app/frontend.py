"""lab70-frontend: /order calls lab70-backend with an ID token, in the same trace."""
import os

import google.auth.transport.requests
import google.oauth2.id_token
import requests
from flask import Flask, request
from opentelemetry import trace

from telemetry import log, setup_tracing

BACKEND_URL = os.environ["BACKEND_URL"]  # the URL of lab70-backend, set by the deploy command
app = Flask(__name__)
setup_tracing(app)


@app.get("/order")
def order():
    item = request.args.get("item", "book")
    path = "/fail" if request.args.get("fail") == "1" else "/price"
    # Service-to-service authentication: an ID token whose audience is the URL of the backend.
    auth_request = google.auth.transport.requests.Request()
    token = google.oauth2.id_token.fetch_id_token(auth_request, BACKEND_URL)
    resp = requests.get(f"{BACKEND_URL}{path}", params={"item": item},
                        headers={"Authorization": f"Bearer {token}"}, timeout=10)
    trace_id = f"{trace.get_current_span().get_span_context().trace_id:032x}"
    if resp.status_code != 200:
        # ERROR without a stack trace: Error Reporting does not create an error event from it.
        log("ERROR", f"order failed: backend returned HTTP {resp.status_code}",
            event="order_failed")
        return {"error": "order failed", "trace_id": trace_id}, 502
    log("INFO", f"order placed for {item}", event="order_placed")
    return {**resp.json(), "trace_id": trace_id}
