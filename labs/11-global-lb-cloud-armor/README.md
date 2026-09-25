---
id: 11-global-lb-cloud-armor
title: Global Application Load Balancer with Cloud Armor and Cloud CDN
objectives: ["1.3", "2.1"]
minutes: 60
cost: "About $0.06 per hour in us-central1: 2 e2-micro VMs (about $0.0084 per VM-hour), 1 global forwarding rule (about $0.025 per hour), and 1 Cloud Armor policy with 2 rules (about $0.01 per hour), plus very small request, cache, and disk charges. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Put a regional managed instance group (MIG) behind a global external Application Load Balancer. Then add Cloud Armor WAF and rate-limiting rules and Cloud CDN. Use `curl` and logs to see where each one acts.

## Exam relevance

- The global external Application Load Balancer, its components, Premium Tier, and the GFE firewall ranges: [Choosing a load balancer](note:1.3-load-balancing).
- Where Cloud CDN and Cloud Armor attach, and why a backend security policy does not see cache hits: [Choosing a load balancer](note:1.3-load-balancing).
- Cloud Armor preconfigured WAF rules and rate limiting: [Network security controls](note:2.1-network-security).
- Backends with no external IP addresses in a custom-mode VPC network: [Cloud-native network design](note:1.3-network-design).
- MIGs and health checks: [Configuring Compute Engine for resilience and operations](note:2.3-compute-engine-ops).

## Before you start

- Complete `labs/00-setup` once. Run all commands from the repository root.
- IAM: you need Owner on the lab project.
- Tools: the gcloud CLI and `curl`.
- Quota: 2 e2-micro VMs in `$REGION`, 1 global external IP address, and 1 global forwarding rule.
- Time: about 60 minutes. Much of the time is waiting for the load balancer and Cloud CDN to become ready.

```bash
source labs/env.sh
gcloud services enable compute.googleapis.com logging.googleapis.com
```

## Steps

1. Create a custom-mode VPC network and a subnet, so that the lab does not depend on the default network.

```bash
gcloud compute networks create lab11-vpc --subnet-mode=custom
gcloud compute networks subnets create lab11-subnet \
    --network=lab11-vpc --region=$REGION --range=10.11.0.0/24
```

2. Allow traffic from the Google Front Ends (GFEs) and health check probes, so that the load balancer reaches the VMs.

```bash
gcloud compute firewall-rules create lab11-allow-lb-hc \
    --network=lab11-vpc --direction=INGRESS --action=allow --rules=tcp:80 \
    --source-ranges=130.211.0.0/22,35.191.0.0/16 --target-tags=lab11-web
```

For instance group backends, GFE traffic comes from `130.211.0.0/22` and `35.191.0.0/16`, and IPv4 health checks come from `35.191.0.0/16`. Allow the full ranges. A partial range causes health check failures and HTTP `502` responses. No rule allows traffic from the internet directly to the VMs.

3. Read the startup script, because each VM in the MIG must configure itself when it boots.

```bash
cat labs/11-global-lb-cloud-armor/startup.sh
```

The script serves `/` (an HTML page with the VM name) and `/static/site.css` with `python3 -m http.server`. It installs no packages, so the VMs need no external IP address and no Cloud NAT.

4. Create a regional instance template with no external IP address and no service account, because the app calls no APIs.

```bash
gcloud compute instance-templates create lab11-web-tmpl \
    --instance-template-region=$REGION \
    --region=$REGION --subnet=lab11-subnet --no-address \
    --machine-type=e2-micro \
    --image-family=debian-12 --image-project=debian-cloud \
    --tags=lab11-web \
    --no-service-account --no-scopes \
    --metadata-from-file=startup-script=labs/11-global-lb-cloud-armor/startup.sh
```

5. Create a two-VM regional MIG with the named port `http`, because the backend service sends traffic to that name.

```bash
gcloud compute instance-groups managed create lab11-web-mig \
    --region=$REGION --size=2 \
    --template=projects/$PROJECT_ID/regions/$REGION/instanceTemplates/lab11-web-tmpl \
    --base-instance-name=lab11-web
gcloud compute instance-groups managed set-named-ports lab11-web-mig \
    --region=$REGION --named-ports=http:80
gcloud compute instance-groups managed wait-until lab11-web-mig --stable --region=$REGION
```

