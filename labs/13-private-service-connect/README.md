---
id: 13-private-service-connect
title: Publish and consume a service with Private Service Connect
objectives: ["1.3", "2.1"]
minutes: 45
cost: "About $0.035 per hour: $0.025 for the load balancer forwarding rule (up to 5 rules) and $0.01 for the PSC endpoint, plus two e2-micro VMs (one e2-micro VM each month is in the free tier in us-central1). The optional endpoint for Google APIs adds $0.01 per hour. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Publish a small web service from a producer VPC network with Private Service Connect (PSC). Then reach it from a consumer VPC network that uses the same IP address range. You see the service attachment, explicit connection approval, and the NAT that removes the need for IP coordination.

## Exam relevance

- PSC exposes one service, not a network. It works across projects and organizations, and the producer and consumer ranges can overlap. See [Cloud-native network design](note:1.3-network-design).
- VPC Network Peering fails when subnet ranges overlap, and private services access is built on peering. This lab shows the case that only PSC solves. See [Cloud-native network design](note:1.3-network-design).
- A service attachment points to an internal load balancer. This lab uses an internal passthrough Network Load Balancer. See [Choosing a load balancer](note:1.3-load-balancing).
- The optional step creates a PSC endpoint for Google APIs. See [Access to Google APIs, the internet, and cloud-adjacent services](note:2.1-vpc-access-patterns).

## Before you start

Run all commands from the repository root, in one shell. Enable the APIs. PSC uses Service Directory and Cloud DNS to register endpoints.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com iap.googleapis.com servicedirectory.googleapis.com dns.googleapis.com
```

You need:

- IAM: Owner on the lab project. Without Owner, you need Compute Network Admin, Compute Security Admin, Compute Instance Admin (v1), Service Account User, and IAP-secured Tunnel User. The optional step also needs DNS Administrator and Service Directory Editor.
- Tools: the gcloud CLI. The VMs have no external IP addresses, so you reach them through IAP TCP forwarding.
- Time: about 45 minutes.

Both VPC networks are in your lab project. In real use, the producer and the consumer are often in different projects or organizations. Then each side runs its own steps in its own project.

## Steps

1. Create the producer VPC network. It has a regular subnet for the backend and a PSC NAT subnet. PSC translates consumer traffic to addresses from the NAT subnet, so the NAT subnet needs its own purpose.

```bash
source labs/env.sh

gcloud compute networks create lab13-producer-vpc --subnet-mode=custom

gcloud compute networks subnets create lab13-producer-subnet \
  --network=lab13-producer-vpc \
  --region=$REGION \
  --range=10.0.0.0/24

gcloud compute networks subnets create lab13-psc-nat-subnet \
  --network=lab13-producer-vpc \
  --region=$REGION \
  --range=10.100.0.0/29 \
  --purpose=PRIVATE_SERVICE_CONNECT
```

2. Allow health checks and PSC traffic to reach the backend. For a passthrough load balancer, the backend sees PSC traffic from the NAT subnet range, not from the consumer.

```bash
gcloud compute firewall-rules create lab13-producer-allow-hc \
  --network=lab13-producer-vpc \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:80 \
  --source-ranges=35.191.0.0/16 \
  --target-tags=lab13-web

gcloud compute firewall-rules create lab13-producer-allow-psc-nat \
  --network=lab13-producer-vpc \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:80 \
  --source-ranges=10.100.0.0/29 \
  --target-tags=lab13-web
```

3. Create the backend VM. The startup script runs a small web service that replies with the source IP address that it sees.

```bash
gcloud compute instances create lab13-producer-vm \
  --zone=$ZONE \
  --machine-type=e2-micro \
  --subnet=lab13-producer-subnet \
  --no-address \
  --tags=lab13-web \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --metadata-from-file=startup-script=labs/13-private-service-connect/startup.sh
```

4. Put the VM behind an internal passthrough Network Load Balancer. A service attachment must point to a load balancer forwarding rule.

```bash
gcloud compute health-checks create http lab13-hc \
  --region=$REGION \
  --port=80

