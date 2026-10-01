---
id: 21-pubsub-push-pull
title: "Pub/Sub push to Cloud Run with OIDC, and pull with a dead-letter topic"
objectives: ["4.1", "3.1"]
minutes: 50
cost: "Less than $0.10 if you run teardown.sh when done. Pub/Sub (the first 10 GiB of throughput each month), Cloud Run, Cloud Build, and Artifact Registry have free tiers."
requiresOrg: false
---

## Goal

Deliver Pub/Sub messages to a private Cloud Run service with an authenticated push subscription. Then publish ordered messages with the Python client library, receive them with streaming pull, and send a "poison" message to a dead-letter topic from both subscriptions.

## Exam relevance

- Push compared with pull, acknowledgments, retry policies, ordering keys, dead-letter topics, and exactly-once delivery. See [Publishing and consuming messages with Pub/Sub](note:4.1-messaging).
- An authenticated push subscription to a private Cloud Run service: the push service account, the OIDC token audience, and the push request format. See [Triggering Cloud Run with Eventarc and Pub/Sub, and writing event receivers](note:3.1-triggers-and-receivers).
- At-least-once delivery, and why consumers must be idempotent. See [Asynchronous and event-driven integration with Pub/Sub and Eventarc](note:1.1-async-events).
- Batch settings and flow control in a client library. See [Efficient and resilient API calls](note:4.2-efficient-api-calls).
- The Pub/Sub service agent, and a push identity that can call only one service. See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).

## Before you start

- Complete [00-setup](lab:00-setup) first. It makes `source pcd/labs/env.sh` work, enables the base APIs, and sets up the Application Default Credentials (ADC) that the Python scripts use. It also gives the Compute Engine default service account the Cloud Run Builder role, which deploys from source need.
- **IAM:** you are the Owner of the lab project. Without Owner, you need Pub/Sub Editor (`roles/pubsub.editor`) to manage topics and subscriptions. To create a push subscription with authentication, you also need the `iam.serviceAccounts.actAs` permission on the push service account, for example through Service Account User (`roles/iam.serviceAccountUser`).
- **Tools:** the gcloud CLI, and Python 3.12 or later with the `venv` module. The Pub/Sub client library 2.39.2 supports Python 3.10 and later.
- **Time:** about 50 minutes.
- Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, and enable the API that this lab adds to the base APIs from 00-setup.

```bash
source pcd/labs/env.sh
gcloud services enable pubsub.googleapis.com
```

## Steps

1. Set the lab variables. If you open a new shell, run `source pcd/labs/env.sh` and this block again. Google creates and manages the Pub/Sub service agent for each project.

```bash
export RUN_SA="lab21-receiver@${PROJECT_ID}.iam.gserviceaccount.com"
export PUSH_SA="lab21-push-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
export PUBSUB_AGENT="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
export VENV="${TMPDIR:-/tmp}/lab21-venv"
export LOG_FILTER='resource.type="cloud_run_revision" AND resource.labels.service_name="lab21-receiver" AND jsonPayload.message:"lab21"'
```

2. Read the push receiver, then deploy it as a private service. A push request wraps one message in JSON. The data is base64-encoded. The receiver returns `204` to acknowledge a message. For data that is not JSON, it returns `400`. Pub/Sub counts a `400` as a negative acknowledgment, and sends the message again.

```bash
cat pcd/labs/21-pubsub-push-pull/app/main.py
gcloud iam service-accounts create lab21-receiver --display-name="lab21 receiver identity"
gcloud run deploy lab21-receiver \
  --source=pcd/labs/21-pubsub-push-pull/app \
  --region="$REGION" \
  --service-account="$RUN_SA" \
  --no-allow-unauthenticated \
  --max=2
export URL="$(gcloud run services describe lab21-receiver --region="$REGION" --format='value(status.url)')"
```

If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`.

If the source deploy fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deploys from source. Grant the role as in 00-setup. The grant takes a few minutes to propagate, so wait a few minutes before you run the deploy again. `teardown.sh` does not remove this grant, because other labs need it.

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None
```

3. Create the push identity, and let it call only the `lab21-receiver` service. IAM changes can take a few minutes to take effect, so do this step early.

```bash
gcloud iam service-accounts create lab21-push-invoker --display-name="lab21 Pub/Sub push identity"
gcloud run services add-iam-policy-binding lab21-receiver --region="$REGION" \
  --member="serviceAccount:${PUSH_SA}" --role=roles/run.invoker
```

