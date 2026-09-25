---
id: 12-ha-vpn-hybrid
title: Simulate hybrid connectivity with HA VPN and Cloud Router
objectives: ["2.1", "1.3"]
minutes: 60
cost: "About $0.20 per hour for the four HA VPN tunnels in us-central1 ($0.05 per tunnel-hour; some regions cost more), plus a small hourly charge for two e2-micro VMs. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Connect two VPC networks with HA VPN and Cloud Router. One VPC network plays the part of an on-premises data center. You see BGP route exchange, the tunnel layout that meets the 99.99% SLA, and the effect of the dynamic routing mode.

## Exam relevance

- HA VPN gives 99.99% only with a tunnel on each gateway interface. Between VPC networks, both gateways must be in the same region: [Hybrid and multicloud connectivity](note:2.1-hybrid-multicloud).
- The dynamic routing mode controls which subnets Cloud Router advertises. The multi-region Cloud Interconnect topology needs global mode: [Hybrid and multicloud connectivity](note:2.1-hybrid-multicloud).
- Custom route advertisements are a required part of Private Google Access for on-premises hosts: [Hybrid and multicloud connectivity](note:2.1-hybrid-multicloud).
- Custom mode VPC networks and non-overlapping ranges: [Cloud-native network design](note:1.3-network-design).
- SSH through IAP TCP forwarding, with no external IP addresses: [Secure remote and workload access](note:3.1-secure-access).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project. Without Owner, the IAP SSH steps also need IAP-secured Tunnel User (`roles/iap.tunnelResourceAccessor`).
- Tools: the gcloud CLI and `openssl`.
- Time: about 60 minutes. The BGP sessions need a few minutes to come up.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com iap.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell. The second region shows the effect of the dynamic routing mode. The two VPN gateways use the shared secret for IKE authentication.

```bash
if [ "$REGION" = "us-east1" ]; then export REGION2=us-central1; else export REGION2=us-east1; fi
export LAB12_SECRET="${LAB12_SECRET:-$(openssl rand -base64 24)}"
echo "Primary region: $REGION. Second region: $REGION2."
```

## Steps

1. Create the "cloud" VPC network. Start in regional dynamic routing mode. Put one subnet in each region.

   ```bash
   gcloud compute networks create lab12-cloud \
       --subnet-mode=custom --bgp-routing-mode=regional
   gcloud compute networks subnets create lab12-cloud-a \
       --network=lab12-cloud --region="$REGION" --range=10.12.0.0/24
   gcloud compute networks subnets create lab12-cloud-b \
       --network=lab12-cloud --region="$REGION2" --range=10.12.1.0/24
   ```

2. Create the "on-premises" VPC network. Its range must not overlap the cloud ranges.

   ```bash
   gcloud compute networks create lab12-onprem \
       --subnet-mode=custom --bgp-routing-mode=regional
   gcloud compute networks subnets create lab12-onprem-a \
       --network=lab12-onprem --region="$REGION" --range=192.168.12.0/24
   ```

3. Allow SSH only from the IAP range, and allow ICMP only from the other network's ranges.

   ```bash
   gcloud compute firewall-rules create lab12-cloud-allow-iap-ssh \
       --network=lab12-cloud --direction=INGRESS --action=allow \
       --rules=tcp:22 --source-ranges=35.235.240.0/20
   gcloud compute firewall-rules create lab12-cloud-allow-icmp \
       --network=lab12-cloud --direction=INGRESS --action=allow \
       --rules=icmp --source-ranges=192.168.12.0/24
   gcloud compute firewall-rules create lab12-onprem-allow-iap-ssh \
       --network=lab12-onprem --direction=INGRESS --action=allow \
       --rules=tcp:22 --source-ranges=35.235.240.0/20
   gcloud compute firewall-rules create lab12-onprem-allow-icmp \
       --network=lab12-onprem --direction=INGRESS --action=allow \
       --rules=icmp --source-ranges=10.12.0.0/23
   ```

