"""lab50-app: the Flask app from the Cloud Run Python quickstart.

The lab builds and scans this app. It does not deploy it.
"""
import os

from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello_world():
    """Example Hello World route."""
    name = os.environ.get("NAME", "World")
    return f"Hello {name}!"


if __name__ == "__main__":
    # Local runs only. In the container, gunicorn serves the app (see Dockerfile).
    app.run(debug=True, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
