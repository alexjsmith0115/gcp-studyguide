"""lab12: call the Cloud Storage API with the Python client library, as lab12-caller.

Part 1 lists the bucket in pages, with a partial response.
Part 2 gets a permanent error (403). The retry policy does not retry it.
Part 3 gets a transient error. The retry policy retries it until the timeout.
"""
import os
import time

import google.auth
import requests
from google.api_core import exceptions
from google.api_core.retry import Retry
from google.auth import impersonated_credentials
from google.cloud import storage

BUCKET = os.environ["LAB12_BUCKET"]
CALLER_SA = os.environ["CALLER_SA"]
# The Cloud Storage retry strategy: retry HTTP 408, 429, and 5xx, and lost connections.
TRANSIENT_CODES = {408, 429, 500, 502, 503, 504}


def is_transient(exc):
    """The retry predicate: True only for errors that a later attempt can fix."""
    if isinstance(exc, exceptions.GoogleAPICallError):
        return exc.code in TRANSIENT_CODES  # 400, 403, and 404 are permanent
    return isinstance(exc, (ConnectionError, requests.exceptions.ConnectionError))


def log_retry(exc):
    print(f"  {time.strftime('%X')} transient error, retry after a backoff: {type(exc).__name__}")


# Truncated exponential backoff with jitter. The first wait is up to `initial`
# seconds. The limit grows by `multiplier` after each attempt, up to `maximum`.
# The retries stop after `timeout` seconds.
RETRY = Retry(predicate=is_transient, initial=1.0, multiplier=2.0, maximum=8.0,
              timeout=20.0, on_error=log_retry)


def caller_client():
    # ADC holds your user credentials. Your user has the Service Account Token
    # Creator role on lab12-caller, so it can get short-lived tokens for it.
    source, project = google.auth.default()
    creds = impersonated_credentials.Credentials(
        source_credentials=source, target_principal=CALLER_SA,
        target_scopes=["https://www.googleapis.com/auth/devstorage.read_only"])
    return storage.Client(project=project, credentials=creds)


def list_in_pages(client):
    print("Part 1: list the objects, 3 on each page, with a partial response")
    # Each page is one API request. `fields` asks for the names and the page token only.
    blobs = client.list_blobs(BUCKET, page_size=3, fields="items(name),nextPageToken",
                              retry=RETRY, timeout=10)
    for page in blobs.pages:
        names = [blob.name for blob in page]
        print(f"  page {blobs.page_number}: {page.num_items} objects {names}")
    print(f"  total: {blobs.num_results} objects")


def permanent_error(client):
    print("Part 2: read the bucket metadata (lab12-caller has no storage.buckets.get)")
    try:
        client.get_bucket(BUCKET, retry=RETRY, timeout=10)
    except exceptions.Forbidden as exc:  # the predicate is False, so no retry
        print(f"  HTTP {exc.code} at once, no retry: {exc.message}")


def transient_error():
    print("Part 3: call a local address where nothing listens (connection refused)")
    offline = storage.Client(project="lab12-offline", use_auth_w_custom_endpoint=False,
                             client_options={"api_endpoint": "http://127.0.0.1:1"})
    start = time.monotonic()
    try:
        list(offline.list_blobs(BUCKET, retry=RETRY, timeout=2))
    except exceptions.RetryError as exc:  # the retries stopped because of `timeout`
        print(f"  RetryError after {time.monotonic() - start:.0f} seconds: {exc.message}")


if __name__ == "__main__":
    lab12_client = caller_client()
    list_in_pages(lab12_client)
    permanent_error(lab12_client)
    transient_error()
