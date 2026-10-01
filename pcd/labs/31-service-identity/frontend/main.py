"""lab31-frontend: calls the private lab31-backend service with an ID token.

GET /                 sends an ID token whose audience is the backend URL
GET /?token=none      sends no token
GET /?token=wrong-aud sends an ID token for another audience

The response shows the HTTP status code that the backend returned.
The token code follows the Python sample in "Authenticating service-to-service".
"""
import os
import urllib.error
import urllib.request

import google.auth.transport.requests
import google.oauth2.id_token
from flask import Flask, request

app = Flask(__name__)
# The URL of the receiving service is also the audience (aud claim) of the token.
BACKEND_URL = os.environ.get("BACKEND_URL", "")


@app.route("/")
def call_backend():
    if not BACKEND_URL:
        return "Set the BACKEND_URL environment variable.\n", 500
    mode = request.args.get("token", "ok")
    req = urllib.request.Request(BACKEND_URL)
    if mode != "none":
        audience = BACKEND_URL if mode == "ok" else "https://example.com"
        # On Cloud Run, fetch_id_token gets a Google-signed ID token from the metadata
        # server, for the service identity of this service. There is no key file.
        auth_req = google.auth.transport.requests.Request()
        token = google.oauth2.id_token.fetch_id_token(auth_req, audience)
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = f"backend status {resp.status}: {resp.read().decode()}"
    except urllib.error.HTTPError as err:
        body = f"backend status {err.code}\n"
    return body, 200, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    # Local run only. On Cloud Run, gunicorn serves the app on port 8080.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
