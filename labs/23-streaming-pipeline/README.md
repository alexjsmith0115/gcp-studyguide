---
id: 23-streaming-pipeline
title: "Streaming ingestion: Pub/Sub to BigQuery"
objectives: ["1.3", "2.2"]
minutes: 40
cost: "Less than $0.01. The lab publishes a few small messages, and the table holds a few rows for less than one day. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Stream JSON messages from Pub/Sub into a partitioned BigQuery table with a BigQuery subscription, with no subscriber code. Send the messages that fail to a dead-letter topic, and then fix a schema change without a code change.

## Exam relevance

- A BigQuery subscription compared with Dataflow: [Choosing data processing solutions](note:1.3-data-processing).
- Delivery guarantees and dead-letter topics: [Integration patterns and data movement](note:1.1-integration-and-data-movement).
- Partitioning and expiration for the table: [Configuring databases for availability, scale, and growth](note:2.2-database-config).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`. `labs/env.sh` makes `bq` use the lab project too.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI with `bq`.
- Time: about 40 minutes.
- Cost: Pub/Sub bills at least 1 KB for each publish request. BigQuery subscriptions cost $50 per TiB, with no free tier. The lab sends less than 20 KB.

```bash
source labs/env.sh
gcloud services enable pubsub.googleapis.com bigquery.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export TOPIC="lab23-rides"
export SUB="lab23-rides-to-bq"
export DLQ_TOPIC="lab23-rides-dlq"
export DLQ_SUB="lab23-rides-dlq-pull"
export TABLE="${PROJECT_ID}:lab23_stream.rides"
export PUBSUB_SA="service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com"
echo "topic=$TOPIC table=$TABLE pubsub_agent=$PUBSUB_SA"
```

## Steps

1. Create a dataset and a table for the ride events. The subscription will use the table schema, so each JSON field goes to the column with the same name. The last four columns hold message metadata.

   ```bash
   bq --location="$REGION" mk --dataset --description="lab23 streaming data" \
     --default_table_expiration=86400 "${PROJECT_ID}:lab23_stream"
   bq mk --table --description="Ride events from Pub/Sub" \
     --time_partitioning_field=event_time --time_partitioning_type=DAY \
     --time_partitioning_expiration=7776000 \
     --schema="ride_id:STRING,station:STRING,event_time:TIMESTAMP,duration_sec:INTEGER,subscription_name:STRING,message_id:STRING,publish_time:TIMESTAMP,attributes:STRING" \
     "$TABLE"
   bq show --schema --format=prettyjson "$TABLE"
   ```

   The table has daily partitions on `event_time`, and each partition expires after 90 days. This keeps a fixed amount of raw events without a cleanup job.

2. Create the topic, the dead-letter topic, and a pull subscription on the dead-letter topic. Create the pull subscription before any failure occurs. A subscription gets only the messages that are published after it exists.

   ```bash
   gcloud pubsub topics create "$TOPIC"
   gcloud pubsub topics create "$DLQ_TOPIC"
   gcloud pubsub subscriptions create "$DLQ_SUB" --topic="$DLQ_TOPIC"
   ```

3. Give the Pub/Sub service agent the access that it needs. It writes to the table, and it publishes failed messages to the dead-letter topic. The role on the table, not on the project, limits the service agent to this one table.

   ```bash
   bq add-iam-policy-binding --member="serviceAccount:${PUBSUB_SA}" \
     --role="roles/bigquery.dataEditor" --table=true "$TABLE"
   gcloud pubsub topics add-iam-policy-binding "$DLQ_TOPIC" \
     --member="serviceAccount:${PUBSUB_SA}" --role="roles/pubsub.publisher" --format=none
   ```

   If a command says that the service agent does not exist, wait one minute and run it again.

4. Create the BigQuery subscription with a dead-letter policy. Pub/Sub forwards a message to the dead-letter topic after about 5 failed delivery attempts. The service agent must also be able to acknowledge messages on this subscription.

   ```bash
   gcloud pubsub subscriptions create "$SUB" --topic="$TOPIC" \
     --bigquery-table="$TABLE" --use-table-schema --write-metadata \
     --dead-letter-topic="$DLQ_TOPIC" --max-delivery-attempts=5
   gcloud pubsub subscriptions add-iam-policy-binding "$SUB" \
     --member="serviceAccount:${PUBSUB_SA}" --role="roles/pubsub.subscriber" --format=none
   gcloud pubsub subscriptions describe "$SUB" --format="yaml(bigqueryConfig, deadLetterPolicy)"
   ```

   `bigqueryConfig.state` is `ACTIVE`. The state `PERMISSION_DENIED` means that the service agent cannot write to the table.

5. Publish five ride events, and query the table. The event time is a number of microseconds since the Unix epoch, which the subscription writes to a `TIMESTAMP` column.

   ```bash
   for i in 1 2 3 4 5; do
     MSG="$(printf '{"ride_id":"r%s","station":"station-%s","event_time":%s,"duration_sec":%s}' \
       "$i" "$(( i % 2 + 1 ))" "$(( $(date +%s) * 1000000 ))" "$(( i * 60 ))")"
     gcloud pubsub topics publish "$TOPIC" --message="$MSG" --attribute="source=lab23"
   done
   sleep 20
   bq query --use_legacy_sql=false \
     'SELECT ride_id, station, event_time, duration_sec, message_id, publish_time, attributes FROM lab23_stream.rides ORDER BY ride_id'
   ```

   The query returns five rows. `message_id` and `publish_time` come from Pub/Sub, and `attributes` contains `source`. If rows are missing, wait 30 seconds and run the query again.

6. Publish an event with a new field, `rider_type`. The table has no column for it, so each write attempt fails. After about 5 attempts, Pub/Sub forwards the message to the dead-letter topic and adds the reason in an attribute.

   ```bash
   MSG="$(printf '{"ride_id":"r6","station":"station-1","event_time":%s,"duration_sec":300,"rider_type":"member"}' \
     "$(( $(date +%s) * 1000000 ))")"
   gcloud pubsub topics publish "$TOPIC" --message="$MSG"
   sleep 60
   gcloud pubsub subscriptions pull "$DLQ_SUB" --auto-ack --limit=5 --format="yaml(message.attributes)"
   ```

   The message has the attribute `CloudPubSubDeadLetterSourceDeliveryErrorMessage` with the reason for the failure. If the pull returns nothing, wait one minute and run it again. Without a dead-letter topic, the message stays in the backlog of the subscription.

7. Turn on the option to drop unknown fields, and publish the event again. When you update a BigQuery subscription, specify all its BigQuery flags. The flags that you omit go back to their default values.

   ```bash
   gcloud pubsub subscriptions update "$SUB" \
     --bigquery-table="$TABLE" --use-table-schema --write-metadata --drop-unknown-fields
   MSG="$(printf '{"ride_id":"r6","station":"station-1","event_time":%s,"duration_sec":300,"rider_type":"member"}' \
     "$(( $(date +%s) * 1000000 ))")"
   gcloud pubsub topics publish "$TOPIC" --message="$MSG"
   sleep 20
   bq query --use_legacy_sql=false \
     'SELECT ride_id, station, duration_sec FROM lab23_stream.rides ORDER BY ride_id'
   ```

   The row `r6` is now in the table, without `rider_type`. If `r6` is missing, wait one minute and run the query again.

## Check your work

```bash
gcloud pubsub subscriptions describe "$SUB" \
  --format="value(bigqueryConfig.state, bigqueryConfig.dropUnknownFields, deadLetterPolicy.maxDeliveryAttempts)"
