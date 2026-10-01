"""Integration tests: real HTTP requests to the app container, which uses a real Redis container.

Cloud Build runs these tests in a step on the cloudbuild Docker network (see cloudbuild.yaml).
APP_URL is the address of the app container on that network.
"""
import json
import os
import time
import urllib.error
import urllib.request
import uuid

import pytest

APP_URL = os.environ.get("APP_URL", "http://localhost:8080")


def post(path):
    """Send a POST request. Return the HTTP status and the JSON body (None for an error)."""
    request = urllib.request.Request(APP_URL + path, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, None


@pytest.fixture(scope="session", autouse=True)
def wait_for_app():
    """The app container starts in the background. Wait up to 30 seconds for it."""
    for _ in range(30):
        try:
            with urllib.request.urlopen(APP_URL + "/healthz", timeout=2):
                return
        except OSError:
            time.sleep(1)
    pytest.fail(f"The app at {APP_URL} did not start.")


def test_counter_is_stored_in_redis():
    name = f"it-{uuid.uuid4().hex[:8]}"  # A new counter for each test run.
    assert post(f"/counters/{name}") == (200, {"name": name, "count": 1})
    assert post(f"/counters/{name}") == (200, {"name": name, "count": 2})


def test_invalid_name_returns_400():
    assert post("/counters/Not_Valid")[0] == 400