4. Create one HA VPN gateway in each VPC network. Both gateways are in the same region, because the 99.99% SLA for this topology needs that. Each gateway gets two external IP addresses, one for each interface.

   ```bash
   gcloud compute vpn-gateways create lab12-gw-cloud \
       --network=lab12-cloud --region="$REGION" --stack-type=IPV4_ONLY
   gcloud compute vpn-gateways create lab12-gw-onprem \
       --network=lab12-onprem --region="$REGION" --stack-type=IPV4_ONLY
   ```

5. Create a Cloud Router in each VPC network. Each router uses a private ASN. You cannot change the ASN later.

   ```bash
   gcloud compute routers create lab12-router-cloud \
       --network=lab12-cloud --region="$REGION" --asn=65001
   gcloud compute routers create lab12-router-onprem \
       --network=lab12-onprem --region="$REGION" --asn=65002
   ```

6. Create four tunnels. Interface 0 connects to interface 0, and interface 1 connects to interface 1. This gives each gateway interface a tunnel.

   ```bash
   gcloud compute vpn-tunnels create lab12-tun-cloud-if0 \
       --vpn-gateway=lab12-gw-cloud --interface=0 --peer-gcp-gateway=lab12-gw-onprem \
       --region="$REGION" --ike-version=2 --shared-secret="$LAB12_SECRET" \
       --router=lab12-router-cloud
   gcloud compute vpn-tunnels create lab12-tun-cloud-if1 \
       --vpn-gateway=lab12-gw-cloud --interface=1 --peer-gcp-gateway=lab12-gw-onprem \
       --region="$REGION" --ike-version=2 --shared-secret="$LAB12_SECRET" \
       --router=lab12-router-cloud
   gcloud compute vpn-tunnels create lab12-tun-onprem-if0 \
       --vpn-gateway=lab12-gw-onprem --interface=0 --peer-gcp-gateway=lab12-gw-cloud \
       --region="$REGION" --ike-version=2 --shared-secret="$LAB12_SECRET" \
       --router=lab12-router-onprem
   gcloud compute vpn-tunnels create lab12-tun-onprem-if1 \
       --vpn-gateway=lab12-gw-onprem --interface=1 --peer-gcp-gateway=lab12-gw-cloud \
       --region="$REGION" --ike-version=2 --shared-secret="$LAB12_SECRET" \
       --router=lab12-router-onprem
   ```

7. Give the cloud router a BGP interface and a BGP peer on each tunnel. Each tunnel uses its own `/30` range from `169.254.0.0/16`.

   ```bash
   gcloud compute routers add-interface lab12-router-cloud --region="$REGION" \
       --interface-name=lab12-cloud-if0 --vpn-tunnel=lab12-tun-cloud-if0 \
       --ip-address=169.254.0.1 --mask-length=30
   gcloud compute routers add-bgp-peer lab12-router-cloud --region="$REGION" \
       --peer-name=lab12-cloud-peer0 --interface=lab12-cloud-if0 \
       --peer-ip-address=169.254.0.2 --peer-asn=65002
   gcloud compute routers add-interface lab12-router-cloud --region="$REGION" \
       --interface-name=lab12-cloud-if1 --vpn-tunnel=lab12-tun-cloud-if1 \
       --ip-address=169.254.1.1 --mask-length=30
   gcloud compute routers add-bgp-peer lab12-router-cloud --region="$REGION" \
       --peer-name=lab12-cloud-peer1 --interface=lab12-cloud-if1 \
       --peer-ip-address=169.254.1.2 --peer-asn=65002
   ```

8. Do the same on the on-premises router. Its addresses are the other end of each `/30` range.

   ```bash
   gcloud compute routers add-interface lab12-router-onprem --region="$REGION" \
       --interface-name=lab12-onprem-if0 --vpn-tunnel=lab12-tun-onprem-if0 \
       --ip-address=169.254.0.2 --mask-length=30
   gcloud compute routers add-bgp-peer lab12-router-onprem --region="$REGION" \
       --peer-name=lab12-onprem-peer0 --interface=lab12-onprem-if0 \
       --peer-ip-address=169.254.0.1 --peer-asn=65001
   gcloud compute routers add-interface lab12-router-onprem --region="$REGION" \
       --interface-name=lab12-onprem-if1 --vpn-tunnel=lab12-tun-onprem-if1 \
       --ip-address=169.254.1.2 --mask-length=30
   gcloud compute routers add-bgp-peer lab12-router-onprem --region="$REGION" \
       --peer-name=lab12-onprem-peer1 --interface=lab12-onprem-if1 \
       --peer-ip-address=169.254.1.1 --peer-asn=65001
   ```

