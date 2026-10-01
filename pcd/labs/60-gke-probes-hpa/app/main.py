"""lab60-app: a small web server for the probe and autoscaling lab.

The probe endpoints follow the pattern in
https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/

GET /         CPU work, then the Pod name. The load generator calls this path.
GET /healthz  The liveness and startup probes: 200, or 500 after /break.
GET /ready    The readiness probe: 503 during the warm-up, then 200.
GET /break    Makes /healthz fail, so that the kubelet restarts the container.
"""
import hashlib
import os
import signal
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STARTUP_SECONDS = int(os.environ.get("STARTUP_SECONDS", "20"))  # slow start: the port stays closed
WARMUP_SECONDS = int(os.environ.get("WARMUP_SECONDS", "30"))  # the port is open, but not ready
POD = socket.gethostname()
state = {"broken": False, "ready_at": float("inf")}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":  # checks only this process, never a database or another service
            broken = state["broken"]
            self.reply(500 if broken else 200, "broken" if broken else "ok")
        elif self.path == "/ready":  # fails until the warm-up ends, for example a cache load
            ready = time.monotonic() >= state["ready_at"]
            self.reply(200 if ready else 503, "ready" if ready else "warming up")
        elif self.path == "/break":
            state["broken"] = True
            self.reply(200, f"{POD}: /healthz returns 500 from now on")
        else:
            # CPU work for the HPA. The hash runs outside the Python lock,
            # so that the probe requests still get answers under load.
            hashlib.pbkdf2_hmac("sha256", b"lab60", b"salt", 100_000)
            self.reply(200, f"Hello from {POD}")

    def reply(self, code, text):
        body = f"{text}\n".encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # no log line for each probe request
        pass


def drain(*_):
    # Kubernetes removes the Pod from the endpoints asynchronously. Do not stop at
    # once on SIGTERM: fail readiness, serve for 5 more seconds, then stop.
    state["ready_at"] = float("inf")
    threading.Timer(5, server.shutdown).start()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # not serving yet: stop at once
    time.sleep(STARTUP_SECONDS)  # a slow start, for example a large file to load
    state["ready_at"] = time.monotonic() + WARMUP_SECONDS
    server = ThreadingHTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler)
    signal.signal(signal.SIGTERM, drain)
    server.serve_forever()
