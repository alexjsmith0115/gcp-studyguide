"""lab71-app: a tiny HTTP service for the Cloud Deploy canary lab.

Every request returns one line: the app version and the Cloud Run revision.
The version is fixed at build time (Docker build argument VERSION), so each
build produces a different image. Cloud Run sets K_REVISION for each revision.
Standard library only, so the image builds fast.
"""
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = os.environ.get("APP_VERSION", "dev")
REVISION = os.environ.get("K_REVISION", "local")


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        data = f"{VERSION} {REVISION}\n".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass  # Cloud Run already writes a request log for each request


if __name__ == "__main__":
    ThreadingHTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