9. Create one small VM in each VPC network. The VMs have no external IP addresses. You reach them through IAP.

   ```bash
   gcloud compute instances create lab12-vm-cloud --zone="$ZONE" \
       --machine-type=e2-micro --subnet=lab12-cloud-a \
       --private-network-ip=10.12.0.10 --no-address
   gcloud compute instances create lab12-vm-onprem --zone="$ZONE" \
       --machine-type=e2-micro --subnet=lab12-onprem-a \
       --private-network-ip=192.168.12.10 --no-address
   ```

10. Look at the routes that the on-premises router learned. In regional mode, the cloud router advertises only the subnet in its own region. Wait a few minutes for the BGP sessions first.

    ```bash
    gcloud compute routers get-status lab12-router-onprem --region="$REGION" \
        --format="value(result.bestRoutesForRouter[].destRange)"
    ```

    The output shows `10.12.0.0/24`. It does not show `10.12.1.0/24`, because that subnet is in `$REGION2`.

11. Change the cloud VPC network to global dynamic routing. Then look at the learned routes again.

    ```bash
    gcloud compute networks update lab12-cloud --bgp-routing-mode=global
    gcloud compute routers get-status lab12-router-onprem --region="$REGION" \
        --format="value(result.bestRoutesForRouter[].destRange)"
    ```

    After a short time, the output also shows `10.12.1.0/24`. The tunnels in one region now carry routes for all regions of the VPC network.

12. Optional: advertise the `private.googleapis.com` range. This is the Cloud Router part of Private Google Access for on-premises hosts. Custom mode replaces the default advertisement, so keep all subnets in the advertisement.

    ```bash
    gcloud compute routers update lab12-router-cloud --region="$REGION" \
        --advertisement-mode=CUSTOM --set-advertisement-groups=ALL_SUBNETS \
        --set-advertisement-ranges=199.36.153.8/30
    gcloud compute routers get-status lab12-router-onprem --region="$REGION" \
        --format="value(result.bestRoutesForRouter[].destRange)"
    gcloud compute ssh lab12-vm-onprem --zone="$ZONE" --tunnel-through-iap \
        --command="curl -sS -o /dev/null -w '%{http_code}\n' --resolve storage.googleapis.com:443:199.36.153.8 https://storage.googleapis.com/"
    ```

    The learned routes now include `199.36.153.8/30`. The on-premises VM has no external IP address and no Private Google Access. So a three-digit HTTP status code shows that the request went through the tunnel to Google APIs. A timeout shows a missing route.

## Check your work

1. Each tunnel is up. Run this for all four tunnels.

   ```bash
   gcloud compute vpn-tunnels describe lab12-tun-cloud-if0 --region="$REGION" \
       --format="flattened(status,detailedStatus)"
   ```

   Expected: `detailedStatus: Tunnel is up and running.`

2. Each HA VPN gateway has enough tunnel coverage for the 99.99% SLA.

   ```bash
   gcloud compute vpn-gateways get-status lab12-gw-cloud --region="$REGION"
   gcloud compute vpn-gateways get-status lab12-gw-onprem --region="$REGION"
   ```

   Expected: `state: CONNECTION_REDUNDANCY_MET` for each gateway.

3. The cloud router advertises its subnets and learns the on-premises range.

   ```bash
   gcloud compute routers get-status lab12-router-cloud --region="$REGION" \
       --format="yaml(result.bgpPeerStatus)"
   gcloud compute routers get-status lab12-router-cloud --region="$REGION" \
       --format="value(result.bestRoutesForRouter[].destRange)"
   ```

   Expected: each BGP peer has `status: UP`. The `advertisedRoutes` entries include `10.12.0.0/24`. The learned routes include `192.168.12.0/24`.

4. The on-premises VM reaches the cloud VM through the tunnels.

   ```bash
   gcloud compute ssh lab12-vm-onprem --zone="$ZONE" --tunnel-through-iap \
       --command="ping -c 3 10.12.0.10"
   ```

   Expected: `3 packets transmitted, 3 received`.

