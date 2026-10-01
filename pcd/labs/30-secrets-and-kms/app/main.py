"""lab30-app: shows which secret version each Cloud Run secret method gives the app.

GET / returns two lines of plain text: the DB_PASSWORD environment variable and
the content of the file /secrets/db/password. Both come from the same secret in
Secret Manager. The lab stores fake values such as "password-v2", so the
response shows the version. Never return a real secret in a response.

There is no Dockerfile, so `gcloud run deploy --source` builds the image with
Google Cloud's buildpacks. With gunicorn in requirements.txt, the default start
command is `gunicorn -b :8080 main:app`.
"""
import os

from flask import Flask

app = Flask(__name__)
SECRET_FILE = "/secrets/db/password"


@app.route("/")
def index():
    # Environment variable: Cloud Run resolved it once, when this instance started.
    env_value = os.environ.get("DB_PASSWORD", "unset")
    # Volume: Cloud Run fetches the secret from Secret Manager when the app reads the file.
    try:
        with open(SECRET_FILE, encoding="utf-8") as f:
            file_value = f.read().strip()
    except OSError as err:
        file_value = f"cannot read the file ({err.strerror})"
    body = f"env  DB_PASSWORD={env_value}\nfile {SECRET_FILE}={file_value}\n"
    return body, 200, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    # Local run only. On Cloud Run, gunicorn serves the app on port 8080.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