6. Create a health check and a global backend service with logging, so that logs record each Cloud Armor decision.

```bash
gcloud compute health-checks create http lab11-hc \
    --global --port=80 --request-path=/
gcloud compute backend-services create lab11-web-bes \
    --global --load-balancing-scheme=EXTERNAL_MANAGED \
    --protocol=HTTP --port-name=http --health-checks=lab11-hc \
    --enable-logging --logging-sample-rate=1.0
gcloud compute backend-services add-backend lab11-web-bes \
    --global --instance-group=lab11-web-mig --instance-group-region=$REGION
```

`EXTERNAL_MANAGED` selects the global external Application Load Balancer. The classic Application Load Balancer uses `EXTERNAL`. Logging for new backend services is off by default.

7. Create the frontend: a URL map, a target HTTP proxy, a global Premium Tier IP address, and a forwarding rule.

```bash
gcloud compute url-maps create lab11-url-map --default-service=lab11-web-bes
gcloud compute target-http-proxies create lab11-http-proxy --url-map=lab11-url-map
gcloud compute addresses create lab11-lb-ip \
    --global --ip-version=IPV4 --network-tier=PREMIUM
gcloud compute forwarding-rules create lab11-http-fr \
    --global --load-balancing-scheme=EXTERNAL_MANAGED --network-tier=PREMIUM \
    --address=lab11-lb-ip --target-http-proxy=lab11-http-proxy --ports=80
```

The global external Application Load Balancer needs a global external IP address, and only Premium Tier supports one. This lab uses HTTP to stay short. For production, see the Explore section.

8. Wait until the load balancer answers, because a new load balancer needs a few minutes before it serves traffic.

```bash
LB_IP=$(gcloud compute addresses describe lab11-lb-ip --global --format='value(address)')
echo "Load balancer IP: $LB_IP"
until curl -sf -o /dev/null "http://$LB_IP/"; do echo "not ready, retrying in 20 seconds"; sleep 20; done
for i in 1 2 3 4 5 6; do curl -s "http://$LB_IP/" | grep -o 'vm=[^ ]*'; done
```

Until the configuration is ready, `curl` can fail or return an error code. When it is ready, the responses come from both VMs.

9. Create a Cloud Armor security policy with a WAF rule and a rate-limiting rule, so that you can test both.

```bash
gcloud compute security-policies create lab11-armor \
    --description="Lab 11 backend security policy"
gcloud compute security-policies rules create 1000 \
    --security-policy=lab11-armor \
    --expression="evaluatePreconfiguredWaf('sqli-v422-stable', {'sensitivity': 1})" \
    --action=deny-403 \
    --description="Block SQL injection (CRS 4.22, sensitivity 1)"
gcloud compute security-policies rules create 2000 \
    --security-policy=lab11-armor \
    --src-ip-ranges="*" \
    --action=throttle \
    --rate-limit-threshold-count=10 \
    --rate-limit-threshold-interval-sec=60 \
    --conform-action=allow \
    --exceed-action=deny-429 \
    --enforce-on-key=IP \
    --description="Throttle each client IP address to 10 requests per minute"
gcloud compute security-policies describe lab11-armor \
    --format="table(rules.priority, rules.action, rules.match.expr.expression)"
```

Cloud Armor evaluates rules in priority order, lowest number first. The default rule (priority `2147483647`) allows all other traffic. Sensitivity 1 uses only the signatures with the highest confidence, so false positives are less likely.

10. Attach the policy and turn on Cloud CDN, because both are settings of the backend service.

```bash
gcloud compute backend-services update lab11-web-bes \
    --global --security-policy=lab11-armor
gcloud compute backend-services update lab11-web-bes \
    --global --enable-cdn --cache-mode=CACHE_ALL_STATIC
```

With `CACHE_ALL_STATIC`, Cloud CDN caches static content types such as `text/css`. It does not cache `text/html` without explicit caching headers. After you turn on Cloud CDN, it can take a few minutes before responses are cached.

11. Send an SQL injection attempt, so that you see the WAF rule block it with `403`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "http://$LB_IP/?id=1%27%20OR%20%271%27%3D%271"
curl -s -o /dev/null -w '%{http_code}\n' "http://$LB_IP/?id=42"
```

Expected output: `403` for the first request and `200` for the second request. If you see `200` twice, wait a few minutes for the policy to take effect and repeat the test.

12. Request the CSS file three times, so that you see a cache hit in the response headers.

```bash
for i in 1 2 3; do
  echo "--- request $i"
  curl -s -D - -o /dev/null "http://$LB_IP/static/site.css" | grep -i -E '^(HTTP|age|via)'
