"""lab10-app: a small web service for the Cloud Run source deploy lab.

GET / returns one line of plain text: the revision that served the request and
the APP_VERSION setting of that revision. The lab counts these lines to show
how Cloud Run splits traffic between revisions.

There is no Dockerfile in this folder, so `gcloud run deploy --source` builds
the image with Google Cloud's buildpacks. The buildpack finds Python from
requirements.txt, and the Procfile sets the start command.
"""
import os

from flask import Flask

app = Flask(__name__)


@app.route("/")
def index():
    # Cloud Run sets K_REVISION in every container (container runtime contract).
    revision = os.environ.get("K_REVISION", "local")
    # Configuration comes from environment variables. The lab sets APP_VERSION
    # with --set-env-vars and --update-env-vars, and each change makes a new revision.
    version = os.environ.get("APP_VERSION", "unset")
    return f"revision={revision} version={version}\n", 200, {"Content-Type": "text/plain"}


if __name__ == "__main__":
    # Local run only. On Cloud Run, the Procfile starts gunicorn on $PORT.
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