gcloud compute instance-groups unmanaged create lab13-producer-ig --zone=$ZONE

gcloud compute instance-groups unmanaged add-instances lab13-producer-ig \
  --zone=$ZONE \
  --instances=lab13-producer-vm

gcloud compute backend-services create lab13-producer-bs \
  --load-balancing-scheme=internal \
  --protocol=tcp \
  --region=$REGION \
  --health-checks=lab13-hc \
  --health-checks-region=$REGION

gcloud compute backend-services add-backend lab13-producer-bs \
  --region=$REGION \
  --instance-group=lab13-producer-ig \
  --instance-group-zone=$ZONE

gcloud compute forwarding-rules create lab13-producer-fr \
  --region=$REGION \
  --load-balancing-scheme=internal \
  --network=lab13-producer-vpc \
  --subnet=lab13-producer-subnet \
  --address=10.0.0.50 \
  --ip-protocol=TCP \
  --ports=80 \
  --backend-service=lab13-producer-bs \
  --backend-service-region=$REGION
```

5. Publish the service with a service attachment. `ACCEPT_MANUAL` with no accept list means that the producer must approve each consumer. Google recommends explicit approval.

```bash
gcloud compute service-attachments create lab13-svc-attachment \
  --region=$REGION \
  --producer-forwarding-rule=lab13-producer-fr \
  --connection-preference=ACCEPT_MANUAL \
  --nat-subnets=lab13-psc-nat-subnet
```

6. Create the consumer VPC network with the same range as the producer subnet. VPC Network Peering between these two networks fails, because the ranges overlap. The consumer VM accepts SSH only from the IAP range.

```bash
gcloud compute networks create lab13-consumer-vpc --subnet-mode=custom

gcloud compute networks subnets create lab13-consumer-subnet \
  --network=lab13-consumer-vpc \
  --region=$REGION \
  --range=10.0.0.0/24

gcloud compute firewall-rules create lab13-consumer-allow-iap-ssh \
  --network=lab13-consumer-vpc \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 \
  --target-tags=lab13-client

gcloud compute instances create lab13-consumer-vm \
  --zone=$ZONE \
  --machine-type=e2-micro \
  --subnet=lab13-consumer-subnet \
  --no-address \
  --tags=lab13-client \
  --image-family=debian-12 \
  --image-project=debian-cloud
```

7. Create the PSC endpoint in the consumer network. The endpoint is a forwarding rule with an internal IP address from the consumer's own subnet.

```bash
gcloud compute addresses create lab13-psc-endpoint-ip \
  --region=$REGION \
  --subnet=lab13-consumer-subnet \
  --addresses=10.0.0.100

gcloud compute forwarding-rules create lab13-psc-endpoint \
  --region=$REGION \
  --network=lab13-consumer-vpc \
  --address=lab13-psc-endpoint-ip \
  --target-service-attachment=projects/$PROJECT_ID/regions/$REGION/serviceAttachments/lab13-svc-attachment
```

8. Look at the connection from both sides. The producer has not approved the consumer yet, so the status is `PENDING`.

```bash
gcloud compute forwarding-rules describe lab13-psc-endpoint \
  --region=$REGION \
  --format="value(pscConnectionStatus)"

gcloud compute service-attachments describe lab13-svc-attachment \
  --region=$REGION \
  --format="yaml(connectedEndpoints)"
```

9. As the producer, accept the consumer VPC network. The number after `=` is the connection limit for that network.

```bash
gcloud compute service-attachments update lab13-svc-attachment \
  --region=$REGION \
  --consumer-accept-list=projects/$PROJECT_ID/global/networks/lab13-consumer-vpc=5

gcloud compute forwarding-rules describe lab13-psc-endpoint \
  --region=$REGION \
  --format="value(pscConnectionStatus)"
