#!/usr/bin/env python3
"""A tiny OIDC token issuer for lab 53. It plays the part of a CI system such as GitHub Actions.

Usage:
  python3 fake_idp.py keys DIR
      Create DIR/idp-key.pem (private key) and DIR/jwks.json (public key set).
  python3 fake_idp.py token DIR --iss ISSUER --aud AUDIENCE --sub SUBJECT [--claim NAME=VALUE ...]
      Print a JWT signed with RS256. It is valid for 10 minutes.
  python3 fake_idp.py show TOKEN_FILE
      Print the header and the claims of a JWT. The signature is not shown.
  python3 fake_idp.py save RESPONSE_FILE TOKEN_FILE
      Read a token response from the Security Token Service or the IAM Service Account
      Credentials API. Write the access token to TOKEN_FILE and print the other fields.

The script uses only the Python standard library and the openssl command.
The private key never leaves DIR. Google Cloud gets only the public key set.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time

KID = "lab53-key-1"


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def openssl(args, stdin=None):
    try:
        return subprocess.run(["openssl"] + args, input=stdin, capture_output=True, check=True).stdout
    except FileNotFoundError:
        sys.exit("The openssl command is not installed.")
    except subprocess.CalledProcessError as e:
        sys.exit("openssl failed: " + e.stderr.decode(errors="replace").strip())


def cmd_keys(args):
    os.makedirs(args.dir, exist_ok=True)
    key = os.path.join(args.dir, "idp-key.pem")
    if os.path.exists(key):
        sys.exit(f"{key} exists already. Use a new directory, or delete the file first.")
    openssl(["genrsa", "-out", key, "2048"])
    os.chmod(key, 0o600)
    modulus = openssl(["rsa", "-in", key, "-noout", "-modulus"]).decode().strip()
    n = bytes.fromhex(modulus.split("=", 1)[1])
    jwk = {"kty": "RSA", "alg": "RS256", "use": "sig", "kid": KID, "n": b64url(n), "e": b64url((65537).to_bytes(3, "big"))}
    with open(os.path.join(args.dir, "jwks.json"), "w") as fh:
        json.dump({"keys": [jwk]}, fh, indent=2)
        fh.write("\n")
    print(f"Wrote {key} (private, stays here) and {os.path.join(args.dir, 'jwks.json')} (public).")


def cmd_token(args):
    key = os.path.join(args.dir, "idp-key.pem")
    if not os.path.exists(key):
        sys.exit(f"{key} not found. Run the keys command first.")
    now = int(time.time())
    claims = {"iss": args.iss, "aud": args.aud, "sub": args.sub, "iat": now - 30, "exp": now + 600}
    for item in args.claims:
        name, sep, value = item.partition("=")
        if not sep or not name:
            sys.exit(f"Bad claim {item!r}. Use NAME=VALUE.")
        claims[name] = value
    header = {"alg": "RS256", "typ": "JWT", "kid": KID}
    signing_input = b64url(json.dumps(header).encode()) + "." + b64url(json.dumps(claims).encode())
    signature = openssl(["dgst", "-sha256", "-sign", key], stdin=signing_input.encode())
    print(signing_input + "." + b64url(signature))


def cmd_show(args):
    parts = open(args.token_file).read().strip().split(".")
    if len(parts) != 3:
        sys.exit("This is not a JWT.")
    print(json.dumps({"header": json.loads(b64url_decode(parts[0])),
                      "claims": json.loads(b64url_decode(parts[1]))}, indent=2))


def cmd_save(args):
    try:
        with open(args.response_file) as fh:
            response = json.load(fh)
    except (OSError, ValueError) as e:
        sys.exit(f"Cannot read {args.response_file}: {e}")
    token = response.pop("access_token", None) or response.pop("accessToken", None)
    if not token:
        sys.exit("The response has no access token:\n" + json.dumps(response, indent=2))
    fd = os.open(args.token_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write(token)
    print(json.dumps(response, indent=2))
    print(f"Saved the access token to {args.token_file}. The token is not shown.")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)
    k = sub.add_parser("keys")
    k.add_argument("dir")
    t = sub.add_parser("token")
    t.add_argument("dir")
    t.add_argument("--iss", required=True)
    t.add_argument("--aud", required=True)
    t.add_argument("--sub", required=True)
    t.add_argument("--claim", dest="claims", action="append", default=[], help="an extra claim as NAME=VALUE")
    s = sub.add_parser("show")
    s.add_argument("token_file")
    v = sub.add_parser("save")
    v.add_argument("response_file")
    v.add_argument("token_file")
    args = ap.parse_args()
    {"keys": cmd_keys, "token": cmd_token, "show": cmd_show, "save": cmd_save}[args.command](args)


if __name__ == "__main__":
    main()
