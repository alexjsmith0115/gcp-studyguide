"""lab70-shop: a tiny HTTP service for the observability lab.

Routes:
  /healthz   always 200 (target of the uptime check)
  /checkout  200, or 500 for a share of requests set by FAIL_RATE (0.0 to 1.0)

Each checkout writes one structured JSON log line to stdout. Cloud Run
parses it into jsonPayload, and the "severity" field sets the entry severity.
Standard library only, so the image builds fast.
"""
import json
import os
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FAIL_RATE = float(os.environ.get("FAIL_RATE", "0"))


def log(severity, message, **fields):
    print(json.dumps({"severity": severity, "message": message, **fields}), flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/healthz"):
            self.reply(200, {"status": "healthy"})
        elif self.path.startswith("/checkout"):
            order_id = f"o-{random.randint(100000, 999999)}"
            if random.random() < FAIL_RATE:
                log("ERROR", "payment failed", event="payment_failed", order_id=order_id)
                self.reply(500, {"status": "error", "order_id": order_id})
            else:
                log("INFO", "order placed", event="order_placed", order_id=order_id)
                self.reply(200, {"status": "ok", "order_id": order_id})
        else:
            self.reply(404, {"status": "not found"})

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass  # Cloud Run already writes a request log for each request


if __name__ == "__main__":
    ThreadingHTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
