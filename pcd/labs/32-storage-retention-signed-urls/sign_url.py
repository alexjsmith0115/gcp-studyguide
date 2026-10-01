"""lab32: create a V4 signed URL as lab32-signer, with no service account key.

usage: python sign_url.py GET OBJECT_NAME
       python sign_url.py PUT OBJECT_NAME

The URL is valid for 15 minutes. A PUT request must send "Content-Type: text/plain".
The script works like code on Cloud Run that signs as its attached service account:
it gets an access token for lab32-signer, and then the IAM Credentials API (signBlob)
signs as lab32-signer. Google keeps the private key, and no key file exists.
"""
import datetime
import os
import sys

import google.auth
import google.auth.transport.requests
from google.auth import impersonated_credentials
from google.cloud import storage

PROJECT_ID = os.environ["PROJECT_ID"]
BUCKET = f"lab32-{PROJECT_ID}"
SIGNER_SA = f"lab32-signer@{PROJECT_ID}.iam.gserviceaccount.com"
CLOUD_PLATFORM = ["https://www.googleapis.com/auth/cloud-platform"]


def signer_credentials():
    """Short-lived credentials for lab32-signer.

    On Cloud Run, ADC gives the attached service account directly. Here, your ADC
    user credentials impersonate lab32-signer. Your user needs the Service Account
    Token Creator role on lab32-signer.
    """
    source, _ = google.auth.default(scopes=CLOUD_PLATFORM)
    creds = impersonated_credentials.Credentials(
        source_credentials=source, target_principal=SIGNER_SA,
        target_scopes=CLOUD_PLATFORM, lifetime=300)
    creds.refresh(google.auth.transport.requests.Request())
    return creds


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("GET", "PUT"):
        sys.exit(__doc__)
    method, name = sys.argv[1], sys.argv[2]
    creds = signer_credentials()
    blob = storage.Client(project=PROJECT_ID, credentials=creds).bucket(BUCKET).blob(name)
    url = blob.generate_signed_url(
        version="v4",
        # A V4 signed URL can be valid for at most 7 days (604,800 seconds).
        expiration=datetime.timedelta(minutes=15),
        method=method,
        # For PUT, Content-Type is part of the signature. The upload must send the same value.
        content_type="text/plain" if method == "PUT" else None,
        # The library calls signBlob for lab32-signer with lab32-signer's own token, so
        # lab32-signer needs the Service Account Token Creator role on itself.
        service_account_email=SIGNER_SA,
        access_token=creds.token,
    )
    # Cloud Storage runs each request with the URL as lab32-signer, so lab32-signer
    # needs a Cloud Storage role that allows the request.
    print(url)


if __name__ == "__main__":
    main()