bq query --use_legacy_sql=false \
  'SELECT COUNT(*) AS row_count, COUNT(DISTINCT message_id) AS message_count FROM lab23_stream.rides'
```

Expect the following:

- The subscription shows `ACTIVE`, `True`, and `5`.
- The table has 6 messages, `r1` to `r6`. `row_count` can be higher than `message_count` if Pub/Sub delivered a message more than once.

## Explore

1. Next month, publishers will add the field `rider_type` for good. How do you keep the value, and not drop it?

   <details><summary>Answer</summary>

   Add `rider_type` to the table as a `NULLABLE` column before the publishers send it. Columns that a message does not contain must be `NULLABLE`. A change to the table schema can take some time to reach the subscription. Keep the dead-letter topic, or drop unknown fields, until the change is complete.

   </details>

2. When do you use a Dataflow pipeline instead of a BigQuery subscription?

   <details><summary>Answer</summary>

   Use Dataflow when the data needs transformations that Single Message Transforms (SMTs) cannot do, for example windows, aggregations, or joins. The Google-provided Dataflow template from Pub/Sub to BigQuery also gives exactly-once delivery by default. A BigQuery subscription gives at-least-once delivery, but it has no Dataflow job to run and costs less for a direct copy.

   </details>

3. With this setup, any user who can create subscriptions in the project can write to the table through the Pub/Sub service agent. How do you prevent this?

   <details><summary>Answer</summary>

   Give the BigQuery Data Editor role on the table to a user-managed service account, not to the Pub/Sub service agent. Create the subscription with `--bigquery-service-account-email`. The Pub/Sub service agent needs `iam.serviceAccounts.getAccessToken` on that account. Only users with `iam.serviceAccounts.actAs` on the account can then create subscriptions that write to the table.

   </details>

4. A report counts rides, and each ride must count once. What do you do about duplicates?

   <details><summary>Answer</summary>

   A BigQuery subscription gives at-least-once delivery, so the table can contain duplicates. Remove them in BigQuery, for example with a view that keeps one row for each `message_id`. If publishers can send the same ride twice, use a business key such as `ride_id`.

   </details>

## Clean up

```bash
bash labs/23-streaming-pipeline/teardown.sh
```

The script deletes both subscriptions, both topics, and the `lab23_stream` dataset with its table. The IAM bindings on these resources go away with them.

## Docs used

- [BigQuery subscriptions](https://docs.cloud.google.com/pubsub/docs/bigquery)
- [Create BigQuery subscriptions](https://docs.cloud.google.com/pubsub/docs/create-bigquery-subscription)
- [Choose a subscription type](https://docs.cloud.google.com/pubsub/docs/subscriber)
- [Subscription overview](https://docs.cloud.google.com/pubsub/docs/subscription-overview)
- [Dead-letter topics](https://docs.cloud.google.com/pubsub/docs/dead-letter-topics)
- [REST Resource: projects.subscriptions](https://docs.cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions)
- [gcloud pubsub subscriptions update](https://docs.cloud.google.com/sdk/gcloud/reference/pubsub/subscriptions/update)
- [Manage partitioned tables](https://docs.cloud.google.com/bigquery/docs/managing-partitioned-tables)
- [Control access to resources with IAM](https://docs.cloud.google.com/bigquery/docs/control-access-to-resources-iam)
- [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)
