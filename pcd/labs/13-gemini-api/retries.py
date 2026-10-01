"""lab13: how the Google Gen AI SDK handles 429 errors, with a local test server.

The real service seldom returns 429 to a few requests. So this script starts a small HTTP
server on 127.0.0.1 that returns the status codes in a plan. No request leaves your
computer, and Google charges nothing.
"""
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from google import genai
from google.genai import errors, types

from gemini_lab import MODEL, RETRY

# Response bodies in the format of the Agent Platform API. 429 has the pay-as-you-go message.
ANSWER = {"role": "model", "parts": [{"text": "Hello from the test server."}]}
BODIES = {
    200: {"candidates": [{"content": ANSWER, "finishReason": "STOP"}]},
    400: {"error": {"code": 400, "status": "INVALID_ARGUMENT", "message": "Test: bad request."}},
    429: {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED",
                    "message": "Resource exhausted, please try again later."}},
}


class TestServer(BaseHTTPRequestHandler):
    plan, start = [], 0.0  # the status codes to return, in order

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        code = TestServer.plan.pop(0)
        print(f"    test server: request at {time.monotonic() - TestServer.start:.1f} s,"
              f" returns {code}")
        body = json.dumps(BODIES[code]).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # the print above replaces the default log line
        pass


def call(base_url, title, plan, retry_options=None):
    print(title)
    TestServer.plan, TestServer.start = list(plan), time.monotonic()
    # A custom base URL sends the requests to the test server, with a test token, not your ADC.
    client = genai.Client(enterprise=True, http_options=types.HttpOptions(
        base_url=base_url, headers={"Authorization": "Bearer test-token"},
        retry_options=retry_options))
    try:
        response = client.models.generate_content(model=MODEL, contents="Hello")
        print(f"  result: {response.text}")
    except errors.APIError as exc:  # ClientError for 4xx codes, ServerError for 5xx codes
        print(f"  result: {type(exc).__name__} {exc.code} {exc.status}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 0), TestServer)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}"
    call(url, "Part A: no retry_options, one 429 error", [429])
    call(url, "Part B: retry_options, two 429 errors, then success", [429, 429, 200], RETRY)
    call(url, "Part C: retry_options, a 400 error", [400], RETRY)
    call(url, "Part D: retry_options, a 429 error on each attempt", [429, 429, 429], RETRY)
    server.shutdown()
