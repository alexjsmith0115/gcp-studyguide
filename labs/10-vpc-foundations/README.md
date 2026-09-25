---
id: 10-vpc-foundations
title: "VPC foundations: subnets, firewall policy, NAT, Private Google Access, IAP"
objectives: ["1.3", "2.1"]
minutes: 45
cost: "About $0.02 per hour in us-central1: one e2-micro VM (about $0.0084 per hour, or free under the Free Tier), Public NAT ($0.0014 per VM-hour plus $0.005 per hour for the NAT IP address), and small log volumes. The lab runs Connectivity Tests three times; the first 20 tests each month are free. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Build a custom mode VPC network with the parts that most designs need. Then prove what Private Google Access and Cloud NAT each let a VM without an external IP address reach. You use curl, Connectivity Tests, and logs as evidence.

## Exam relevance

- Private Google Access reaches Google APIs and services only. Cloud NAT reaches the internet: [Access to Google APIs, the internet, and cloud-adjacent services](note:2.1-vpc-access-patterns).
- Custom mode subnets with secondary ranges for GKE Pods and Services: [Cloud-native network design](note:1.3-network-design).
- Global network firewall policies and firewall logging: [Network security controls](note:2.1-network-security).
- SSH through IAP TCP forwarding, with no external IP addresses: [Secure remote and workload access](note:3.1-secure-access).
- Connectivity Tests and VPC Flow Logs for troubleshooting: [Access to Google APIs, the internet, and cloud-adjacent services](note:2.1-vpc-access-patterns).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project. Without Owner, the IAP SSH steps also need IAP-secured Tunnel User (`roles/iap.tunnelResourceAccessor`).
- Tools: the gcloud CLI and `python3`. The first `gcloud compute ssh` command can create an SSH key for you.
- Time: about 45 minutes.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com iap.googleapis.com \
    networkmanagement.googleapis.com logging.googleapis.com
