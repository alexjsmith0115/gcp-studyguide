---
id: 52-iap-ssh
title: "SSH without external IPs: IAP TCP forwarding and OS Login"
objectives: ["3.1"]
minutes: 40
cost: "Usually no charge. The Compute Engine Free Tier covers one e2-micro VM and 30 GB-months of standard persistent disk in us-central1, us-east1, and us-west1. Outside the Free Tier, you pay the e2-micro rate while the VM runs. IAP TCP forwarding for Google Cloud VMs has no charge. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Connect to a VM that has no external IP address and no SSH keys in metadata. IAP TCP forwarding carries the connection, OS Login decides who can log in, and an IAM condition limits a service account to port 22.

## Exam relevance

- IAP TCP forwarding and OS Login replace a bastion host and SSH from the internet: [Secure remote and workload access](note:3.1-secure-access).
- The Require OS Login constraint enforces OS Login everywhere: [Organization policy, VPC Service Controls, and audit logging](note:3.1-security-controls).
- IAM Conditions on the IAP-secured Tunnel User role, and impersonation to test a permission set: [IAM, resource hierarchy, and separation of duties](note:3.1-iam-and-hierarchy).
- Firewall rules for the IAP range: [Network security controls](note:2.1-network-security).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI, an SSH client with `ssh-keyscan` (OpenSSH), and `curl`. The first `gcloud compute ssh` command can create an SSH key for you.
- Time: about 40 minutes.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com iap.googleapis.com oslogin.googleapis.com \
  iam.googleapis.com iamcredentials.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export VM="lab52-vm"