```

10. Call the service from the consumer VM through IAP. If `curl` prints nothing, the backend is not healthy yet, so wait and try again. The first `gcloud compute ssh` creates an SSH key for you.

```bash
gcloud compute ssh lab13-consumer-vm \
  --zone=$ZONE \
  --tunnel-through-iap \
  --command="curl -s http://10.0.0.100"
```

11. Optional: create a PSC endpoint for Google APIs in the consumer network. VMs with no external IP address need Private Google Access on the subnet to use it. The endpoint name must have 1 to 20 lowercase letters and numbers, so it has no hyphen.

```bash
gcloud compute networks subnets update lab13-consumer-subnet \
  --region=$REGION \
  --enable-private-ip-google-access

gcloud compute addresses create lab13-gapis-ip \
  --global \
  --purpose=PRIVATE_SERVICE_CONNECT \
  --addresses=10.255.255.254 \
  --network=lab13-consumer-vpc

gcloud compute forwarding-rules create lab13gapis \
  --global \
  --network=lab13-consumer-vpc \
  --address=lab13-gapis-ip \
  --target-google-apis-bundle=all-apis

gcloud compute ssh lab13-consumer-vm \
  --zone=$ZONE \
  --tunnel-through-iap \
  --command="curl -s -o /dev/null -w '%{http_code}\n' http://10.255.255.254/generate_204; getent hosts storage-lab13gapis.p.googleapis.com"
```

## Check your work

1. The endpoint is connected. The first command in step 9 prints `PENDING` before the update, and the second prints `ACCEPTED`.

```bash
gcloud compute forwarding-rules describe lab13-psc-endpoint \
  --region=$REGION \
  --format="value(pscConnectionStatus)"
```

2. The producer sees one connected endpoint with `status: ACCEPTED`.

```bash
gcloud compute service-attachments describe lab13-svc-attachment \
  --region=$REGION \
  --format="yaml(connectedEndpoints)"
```

3. Step 10 prints `Hello from lab13-producer-vm. You connected from 10.100.0.x.` The source address is in the NAT subnet `10.100.0.0/29`. The producer never sees the consumer VM address.

4. The producer and consumer subnets use the same range. The list shows `10.0.0.0/24` twice, plus the NAT subnet with purpose `PRIVATE_SERVICE_CONNECT`.

```bash
gcloud compute networks subnets list \
  --filter="name~^lab13-" \
  --format="table(name,network.basename(),ipCidrRange,purpose)"
