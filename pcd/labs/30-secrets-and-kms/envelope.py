"""Envelope encryption: a local data encryption key (DEK) and a Cloud KMS key (KEK).

Usage, from the repository root, in the lab shell and the lab virtual environment:
  python pcd/labs/30-secrets-and-kms/envelope.py encrypt INPUT_FILE ENVELOPE_FILE
  python pcd/labs/30-secrets-and-kms/envelope.py decrypt ENVELOPE_FILE > OUTPUT_FILE

The script calls Cloud KMS as the lab30-crypto service account, through
impersonation. You need the Service Account Token Creator role on that service
account. No service account key is used.
"""
import base64
import json
import os
import sys

import google.auth
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from google.auth import impersonated_credentials
from google.cloud import kms

PROJECT_ID = os.environ["PROJECT_ID"]
KEY_NAME = kms.KeyManagementServiceClient.crypto_key_path(
    PROJECT_ID, os.environ["REGION"], "lab30-ring", "lab30-key")
CRYPTO_SA = f"lab30-crypto@{PROJECT_ID}.iam.gserviceaccount.com"


def kms_client():
    # Start from your Application Default Credentials, then get short-lived
    # credentials for the service account. Only that account has a role on the key.
    source, _ = google.auth.default()
    credentials = impersonated_credentials.Credentials(
        source_credentials=source, target_principal=CRYPTO_SA, delegates=[],
        target_scopes=["https://www.googleapis.com/auth/cloud-platform"], lifetime=300)
    return kms.KeyManagementServiceClient(credentials=credentials)


def encrypt(in_path, out_path):
    with open(in_path, "rb") as f:
        data = f.read()
    # Make a new DEK locally for every write: 256-bit AES in Galois Counter Mode (GCM).
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    ciphertext = AESGCM(dek).encrypt(nonce, data, None)
    # Wrap the DEK with the KEK. The KEK never leaves Cloud KMS, and the DEK is only
    # 32 bytes, far below the 64 KiB input limit of the Encrypt method. The docs sample
    # also sends CRC32C checksums to detect corruption in transit; this lab leaves them out.
    wrapped_dek = kms_client().encrypt(request={"name": KEY_NAME, "plaintext": dek}).ciphertext
    # Store the wrapped DEK next to the data. Never store the plaintext DEK.
    envelope = {"kek": KEY_NAME, "wrapped_dek": b64(wrapped_dek), "nonce": b64(nonce),
                "ciphertext": b64(ciphertext)}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(envelope, f, indent=2)
    print(f"Encrypted {len(data)} bytes into {out_path}", file=sys.stderr)


def decrypt(envelope_path):
    with open(envelope_path, encoding="utf-8") as f:
        envelope = json.load(f)
    # Unwrap the DEK. The request names the key, not a key version.
    dek = kms_client().decrypt(
        request={"name": envelope["kek"], "ciphertext": unb64(envelope["wrapped_dek"])}).plaintext
    data = AESGCM(dek).decrypt(unb64(envelope["nonce"]), unb64(envelope["ciphertext"]), None)
    sys.stdout.buffer.write(data)


def b64(raw):
    return base64.b64encode(raw).decode("ascii")


def unb64(text):
    return base64.b64decode(text)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "encrypt":
        encrypt(sys.argv[2], sys.argv[3])
    elif len(sys.argv) == 3 and sys.argv[1] == "decrypt":
        decrypt(sys.argv[2])
    else:
        sys.exit(__doc__)