done
```

Cloud CDN adds an `Age` header to responses that it serves from the cache. The first response has no `Age` header. A later response shows `Age: N`, where `N` is the number of seconds since the cache stored the object.

13. Send 30 fast requests to the HTML page, so that you see the rate-limiting rule return `429`.

```bash
for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code} ' "http://$LB_IP/"; done; echo
```

Expected output: about 10 `200` codes, then mostly `429` codes. Cloud Armor enforces rate limits approximately, so your counts can differ.

14. Immediately send 30 fast requests for the cached CSS file, to see that cache hits skip the backend security policy.

```bash
for i in $(seq 1 30); do curl -s -o /dev/null -w '%{http_code} ' "http://$LB_IP/static/site.css"; done; echo
```

Expected output: `200` for all or almost all requests, although your IP address is over the limit. Cloud CDN answers cache hits before the backend security policy runs. The backend security policy sees only cache misses.

15. Read the load balancer logs, so that you see the Cloud Armor decisions and the cache hits.

```bash
gcloud logging read \
    'resource.type="http_load_balancer" AND jsonPayload.enforcedSecurityPolicy.outcome="DENY"' \
    --freshness=30m --limit=10 \
    --format='table(timestamp, httpRequest.status, jsonPayload.enforcedSecurityPolicy.priority, jsonPayload.enforcedSecurityPolicy.configuredAction)'
gcloud logging read \
    'resource.type="http_load_balancer" AND httpRequest.cacheHit=true' \
    --freshness=30m --limit=5 \
    --format='table(timestamp, httpRequest.requestUrl, jsonPayload.statusDetails)'
```

Logs can take a minute or two to appear. The first query shows status `403` with priority `1000` and action `DENY`, and status `429` with priority `2000` and action `THROTTLE`. The second query shows the CSS URL with `statusDetails` set to `response_from_cache`.

## Check your work

```bash
gcloud compute backend-services get-health lab11-web-bes --global \
    --format="table(status.healthStatus[].instance.basename(), status.healthStatus[].healthState)"
gcloud compute backend-services describe lab11-web-bes --global \
    --format="yaml(loadBalancingScheme, securityPolicy.basename(), enableCDN, cdnPolicy.cacheMode, logConfig)"
gcloud compute forwarding-rules describe lab11-http-fr --global \
    --format="yaml(IPAddress, loadBalancingScheme, networkTier)"