```

5. Optional step: the `curl` command prints `204`, and `getent` prints `10.255.255.254` for `storage-lab13gapis.p.googleapis.com`.

## Explore

1. Your team must connect `lab13-consumer-vpc` to the producer service. Compare PSC, private services access, and VPC Network Peering. Which one works here, and when is each one the right choice?

<details><summary>Answer</summary>

Only PSC works here. VPC Network Peering fails when subnet ranges overlap, and both networks use `10.0.0.0/24` ([VPC Network Peering](https://docs.cloud.google.com/vpc/docs/vpc-peering)). Private services access is a peering to a producer network, with ranges that you allocate. Supported Google managed services, such as Cloud SQL or Memorystore, use it, and peered networks cannot use the connection ([Private services access](https://docs.cloud.google.com/vpc/docs/private-services-access)). PSC uses NAT, so the consumer and producer need no IP address coordination. Consumers reach only the service IP address, not the whole producer network ([Private Service Connect](https://docs.cloud.google.com/vpc/docs/private-service-connect)). Use VPC Network Peering for full connectivity between a few networks with unique ranges. Use PSC to expose one service, across organizations or with overlapping ranges.

</details>

2. The producer VM sees a source address from `10.100.0.0/29`. What does this mean for the producer's firewall rules and for the size of the NAT subnet?

<details><summary>Answer</summary>

PSC translates consumer packets to source addresses from the NAT subnet ([About published services](https://docs.cloud.google.com/vpc/docs/about-vpc-hosted-services)). So the producer firewall rules for a passthrough load balancer allow the NAT subnet range, as in step 2 ([Publish services](https://docs.cloud.google.com/vpc/docs/configure-private-service-connect-producer)). Each connected endpoint or backend uses one NAT subnet address. The number of connections, clients, or consumer networks does not change this. Size the NAT subnet for the number of endpoints you expect.

</details>

3. Another project creates an endpoint that targets `lab13-svc-attachment`. What happens, and how does the producer control it?

<details><summary>Answer</summary>

The service attachment uses `ACCEPT_MANUAL`, and the accept list names only `lab13-consumer-vpc`. So the new connection stays `PENDING` until the producer adds that project, network, or endpoint to the accept list. The producer can also put it on the reject list. Accept and reject lists must use one type of entry: projects, networks, or endpoints ([About controlling access to published services](https://docs.cloud.google.com/vpc/docs/about-controlling-access-published-services)).

</details>

4. A consumer VM in another region must use `lab13-psc-endpoint`. What do you change?

<details><summary>Answer</summary>

An endpoint is regional. Clients in other regions can reach it only if you turn on global access with `--allow-psc-global-access` on the endpoint ([About accessing published services through endpoints](https://docs.cloud.google.com/vpc/docs/about-accessing-vpc-hosted-services-endpoints)). Inter-region data transfer charges then apply to that traffic ([VPC pricing](https://cloud.google.com/vpc/pricing)).

</details>

## Clean up

```bash
bash labs/13-private-service-connect/teardown.sh
```

The script deletes, in this order:

- The optional endpoint `lab13gapis` and the address `lab13-gapis-ip`.
- The endpoint `lab13-psc-endpoint` and the address `lab13-psc-endpoint-ip`.
- The VM `lab13-consumer-vm`.
- The service attachment `lab13-svc-attachment`.
- The forwarding rule, backend service, health check, and instance group of the load balancer.
- The VM `lab13-producer-vm`.
- The three firewall rules.
- The subnets `lab13-psc-nat-subnet`, `lab13-producer-subnet`, and `lab13-consumer-subnet`.
- The networks `lab13-producer-vpc` and `lab13-consumer-vpc`.

PSC also creates one default Service Directory namespace for endpoints in each region of the project. The script keeps it, because other PSC endpoints in the region can use it. It has no charge ([Service Directory pricing](https://cloud.google.com/service-directory/pricing)). The SSH key that `gcloud compute ssh` added to the project stays too.

## Docs used

- [Private Service Connect](https://docs.cloud.google.com/vpc/docs/private-service-connect)
- [About published services](https://docs.cloud.google.com/vpc/docs/about-vpc-hosted-services)
- [Publish services by using Private Service Connect](https://docs.cloud.google.com/vpc/docs/configure-private-service-connect-producer)
- [About controlling access to published services](https://docs.cloud.google.com/vpc/docs/about-controlling-access-published-services)
- [About accessing published services through endpoints](https://docs.cloud.google.com/vpc/docs/about-accessing-vpc-hosted-services-endpoints)
- [Access published services through endpoints](https://docs.cloud.google.com/vpc/docs/configure-private-service-connect-services)
- [Access global Google APIs through endpoints](https://docs.cloud.google.com/vpc/docs/configure-private-service-connect-apis)
- [Private services access](https://docs.cloud.google.com/vpc/docs/private-services-access)
- [VPC Network Peering](https://docs.cloud.google.com/vpc/docs/vpc-peering)
- [Set up an internal passthrough Network Load Balancer with VM instance group backends](https://docs.cloud.google.com/load-balancing/docs/internal/setting-up-internal)
- [Health checks overview](https://docs.cloud.google.com/load-balancing/docs/health-check-concepts)
- [Use IAP for TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding)
- [VPC pricing](https://cloud.google.com/vpc/pricing)
- [Cloud Load Balancing pricing](https://cloud.google.com/load-balancing/pricing)
- [Service Directory pricing](https://cloud.google.com/service-directory/pricing)
- [Free Google Cloud features and trial offer](https://docs.cloud.google.com/free/docs/free-cloud-features)