Pub/Sub signs an OIDC token for this account and sends it in the `Authorization` header of each push request. Cloud Run checks the token and the `run.invoker` role before your code runs. In a project created on or before April 8, 2021, you also grant the Pub/Sub service agent Service Account Token Creator (`roles/iam.serviceAccountTokenCreator`). Newer projects do not need this grant.

4. Create the topic, the dead-letter topic, and a subscription for the dead-letter topic. A subscription gets only the messages that are published after it exists. Without `lab21-dead-letter-sub`, nothing keeps the forwarded messages.

```bash
gcloud pubsub topics create lab21-orders
gcloud pubsub topics create lab21-dead-letter
gcloud pubsub subscriptions create lab21-dead-letter-sub --topic=lab21-dead-letter
```

5. Create the push subscription.

```bash
gcloud pubsub subscriptions create lab21-push \
  --topic=lab21-orders \
  --push-endpoint="${URL}/" \
  --push-auth-service-account="$PUSH_SA" \
  --push-auth-token-audience="$URL" \
  --ack-deadline=600 \
  --min-retry-delay=5s --max-retry-delay=30s \
  --dead-letter-topic=lab21-dead-letter --max-delivery-attempts=5
```

| Flag | What it does |
|---|---|
| `--push-endpoint` | Makes this a push subscription. Pub/Sub sends each message as an HTTPS POST to this URL. |
| `--push-auth-service-account` | The identity in the OIDC token. Your account needs `iam.serviceAccounts.actAs` on it. |
| `--push-auth-token-audience` | The `aud` claim of the token. If you omit it, the audience is the push endpoint. Cloud Run accepts the service URL or a custom audience. |
| `--ack-deadline=600` | How long Pub/Sub waits for a response before it sends the message again. The default is 10 seconds, and the maximum is 600. |
| `--min-retry-delay`, `--max-retry-delay` | Exponential backoff after a negative acknowledgment (nack) or an expired deadline. Without a retry policy, Pub/Sub retries immediately. The flag defaults are 10 and 600 seconds. Short values are only for this lab. |
| `--dead-letter-topic`, `--max-delivery-attempts` | After about 5 delivery attempts, Pub/Sub forwards the message to the dead-letter topic. The value must be 5 to 100, and the default is 5. |

6. Let the Pub/Sub service agent forward undeliverable messages. It publishes to the dead-letter topic, and it acknowledges the forwarded message on the source subscription. Pub/Sub counts delivery attempts only when the dead-letter topic has the correct permissions.

```bash
gcloud pubsub topics add-iam-policy-binding lab21-dead-letter \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.publisher
gcloud pubsub subscriptions add-iam-policy-binding lab21-push \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.subscriber
```

7. Publish one good message and one poison message with gcloud. Wait about two minutes, then read the log entries of the receiver.

```bash
gcloud pubsub topics publish lab21-orders --message='{"order_id": "manual-1"}' --attribute=source=gcloud
gcloud pubsub topics publish lab21-orders --message='not JSON' --attribute=source=gcloud
```

```bash
gcloud logging read "$LOG_FILTER" --freshness=10m --limit=10 \
  --format='table(timestamp, severity, jsonPayload.message_id, jsonPayload.delivery_attempt, jsonPayload.message)'
```

There is one `processed manual-1` entry. There are about five `cannot parse 'not JSON'` entries, with the same message ID and a delivery attempt that increases. The time between them grows from 5 to 30 seconds. If the role grant from step 3 was not active yet, Cloud Run rejected the first deliveries with `403`, and each rejection counted as a delivery attempt. Then `manual-1` can be in the dead-letter subscription in step 8.

8. Pull the poison message from the dead-letter subscription. `--auto-ack` acknowledges it, so the subscription is empty for step 13. If the command returns nothing, wait one minute and run it again.

```bash
gcloud pubsub subscriptions pull lab21-dead-letter-sub --auto-ack --limit=5
```

The data is `not JSON`. Pub/Sub added attributes to the original `source=gcloud`: `CloudPubSubDeadLetterSourceSubscription` (the subscription that could not deliver it), `CloudPubSubDeadLetterSourceDeliveryCount`, and more.

9. Create a pull subscription with message ordering and its own dead-letter policy, and let the service agent use it. You cannot change message ordering after you create a subscription. This subscription does not get the messages from step 7, because they were published before it existed.