```

Expected results:

- Both VMs show `HEALTHY`.
- The backend service shows `loadBalancingScheme: EXTERNAL_MANAGED`, `lab11-armor`, `enableCDN: true`, and `cacheMode: CACHE_ALL_STATIC`.
- The forwarding rule shows `networkTier: PREMIUM`.
- `curl` returned `403` for the SQL injection attempt, `429` codes for the fast HTML requests, and an `Age` header for the cached CSS file.

If the VMs stay `UNHEALTHY`, check the firewall rule and the network tag. Then read the boot log of one VM to see if the startup script ran:

```bash
VM=$(gcloud compute instances list --filter="name~^lab11-web" --limit=1 --format="value(name)")
VM_ZONE=$(gcloud compute instances list --filter="name=$VM" --format="value(zone.basename())")
gcloud compute instances get-serial-port-output "$VM" --zone="$VM_ZONE" | grep -i -E 'startup-script|lab11'
```

## Explore

1. In steps 13 and 14, the HTML page returned `429` but the CSS file did not. What would you change so that a rule also applies to cached content?

<details><summary>Answer</summary>

Put the rule in an edge security policy. Edge security policies run before the Cloud CDN cache lookup, so they apply to cache hits too. Backend security policies apply only to cache misses and other requests for the origin. Edge security policies can only allow or deny, and they match only a small set of attributes, such as `origin.region_code` and `origin.ip`. Rate limits and WAF rules stay in the backend security policy. You create an edge security policy with `--type=CLOUD_ARMOR_EDGE`, and you attach it with `gcloud compute backend-services update lab11-web-bes --global --edge-security-policy=POLICY`.

</details>

2. Could you save money with a Standard Tier IP address for this load balancer?

<details><summary>Answer</summary>

No. The global external Application Load Balancer needs a global external IP address, and global external IP addresses are Premium Tier only. For Standard Tier, use a regional external Application Load Balancer. Cloud Armor works in both tiers, but Cloud CDN is always Premium Tier, so the regional design loses Cloud CDN.

</details>

3. How do you make this load balancer ready for production traffic over HTTPS?

<details><summary>Answer</summary>

Create a Google-managed certificate in Certificate Manager, with DNS authorization if you need wildcard names. Put it in a certificate map, and create a target HTTPS proxy that references the map. Attach an SSL policy with a minimum TLS version of 1.2, because the default allows TLS 1.0. For HTTP clients, add a URL map that redirects to HTTPS. Give it a target HTTP proxy and a forwarding rule on the same IP address. HTTP from the GFEs to the backends can stay, because Google encrypts traffic between GFEs and backends in VPC networks.

</details>

4. A new WAF rule can block real users. How do you test a rule before you enforce it?

<details><summary>Answer</summary>

Create the rule in preview mode with the `--preview` flag. Cloud Armor does not enforce the action. The request logs show a matching preview rule in the `previewSecurityPolicy` field. Start with sensitivity level 1, read the logs, and tune the rule before you remove preview mode.

</details>

## Clean up

```bash
bash labs/11-global-lb-cloud-armor/teardown.sh
```

The script deletes, in this order:

- the forwarding rule `lab11-http-fr`, the target HTTP proxy `lab11-http-proxy`, and the URL map `lab11-url-map`
- the backend service `lab11-web-bes`, with its Cloud Armor and Cloud CDN settings
- the security policy `lab11-armor` and the health check `lab11-hc`
- the MIG `lab11-web-mig` (with its VMs) and the instance template `lab11-web-tmpl`
- the global IP address `lab11-lb-ip`
- the firewall rule `lab11-allow-lb-hc`, the subnet `lab11-subnet`, and the VPC network `lab11-vpc`

## Docs used

- [Set up a global external Application Load Balancer with VM instance group backends](https://docs.cloud.google.com/load-balancing/docs/https/setup-global-ext-https-compute)
- [External Application Load Balancer overview](https://docs.cloud.google.com/load-balancing/docs/https)
- [Global external Application Load Balancer logging and monitoring](https://docs.cloud.google.com/load-balancing/docs/https/https-logging-monitoring)
- [Network Service Tiers overview](https://docs.cloud.google.com/network-tiers/docs/overview)
- [Security policy overview](https://docs.cloud.google.com/armor/docs/security-policy-overview)
- [Preconfigured WAF rules overview](https://docs.cloud.google.com/armor/docs/waf-rules)
- [Configure rate limiting](https://docs.cloud.google.com/armor/docs/configure-rate-limiting)
- [Rate limiting overview](https://docs.cloud.google.com/armor/docs/rate-limiting-overview)
- [Per-request logging](https://docs.cloud.google.com/armor/docs/request-logging)
- [Configure custom rules language attributes](https://docs.cloud.google.com/armor/docs/rules-language-reference)
- [Cloud CDN overview](https://docs.cloud.google.com/cdn/docs/overview)
- [Caching overview](https://docs.cloud.google.com/cdn/docs/caching)
- [Logs and metrics for caching](https://docs.cloud.google.com/cdn/docs/logging)
- [Troubleshoot Cloud CDN](https://docs.cloud.google.com/cdn/docs/troubleshooting-steps)
- [SSL certificates overview](https://docs.cloud.google.com/load-balancing/docs/ssl-certificates)
- [SSL policies overview](https://docs.cloud.google.com/load-balancing/docs/ssl-policies-concepts)
- [Set up an HTTP-to-HTTPS redirect for global external Application Load Balancers](https://docs.cloud.google.com/load-balancing/docs/https/setting-up-global-http-https-redirect)
- [Pricing: Cloud Armor](https://cloud.google.com/armor/pricing), [network and load balancing](https://cloud.google.com/vpc/network-pricing), [Cloud CDN](https://cloud.google.com/cdn/pricing), [general-purpose VMs](https://cloud.google.com/products/compute/pricing/general-purpose)