## Explore

1. Your real on-premises VPN device has only one public IP address. How do you connect HA VPN to it and still meet the 99.99% SLA?

   <details><summary>Answer</summary>

   Create an external VPN gateway resource with one interface. Its redundancy type is `SINGLE_IP_INTERNALLY_REDUNDANT`. Then create two tunnels: one from each HA VPN interface to the single peer IP address. A tunnel on only one HA VPN interface does not meet the SLA ([HA VPN topologies](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies)).

   </details>

2. You delete `lab12-tun-cloud-if1`. What does `get-status` show, and what happens to traffic?

   <details><summary>Answer</summary>

   The gateway shows `CONNECTION_REDUNDANCY_NOT_MET` with `INCOMPLETE_TUNNELS_COVERAGE` ([Check VPN status](https://docs.cloud.google.com/network-connectivity/docs/vpn/how-to/checking-vpn-status)). Cloud Router withdraws the routes through the lost tunnel. The withdrawal can take 40-60 seconds, with packet loss during that time. Then traffic uses the other tunnel ([HA VPN topologies](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies)).

   </details>

3. A company has workloads in three regions and one set of VLAN attachments. Which dynamic routing mode does it need, and why?

   <details><summary>Answer</summary>

   Global dynamic routing mode. In regional mode, a Cloud Router advertises only subnets in its own region, and learned routes stay in that region ([Advertised routes](https://docs.cloud.google.com/network-connectivity/docs/router/concepts/advertised-routes), [Learned routes](https://docs.cloud.google.com/network-connectivity/docs/router/concepts/learned-routes)). The multi-region 99.99% Cloud Interconnect topology also requires global mode ([Establish 99.99% availability for Dedicated Interconnect](https://docs.cloud.google.com/network-connectivity/docs/interconnect/tutorials/dedicated-creating-9999-availability)).

   </details>

4. [EHR Healthcare](case:ehr) needs "a secure and high-performance connection between on-premises systems and Google Cloud." Is HA VPN over the internet the best answer?

   <details><summary>Answer</summary>

   No. Each tunnel carries 1 to 3 Gbps ([Cloud VPN overview](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/overview)). Google suggests Cloud VPN for lower bandwidth needs and Cloud Interconnect for higher throughput ([Choosing a Network Connectivity product](https://docs.cloud.google.com/network-connectivity/docs/how-to/choose-product)). EHR is in colocation facilities, so Dedicated Interconnect in the 99.99% topology fits. For encryption, add MACsec or HA VPN over Cloud Interconnect. HA VPN stays useful as a backup path.

   </details>

## Clean up

```bash
bash labs/12-ha-vpn-hybrid/teardown.sh
```

The script deletes, in this order:

- the VMs `lab12-vm-cloud` and `lab12-vm-onprem`
- the four `lab12-` firewall rules
- the four tunnels `lab12-tun-*`
- the Cloud Routers `lab12-router-cloud` and `lab12-router-onprem`, with their BGP sessions
- the HA VPN gateways `lab12-gw-cloud` and `lab12-gw-onprem`
- the subnets `lab12-cloud-a`, `lab12-cloud-b`, and `lab12-onprem-a`
- the VPC networks `lab12-cloud` and `lab12-onprem`

## Docs used

- [Create HA VPN gateways to connect VPC networks](https://docs.cloud.google.com/network-connectivity/docs/vpn/how-to/creating-ha-vpn2)
- [HA VPN topologies](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies)
- [Check VPN status](https://docs.cloud.google.com/network-connectivity/docs/vpn/how-to/checking-vpn-status)
- [Cloud VPN overview](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/overview)
- [View router details](https://docs.cloud.google.com/network-connectivity/docs/router/how-to/viewing-router-details)
- [Advertised routes](https://docs.cloud.google.com/network-connectivity/docs/router/concepts/advertised-routes)
- [Learned routes](https://docs.cloud.google.com/network-connectivity/docs/router/concepts/learned-routes)
- [Configure Private Google Access for on-premises hosts](https://docs.cloud.google.com/vpc/docs/configure-private-google-access-hybrid)
- [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [Cloud VPN pricing](https://cloud.google.com/vpn/pricing)