export SA_EMAIL="lab52-tunnel@${PROJECT_ID}.iam.gserviceaccount.com"
export USER_EMAIL="$(gcloud config get account)"
export LAB52_TMP="$(mktemp -d)"
echo "vm=${VM} sa=${SA_EMAIL} user=${USER_EMAIL}"
```

## Steps

1. Create a custom mode VPC network and a subnet. The subnet has no Private Google Access and no NAT, so the VM has no path to the internet.

   ```bash
   gcloud compute networks create lab52-vpc --subnet-mode=custom
   gcloud compute networks subnets create lab52-subnet --network=lab52-vpc \
     --region="$REGION" --range=10.52.0.0/24
   ```

2. Allow ingress only from the IAP TCP forwarding range. The rule opens port 22 for SSH and port 8080 for a test web server, only on VMs with the `lab52-iap` tag.

   ```bash
   gcloud compute firewall-rules create lab52-allow-iap --network=lab52-vpc \
     --direction=INGRESS --action=allow --rules=tcp:22,tcp:8080 \
     --source-ranges=35.235.240.0/20 --target-tags=lab52-iap
   ```

3. Create the VM with no external IP address and no service account, and turn on OS Login. A user who logs in to a VM can use the permissions of its service account, and this VM needs none.

   ```bash
   gcloud compute instances create "$VM" --zone="$ZONE" \
     --machine-type=e2-micro --subnet=lab52-subnet --no-address \
     --image-family=debian-13 --image-project=debian-cloud \
     --boot-disk-size=10GB --boot-disk-type=pd-standard \
     --no-service-account --no-scopes \
     --metadata=enable-oslogin=TRUE --tags=lab52-iap --shielded-secure-boot
   gcloud compute instances describe "$VM" --zone="$ZONE" \
     --format="yaml(networkInterfaces[0].networkIP, networkInterfaces[0].accessConfigs, serviceAccounts, metadata.items)"
   ```

   The output shows an internal IP address and `enable-oslogin: TRUE`. It has no `accessConfigs` (no external IP address) and no `serviceAccounts`.

4. Connect through IAP as yourself, and check your Linux user and `sudo`. OS Login creates the Linux user from your Google identity. The Owner role includes the admin login permission, so `sudo` works.

   ```bash
   gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap \
     --command='echo "user: $(id -un)"; sudo -n true && echo "sudo: allowed"'
   ```

   Expected: `user: USERNAME_DOMAIN_SUFFIX` (for example `user: alex_example_com`), then `sudo: allowed`. If the command fails with error `4003`, the VM is still starting. Wait one minute and try again.

5. Look at your OS Login profile. Your SSH public key is in the profile, not in project or instance metadata.

   ```bash
   gcloud compute os-login describe-profile --format="yaml(posixAccounts[0].username, sshPublicKeys)"
   ```

6. Forward a port other than SSH. Start a small web server on port 8080 of the VM. Then open an IAP tunnel from local port 8052 to it. Any TCP service works this way, for example the admin port of a database.

   ```bash
   gcloud compute ssh "$VM" --zone="$ZONE" --tunnel-through-iap \
     --command='mkdir -p ~/site && echo "hello from lab52-vm" > ~/site/index.html; nohup python3 -m http.server 8080 --directory ~/site > /dev/null 2>&1 < /dev/null &'
   gcloud compute start-iap-tunnel "$VM" 8080 --local-host-port=localhost:8052 --zone="$ZONE" \
     > "${LAB52_TMP}/tunnel-8080.log" 2>&1 &
   export TUNNEL_PID=$!
   sleep 8
   curl -s http://localhost:8052/
   kill "$TUNNEL_PID"
   ```

   Expected: `hello from lab52-vm`. The web server has no public address. Only principals with the tunnel role reach it, and only through IAP.

7. Create a service account that can open tunnels to port 22 only. The condition on the IAP-secured Tunnel User role checks the destination port. The Compute Viewer role lets gcloud look up the VM. You impersonate the service account to test the rule, because your Owner role allows every port.

   ```bash
   gcloud iam service-accounts create lab52-tunnel --display-name="lab52 tunnel user"
   gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" \
     --role=roles/iap.tunnelResourceAccessor \
     --condition='expression=destination.port == 22,title=lab52-ssh-port-only' --format=none
   gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA_EMAIL}" \
     --role=roles/compute.viewer --condition=None --format=none
   gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
     --member="user:${USER_EMAIL}" --role=roles/iam.serviceAccountTokenCreator --format=none
   ```

   The project policy now has a conditional binding. For each later binding, gcloud needs `--condition`, even when the value is `None`.

   A new service account can take 60 seconds or more to become usable. If a command reports that the service account does not exist, wait 60 seconds and run it again ([Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)).

8. Wait for the IAM changes, then open two tunnels as the service account. The tunnel to port 22 works. The tunnel to port 8080 fails, because the condition allows only port 22.

   ```bash
   sleep 120
   gcloud compute start-iap-tunnel "$VM" 22 --local-host-port=localhost:2252 --zone="$ZONE" \
     --impersonate-service-account="$SA_EMAIL" > "${LAB52_TMP}/tunnel-22.log" 2>&1 &
   export TUNNEL_PID=$!
   sleep 8
   ssh-keyscan -p 2252 localhost 2>/dev/null | head -1
   kill "$TUNNEL_PID"
   gcloud compute start-iap-tunnel "$VM" 8080 --local-host-port=localhost:8053 --zone="$ZONE" \
     --impersonate-service-account="$SA_EMAIL"
   ```

   `ssh-keyscan` prints one host key of the VM, which proves that the TCP connection to port 22 works. The last command fails with error code `4033`, a permission problem ([Identity-Aware Proxy FAQ](https://docs.cloud.google.com/iap/docs/faq)). If the port 22 tunnel also fails with `4033`, the IAM changes are not in effect yet. Wait two minutes and run this step again.

## Check your work

1. The VM has no external IP address and no service account:

   ```bash
   gcloud compute instances describe "$VM" --zone="$ZONE" \
     --format="value(networkInterfaces[0].accessConfigs, serviceAccounts)"
   ```

   Expected: an empty line.

2. The firewall rule allows only the IAP range:

   ```bash
   gcloud compute firewall-rules describe lab52-allow-iap --format="value(sourceRanges, allowed)"
   ```

   Expected: `35.235.240.0/20` and the ports 22 and 8080.

3. The service account has the tunnel role only with the port condition:

   ```bash
   gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
     --filter="bindings.members:${SA_EMAIL}" --format="table(bindings.role, bindings.condition.expression)"
   ```

   Expected: `roles/iap.tunnelResourceAccessor` with `destination.port == 22`, and `roles/compute.viewer` with no condition.

## Explore

1. A contractor from another company needs SSH access to one VM for one week. What do you grant?

   <details><summary>Answer</summary>

   Grant IAP-secured Tunnel User on that VM only, not on the project, and add an expiry condition ([Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding), [Overview of IAM Conditions](https://docs.cloud.google.com/iam/docs/conditions-overview)). Grant `roles/compute.osLogin` (no `sudo`) on the VM. To connect with gcloud, the contractor also needs a project-level role that contains `compute.projects.get`. A user from a different organization also needs `roles/compute.osLoginExternalUser`, which an organization administrator grants on the organization ([Set up OS Login](https://docs.cloud.google.com/compute/docs/oslogin/set-up-oslogin)). For repeated requests with approvals, use Privileged Access Manager.

   </details>

2. The security team wants all VMs to use OS Login with 2-step verification. How do you enforce that?

   <details><summary>Answer</summary>

   Set `enable-oslogin` and `enable-oslogin-2fa` to `TRUE` in project metadata. Both must be `TRUE` to enforce 2-step verification ([Set up OS Login](https://docs.cloud.google.com/compute/docs/oslogin/set-up-oslogin)). To stop anyone from turning OS Login off, enforce the Require OS Login constraint on the organization or a folder. Its managed version is `compute.managed.requireOsLogin`, and its legacy version is `compute.requireOsLogin`. It blocks metadata updates that disable OS Login ([Organization policy constraints](https://docs.cloud.google.com/organization-policy/reference/org-policy-constraints)). With OS Login on, the VM ignores SSH keys in metadata.

   </details>

3. Administrators must reach an on-premises server through IAP, with the same IAM controls. Is that possible?

   <details><summary>Answer</summary>

   Yes, with hybrid connectivity. You create a tunnel destination group with the IP ranges or host names of the servers. Cloud Router must advertise `35.235.240.0/20` over Cloud VPN or Cloud Interconnect, so that responses come back through the hybrid link ([Set up IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/tcp-by-host)). Proxying non-Google Cloud resources is a paid Chrome Enterprise Premium feature ([Identity-Aware Proxy pricing](https://cloud.google.com/iap/pricing)).

   </details>

4. Why did you test the port condition as a service account, and not with your own account?

   <details><summary>Answer</summary>

   Your Owner role already allows every tunnel, so your own tests prove nothing about the condition. Impersonation lets you test a specific set of permissions without a test user account ([Service account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation)). The audit logs record your identity and the service account's identity.

   </details>

## Clean up

```bash
bash labs/52-iap-ssh/teardown.sh
[ -n "${LAB52_TMP:-}" ] && rm -rf "$LAB52_TMP"
```

The script stops any tunnel that is still open, then deletes:

- the VM `lab52-vm`,
- the firewall rule `lab52-allow-iap`, the subnet `lab52-subnet`, and the network `lab52-vpc`,
- the project role bindings of `lab52-tunnel`, then the service account.

Your SSH public key stays in your OS Login profile, because other labs use it too. To remove it, run:

```bash
gcloud compute os-login ssh-keys remove --key-file="$HOME/.ssh/google_compute_engine.pub"
```

## Docs used

- [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [Set up IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/tcp-by-host)
- [Identity-Aware Proxy FAQ](https://docs.cloud.google.com/iap/docs/faq)
- [About OS Login](https://docs.cloud.google.com/compute/docs/oslogin)
- [Set up OS Login](https://docs.cloud.google.com/compute/docs/oslogin/set-up-oslogin)
- [Service account impersonation](https://docs.cloud.google.com/iam/docs/service-account-impersonation)
- [Overview of IAM Conditions](https://docs.cloud.google.com/iam/docs/conditions-overview)
- [Organization policy constraints](https://docs.cloud.google.com/organization-policy/reference/org-policy-constraints)
- [Identity-Aware Proxy pricing](https://cloud.google.com/iap/pricing)
- [Free Google Cloud features and trial offer](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Create service accounts](https://docs.cloud.google.com/iam/docs/service-accounts-create)
