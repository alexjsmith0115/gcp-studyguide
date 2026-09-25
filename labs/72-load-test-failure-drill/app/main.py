"""Small HTTP app for lab 72. The same file runs on Cloud Run and on the lab72 VMs.

Endpoints:
  /healthz      returns 200 "ok" (for health checks)
  /work?ms=N    waits N milliseconds (0 to 10000), then returns JSON
  /             the same as /work?ms=0

The wait simulates a slow dependency, such as a database call. The JSON names
the process ("instance") and the machine ("host") that answered, so the load
generator can count how many instances or VMs served the traffic.
"""
import json
import os
import socket
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

INSTANCE = uuid.uuid4().hex[:8]
HOST = socket.gethostname()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep connections open between requests

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/healthz":
            self._send(200, "text/plain", b"ok\n")
            return
        if url.path not in ("/", "/work"):
            self._send(404, "text/plain", b"not found\n")
            return
        try:
            ms = int(parse_qs(url.query).get("ms", ["0"])[0])
        except ValueError:
            ms = 0
        ms = max(0, min(ms, 10000))
        time.sleep(ms / 1000)
        body = json.dumps({"instance": INSTANCE, "host": HOST, "ms": ms}).encode() + b"\n"
        self._send(200, "application/json", body)

    def _send(self, code, content_type, body):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass  # Cloud Run and the load balancer already log each request


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    ThreadingHTTPServer(("", port), Handler).serve_forever()
