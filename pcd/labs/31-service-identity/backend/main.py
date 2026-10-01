"""lab31-backend: a private Cloud Run service that shows who called it.

Cloud Run checks the ID token and the caller's run.routes.invoke permission
before a request reaches this code. A request without both never arrives here.
The app only reads the claims of the token to show the caller. It does not
verify the token again.
"""
import base64
import json
import os

from flask import Flask, request

app = Flask(__name__)


def token_claims():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return {}
    # A JWT has three base64url parts: header.payload.signature. Read the payload.
    payload = auth.split(" ", 1)[1].split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


@app.route("/")
def hello():
    claims = token_claims()
    # email: the caller's address, when the token has it. sub: the caller's unique ID.
    # aud: the audience that the caller asked for.
    body = (f"hello from lab31-backend: email={claims.get('email', '-')} "
            f"sub={claims.get('sub', '-')} aud={claims.get('aud', '-')}\n")
    return body, 200, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    # Local run only. On Cloud Run, gunicorn serves the app on port 8080.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
