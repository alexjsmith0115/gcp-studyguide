#!/usr/bin/env python3
"""Add or remove the Data Access audit config for one service in an allow policy.

Usage:
  python3 audit_config.py enable SERVICE  < policy.json > new-policy.json
  python3 audit_config.py disable SERVICE < policy.json > new-policy.json

Input is the output of `gcloud projects get-iam-policy PROJECT_ID --format=json`.
The script changes only `auditConfigs`. It keeps `bindings`, `etag`, and
`version`, so `gcloud projects set-iam-policy` does not remove any role binding
and fails safely if someone else changed the policy in the meantime.

Exit code 3 means that there is nothing to change.
"""
import json
import sys


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("enable", "disable"):
        sys.exit(__doc__)
    action, service = sys.argv[1], sys.argv[2]
    policy = json.load(sys.stdin)
    if "bindings" not in policy or "etag" not in policy:
        sys.exit("The policy has no bindings or no etag. Refusing to continue.")

    configs = policy.get("auditConfigs", [])
    others = [c for c in configs if c.get("service") != service]
    if action == "enable":
        others.append({"service": service, "auditLogConfigs": [{"logType": "DATA_READ"}]})
    elif len(others) == len(configs):
        print(f"No audit config for {service}. Nothing to change.", file=sys.stderr)
        sys.exit(3)

    # Keep the key even when the list is empty: set-iam-policy then updates
    # auditConfigs. Without the key, set-iam-policy leaves auditConfigs as is.
    policy["auditConfigs"] = others
    json.dump(policy, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