```bash
gcloud pubsub subscriptions create lab21-pull \
  --topic=lab21-orders \
  --enable-message-ordering \
  --min-retry-delay=2s --max-retry-delay=10s \
  --dead-letter-topic=lab21-dead-letter --max-delivery-attempts=5
gcloud pubsub subscriptions add-iam-policy-binding lab21-pull \
  --member="serviceAccount:${PUBSUB_AGENT}" --role=roles/pubsub.subscriber
```

10. Install the client library in a virtual environment. The scripts use Application Default Credentials, and `env.sh` sets the project and the quota project.

```bash
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet -r pcd/labs/21-pubsub-push-pull/requirements.txt
```

11. Read the publisher, then run it. It publishes 3 orders for each of 3 customers, with the customer as the ordering key. The second order of `customer-2` is a poison message.

```bash
cat pcd/labs/21-pubsub-push-pull/publisher.py
"$VENV/bin/python" pcd/labs/21-pubsub-push-pull/publisher.py
```

The script prints 9 lines, one message ID for each order. Both subscriptions get all 9 messages. Only `lab21-pull` has message ordering, so only it gives the messages for each key in order.

12. Read the subscriber, then run it for 90 seconds.

```bash
cat pcd/labs/21-pubsub-push-pull/subscriber.py
"$VENV/bin/python" pcd/labs/21-pubsub-push-pull/subscriber.py 90
```

Look for these points in the output:

- For each key, the orders arrive in the order `seq` 1, 2, 3. Different keys mix together.
- `customer-1` and `customer-3` get `ack` for all 3 orders.
- The poison message of `customer-2` gets `NACK` several times, with `attempt=1`, `attempt=2`, and more.
- After a `NACK`, `customer-2-3` can arrive again, even after its `ack`. When Pub/Sub delivers a message again, it also delivers again the later messages with the same ordering key.
- After about 5 attempts, the poison message stops: Pub/Sub forwarded it to the dead-letter topic.

13. Pull the dead-letter subscription again. If it returns only one message, wait one minute and pull again. The push subscription has longer retry delays.

```bash
gcloud pubsub subscriptions pull lab21-dead-letter-sub --auto-ack --limit=10
```

There are two copies of `POISON: this is not JSON`, with the ordering key `customer-2`. The `CloudPubSubDeadLetterSourceSubscription` attribute shows that one came from `lab21-push` and one from `lab21-pull`. A dead-letter policy is a property of each subscription, not of the topic.

## Check your work

```bash
gcloud pubsub subscriptions describe lab21-push \
  --format='yaml(pushConfig, ackDeadlineSeconds, retryPolicy, deadLetterPolicy)'
gcloud pubsub subscriptions describe lab21-pull --format='yaml(enableMessageOrdering, deadLetterPolicy)'
gcloud pubsub topics get-iam-policy lab21-dead-letter
gcloud logging read "$LOG_FILTER AND severity=INFO" --freshness=30m --format='value(jsonPayload.message)'
```

Expected output:

- `lab21-push` has `pushConfig.oidcToken` with `serviceAccountEmail` set to `lab21-push-invoker` and `audience` set to your service URL. It has `ackDeadlineSeconds: 600`, a retry policy of 5 to 30 seconds, and `maxDeliveryAttempts: 5`.
- `lab21-pull` has `enableMessageOrdering: true` and a dead-letter policy for `lab21-dead-letter`.
- The dead-letter topic gives `roles/pubsub.publisher` to the Pub/Sub service agent.
- The receiver processed `manual-1` and the 8 good orders. A message can show more than once, because delivery is at least once.

## Explore

1. The subscriber printed `customer-2-3` more than once, and the receiver can also get a message twice. Why, and how do you write consumers for this?

<details><summary>Answer</summary>

Pub/Sub delivers each message at least once, so duplicates are normal. A message is delivered again after a nack, or when the acknowledgment deadline expires. With message ordering, a redelivery of one message also redelivers all later messages for that key, even acknowledged ones. A redelivered message keeps the same message ID. A publisher retry can create a copy with a different message ID, so also use a business key such as the order ID. Make the consumer idempotent: record the IDs that you processed, and check that record before you change state.

</details>

2. When do you enable exactly-once delivery, and what does it not cover?

<details><summary>Answer</summary>

