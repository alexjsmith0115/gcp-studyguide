"""lab52-app: a visit counter, based on the Memorystore for Redis sample for Cloud Run.

Redis keeps the counts, so all instances of the app share them. In production, REDISHOST is
the IP address of a Memorystore instance. In the Cloud Build integration tests, it is the
name of the Redis container on the cloudbuild Docker network (see cloudbuild.yaml).
"""
import os
import re

import redis
from flask import Flask, abort, jsonify

app = Flask(__name__)

redis_host = os.environ.get("REDISHOST", "localhost")
redis_port = int(os.environ.get("REDISPORT", 6379))
# The unit tests replace this client with a fake. The integration tests use a real Redis.
redis_client = redis.Redis(host=redis_host, port=redis_port)

NAME = re.compile(r"^[a-z0-9-]{1,32}$")


def counter_key(name):
    """Check the counter name, and return the Redis key for it."""
    if not NAME.match(name):
        raise ValueError(f"invalid counter name: {name!r}")
    return f"counter:{name}"


@app.post("/counters/<name>")
def increment(name):
    """Add 1 to a counter, and return the new value."""
    try:
        key = counter_key(name)
    except ValueError:
        abort(400)
    return jsonify(name=name, count=redis_client.incr(key, 1))


@app.get("/healthz")
def healthz():
    """Tell the tests that the server runs. This check does not use Redis."""
    return "ok"