```

Set a test command. The VM runs it to show which destinations it can reach. `curl` prints `000` when the connection times out. Any other three-digit code shows that the request reached the server. Run this block again if you open a new shell.

```bash
export LAB10_TEST='for u in https://storage.googleapis.com/ https://deb.debian.org/; do printf "%s -> " "$u"; curl -s -o /dev/null -m 5 -w "%{http_code}\n" "$u"; done'
```

## Steps

1. Create a custom mode VPC network. In custom mode, you choose each subnet and its range.

   ```bash
   gcloud compute networks create lab10-vpc \
       --subnet-mode=custom --bgp-routing-mode=regional
   ```

2. Create a subnet with two secondary ranges. A future GKE cluster uses them for Pods and Services. Private Google Access stays off for now.

   ```bash
   gcloud compute networks subnets create lab10-subnet \
       --network=lab10-vpc --region="$REGION" --range=10.10.0.0/24 \
       --secondary-range=lab10-pods=10.20.0.0/20,lab10-services=10.30.0.0/24
   ```

3. Create a global network firewall policy. Add one rule that allows SSH only from the IAP TCP forwarding range, with logging on. Then associate the policy with the network.

   ```bash
   gcloud compute network-firewall-policies create lab10-fw-policy \
       --global --description="Lab 10 firewall policy"
   gcloud compute network-firewall-policies rules create 1000 \
       --firewall-policy=lab10-fw-policy --global-firewall-policy \
       --direction=INGRESS --action=allow --layer4-configs=tcp:22 \
       --src-ip-ranges=35.235.240.0/20 --enable-logging \
       --description="SSH from IAP TCP forwarding"
   gcloud compute network-firewall-policies associations create \
       --firewall-policy=lab10-fw-policy --network=lab10-vpc \
       --name=lab10-fw-assoc --global-firewall-policy
   ```

4. Turn on VPC Flow Logs for the subnet. Use the Network Management API, which the docs recommend because it has more options.

   ```bash
   gcloud network-management vpc-flow-logs-configs create lab10-flow-logs \
       --location=global \
       --subnet="projects/$PROJECT_ID/regions/$REGION/subnetworks/lab10-subnet"
   ```

5. Create a small VM with no external IP address.

   ```bash
   gcloud compute instances create lab10-vm --zone="$ZONE" \
       --machine-type=e2-micro --subnet=lab10-subnet --no-address \
       --image-family=debian-13 --image-project=debian-cloud \
       --boot-disk-size=10GB --boot-disk-type=pd-standard \
       --shielded-secure-boot
   ```

6. Connect through IAP and run the test. The VM has no external IP address, no Private Google Access, and no NAT.

   ```bash
   gcloud compute ssh lab10-vm --zone="$ZONE" --tunnel-through-iap \
       --command="$LAB10_TEST"
   ```

   Both lines end with `000`. The VM can't reach Google APIs or the internet. IAP still reaches the VM, because the firewall policy allows the IAP range.

7. Ask Connectivity Tests why the internet path fails. The test uses one IP address of `deb.debian.org`.

   ```bash
   export LAB10_DEBIAN_IP="$(python3 -c 'import socket; print(socket.gethostbyname("deb.debian.org"))')"
   gcloud network-management connectivity-tests create lab10-ct-internet \
       --source-instance="projects/$PROJECT_ID/zones/$ZONE/instances/lab10-vm" \
       --destination-ip-address="$LAB10_DEBIAN_IP" \
       --destination-port=443 --protocol=TCP
   gcloud network-management connectivity-tests describe lab10-ct-internet \
       --format="value(reachabilityDetails.result)"
   gcloud network-management connectivity-tests describe lab10-ct-internet \
       --format=json | grep -E '"(state|cause)"'
   ```

   The result is `UNREACHABLE`. The last step has the state `DROP` and the cause `NO_EXTERNAL_ADDRESS`. The VM has only an internal IP address, and no Cloud NAT gateway serves its subnet.

8. Turn on Private Google Access for the subnet. Then run the test again.

   ```bash
   gcloud compute networks subnets update lab10-subnet --region="$REGION" \
       --enable-private-ip-google-access
   gcloud compute ssh lab10-vm --zone="$ZONE" --tunnel-through-iap \
       --command="$LAB10_TEST"
   ```

   `storage.googleapis.com` now returns a three-digit code. `deb.debian.org` still returns `000`. Private Google Access reaches Google APIs and services, not the internet.

9. Create a Cloud Router and a Public NAT gateway. The `lab10-subnet:ALL` value includes the secondary ranges, which a private GKE cluster also needs. The last command shows the external IP address that the gateway uses.

   ```bash
   gcloud compute routers create lab10-router \
       --network=lab10-vpc --region="$REGION"
   gcloud compute routers nats create lab10-nat \
       --router=lab10-router --region="$REGION" \
       --auto-allocate-nat-external-ips \
       --nat-custom-subnet-ip-ranges=lab10-subnet:ALL \
       --enable-logging
   gcloud compute routers get-nat-ip-info lab10-router --region="$REGION"
   ```

10. Run the test from the VM again. Then wait two minutes and rerun the Connectivity Test. A configuration change takes 20 to 120 seconds to reach the analysis.

    ```bash
    gcloud compute ssh lab10-vm --zone="$ZONE" --tunnel-through-iap \
        --command="$LAB10_TEST"
    gcloud network-management connectivity-tests rerun lab10-ct-internet
    gcloud network-management connectivity-tests describe lab10-ct-internet \
        --format="value(reachabilityDetails.result)"
    ```

    Both destinations now return a three-digit code. If `deb.debian.org` still shows `000`, wait one minute and run the test again. The Connectivity Test result is now `REACHABLE`.

11. Test a blocked path. The policy allows SSH only from the IAP range. So a packet from another address in the subnet meets the implied deny ingress rule.

    ```bash
    gcloud network-management connectivity-tests create lab10-ct-ssh-internal \
        --source-ip-address=10.10.0.99 \
        --source-network="projects/$PROJECT_ID/global/networks/lab10-vpc" \
        --source-network-type=gcp-network \
        --destination-instance="projects/$PROJECT_ID/zones/$ZONE/instances/lab10-vm" \
        --destination-port=22 --protocol=TCP
    gcloud network-management connectivity-tests describe lab10-ct-ssh-internal \
        --format=json | grep -E '"(result|cause|firewallRuleType)"'
    ```

    The result is `UNREACHABLE`, and the drop cause is `FIREWALL_RULE`. The rule that drops the packet has the type `IMPLIED_VPC_FIREWALL_RULE`.

12. Read the logs. Flow logs and firewall logs can take a few minutes to appear.

    ```bash
    gcloud logging read "resource.type=\"vpc_flow_logs_config\" AND logName=\"projects/$PROJECT_ID/logs/networkmanagement.googleapis.com%2Fvpc_flows\"" \
        --freshness=1h --limit=10 \
        --format="table(timestamp,jsonPayload.connection.src_ip,jsonPayload.connection.dest_ip,jsonPayload.connection.dest_port,jsonPayload.reporter)"
    gcloud logging read "resource.type=\"gce_subnetwork\" AND logName=\"projects/$PROJECT_ID/logs/compute.googleapis.com%2Ffirewall\"" \
        --freshness=1h --limit=5 \
        --format="table(timestamp,jsonPayload.connection.src_ip,jsonPayload.connection.dest_port,jsonPayload.disposition,jsonPayload.rule_details.reference)"
    ```

    The flow logs show connections between the VM address in `10.10.0.0/24` and other addresses, such as the Debian server. The firewall logs show SSH connections from `35.235.240.0/20` with the disposition `ALLOWED`.

## Check your work

1. The subnet has Private Google Access on and two secondary ranges.

   ```bash
   gcloud compute networks subnets describe lab10-subnet --region="$REGION" \
       --format="yaml(privateIpGoogleAccess,secondaryIpRanges)"
   ```

   Expected: `privateIpGoogleAccess: true`, and the ranges `lab10-pods` and `lab10-services`.

2. The network uses the rule from the firewall policy.

   ```bash
   gcloud compute networks get-effective-firewalls lab10-vpc
   ```

   Expected: a rule with priority `1000` from `lab10-fw-policy` that allows `tcp:22` from `35.235.240.0/20`.

3. The VM has no external IP address.

   ```bash
   gcloud compute instances describe lab10-vm --zone="$ZONE" \
       --format="value(networkInterfaces[0].accessConfigs)"
   ```

   Expected: empty output.

4. The NAT gateway serves all ranges of the subnet, and its logging is on.

   ```bash
   gcloud compute routers nats describe lab10-nat --router=lab10-router \
       --region="$REGION" \
       --format="yaml(natIpAllocateOption,sourceSubnetworkIpRangesToNat,subnetworks,logConfig)"
   ```

   Expected: `AUTO_ONLY`, `LIST_OF_SUBNETWORKS`, `ALL_IP_RANGES` for `lab10-subnet`, and `enable: true`.

5. The two Connectivity Tests have different results.

   ```bash
   gcloud network-management connectivity-tests list \
       --format="table(name.basename(),reachabilityDetails.result)"
   ```

   Expected: `lab10-ct-internet` is `REACHABLE`, and `lab10-ct-ssh-internal` is `UNREACHABLE`.

## Explore

1. `lab10-ct-internet` shows `REACHABLE`. Does that prove that the VM can download packages from `deb.debian.org`?

   <details><summary>Answer</summary>

   No. The configuration analysis has no knowledge of networks outside Google Cloud. A "could be delivered" result doesn't guarantee that traffic passes the data plane. The curl test in step 10 is the proof. For continuous monitoring of packet loss and latency, use Performance Dashboard ([Connectivity Tests overview](https://docs.cloud.google.com/network-intelligence-center/docs/connectivity-tests/concepts/overview)).

   </details>

2. After step 9, can you turn off Private Google Access on `lab10-subnet`?

   <details><summary>Answer</summary>

   Not while the gateway serves the subnet. When a Public NAT gateway serves a subnet range, Google Cloud turns on Private Google Access for that range. You can't disable it manually while the gateway serves the range. Public NAT never translates traffic to Google APIs and services ([Cloud NAT product interactions](https://docs.cloud.google.com/nat/docs/nat-product-interactions)). That is why this lab turns on Private Google Access before it creates the gateway.

   </details>

3. The security team adds an egress rule that denies all traffic to the internet. Which paths to Google APIs keep working with few allow rules?

   <details><summary>Answer</summary>

   For strict egress, the docs say not to use the IP addresses of the default domains. Use a PSC endpoint for Google APIs, or the `private.googleapis.com` or `restricted.googleapis.com` VIP ([Configure Private Google Access](https://docs.cloud.google.com/vpc/docs/configure-private-google-access)). For a VIP, create a private DNS zone, and allow egress to the VIP range and to `34.126.0.0/18`. Traffic to a PSC endpoint still reaches Google when a rule denies all internet traffic ([About accessing global Google APIs through endpoints](https://docs.cloud.google.com/vpc/docs/about-accessing-google-apis-endpoints)).

   </details>

4. Why does this lab use a global network firewall policy instead of VPC firewall rules?

   <details><summary>Answer</summary>

   You can associate one global network firewall policy with many VPC networks in the same project. Policy rules also support reuse, batch updates, secure tags, and Layer 7 inspection. VPC firewall rules use network tags and have no batch update ([Global network firewall policies](https://docs.cloud.google.com/firewall/docs/network-firewall-policies)). The design choices are on the [network security](note:2.1-network-security) page.

   </details>

## Clean up

```bash
bash labs/10-vpc-foundations/teardown.sh
```

The script deletes, in this order:

- the Connectivity Tests `lab10-ct-internet` and `lab10-ct-ssh-internal`
- the VM `lab10-vm`
- the VPC Flow Logs configuration `lab10-flow-logs`
- the NAT gateway `lab10-nat` and the Cloud Router `lab10-router`
- the firewall policy association `lab10-fw-assoc` and the policy `lab10-fw-policy`
- the subnet `lab10-subnet`
- the VPC network `lab10-vpc`

The log entries stay in Cloud Logging until the retention period of their log bucket ends.

## Docs used

- [Configure alias IP ranges](https://docs.cloud.google.com/vpc/docs/configure-alias-ip-ranges)
- [Global network firewall policies](https://docs.cloud.google.com/firewall/docs/network-firewall-policies)
- [Manage firewall policy rules logging](https://docs.cloud.google.com/firewall/docs/manage-firewall-policy-rules-logging)
- [Firewall policy rules logging examples](https://docs.cloud.google.com/firewall/docs/firewall-policy-rules-log-examples)
- [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [Private Google Access](https://docs.cloud.google.com/vpc/docs/private-google-access)
- [Configure Private Google Access](https://docs.cloud.google.com/vpc/docs/configure-private-google-access)
- [Public NAT](https://docs.cloud.google.com/nat/docs/public-nat)
- [Cloud NAT product interactions](https://docs.cloud.google.com/nat/docs/nat-product-interactions)
- [Configure VPC Flow Logs](https://docs.cloud.google.com/vpc/docs/using-flow-logs)
- [Access flow logs](https://docs.cloud.google.com/vpc/docs/access-flow-logs)
- [Connectivity Tests overview](https://docs.cloud.google.com/network-intelligence-center/docs/connectivity-tests/concepts/overview)
- [Create and run Connectivity Tests](https://docs.cloud.google.com/network-intelligence-center/docs/connectivity-tests/how-to/running-connectivity-tests)
- [Connectivity Tests REST reference](https://docs.cloud.google.com/network-intelligence-center/docs/reference/networkmanagement/rest/v1/projects.locations.global.connectivityTests)
- [OS image details](https://docs.cloud.google.com/compute/docs/images/os-details)
- [Cloud NAT pricing](https://cloud.google.com/nat/pricing)
- [Network Intelligence Center pricing](https://cloud.google.com/products/network-intelligence-center/pricing)
- [General-purpose machine family pricing](https://cloud.google.com/products/compute/pricing/general-purpose)
- [Free Tier features](https://docs.cloud.google.com/free/docs/free-cloud-features)