Exactly-once delivery (`gcloud pubsub subscriptions create --enable-exactly-once-delivery`) stops redelivery after a successful acknowledgment, and lets the subscriber know if the acknowledgment succeeded. Only pull subscriptions, including StreamingPull, support it. Push and export subscriptions do not. The guarantee applies only when subscribers connect to one region, and publish-side duplicates are still possible. The default acknowledgment deadline of such a subscription is 60 seconds. It has much higher publish-to-subscribe latency. For best performance, Google recommends the latest client library (Python 2.13.6 or later).

</details>

3. The subscriber script never set an acknowledgment deadline. Why does a slow callback not cause redelivery after 10 seconds?

<details><summary>Answer</summary>

The high-level client libraries use lease management. They send `modifyAckDeadline` requests to extend the deadline of messages that are not acknowledged yet, by default up to one hour. The subscription deadline (default 10 seconds, range 10 to 600) is a tradeoff: a low value increases the chance of duplicates, and a high value delays the redelivery of failed messages. A push subscription cannot extend the deadline of one message. So the push subscription in this lab sets `--ack-deadline=600`.

</details>

4. When do you choose push, and when pull?

<details><summary>Answer</summary>

| | Push | Pull |
|---|---|---|
| Endpoint | An HTTPS endpoint on the public web with a valid certificate, for example a Cloud Run service URL | Any client with credentials that can call the Pub/Sub API |
| Flow control | Pub/Sub controls the rate. The endpoint can return errors to slow it down. | The subscriber client controls the rate and can extend deadlines. |
| Throughput | One message for each request, and a limit on outstanding messages | Batched delivery and acknowledgments, for large volumes |
| Ordering | One outstanding message for each ordering key | One outstanding batch for each ordering key |
| Exactly-once delivery | Not supported | Supported |

Push fits Cloud Run and webhooks with no client library. Pull fits high volume, and work that takes a long time.

</details>

## Clean up

```bash
bash pcd/labs/21-pubsub-push-pull/teardown.sh
```

The script deletes, in order:

- The `lab21-push`, `lab21-pull`, and `lab21-dead-letter-sub` subscriptions, with their IAM bindings.
- The `lab21-orders` and `lab21-dead-letter` topics, with their IAM bindings.
- The `lab21-receiver` service, with its IAM binding, and its image in the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The `lab21-push-invoker` and `lab21-receiver` service accounts.
- The local virtual environment in `${TMPDIR:-/tmp}/lab21-venv`.

It leaves the enabled APIs in place.

## Docs used

- [Choose a subscription type](https://docs.cloud.google.com/pubsub/docs/subscriber)
- [Subscription overview](https://docs.cloud.google.com/pubsub/docs/subscription-overview)
- [Subscription properties](https://docs.cloud.google.com/pubsub/docs/subscription-properties)
- [Push subscriptions](https://docs.cloud.google.com/pubsub/docs/push)
- [Authentication for push subscriptions](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions)
- [Use Pub/Sub with Cloud Run tutorial](https://docs.cloud.google.com/run/docs/tutorials/pubsub)
- [Authenticating service-to-service (Cloud Run)](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Set custom audiences for services](https://docs.cloud.google.com/run/docs/configuring/custom-audiences)
- [Dead-letter topics](https://docs.cloud.google.com/pubsub/docs/dead-letter-topics)
- [Order messages](https://docs.cloud.google.com/pubsub/docs/ordering)
- [Publish messages (attributes and ordering keys)](https://docs.cloud.google.com/pubsub/docs/publisher)
- [Batch messaging](https://docs.cloud.google.com/pubsub/docs/batch-messaging)
- [Retry requests](https://docs.cloud.google.com/pubsub/docs/retry-requests)
- [Handle transient spikes with flow control](https://docs.cloud.google.com/pubsub/docs/flow-control)
- [Extend ack time with lease management](https://docs.cloud.google.com/pubsub/docs/lease-management)
- [Exactly-once delivery](https://docs.cloud.google.com/pubsub/docs/exactly-once-delivery)
- [Pub/Sub APIs overview (locational endpoints)](https://docs.cloud.google.com/pubsub/docs/reference/service_apis_overview)
- [Python Client for Cloud Pub/Sub](https://docs.cloud.google.com/python/docs/reference/pubsub/latest)
- [Logging and viewing logs in Cloud Run](https://docs.cloud.google.com/run/docs/logging)
- [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
