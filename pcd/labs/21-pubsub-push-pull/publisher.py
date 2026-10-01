"""Publish 9 test orders to the lab21-orders topic, with batch settings and ordering keys.

Usage: python publisher.py
Run `source pcd/labs/env.sh` first: the script reads PROJECT_ID and REGION.

Each of 3 customers gets 3 orders (seq 1, 2, 3), and the customer ID is the
ordering key. The second order of customer-2 is a "poison" message: its data is
not JSON, so the subscribers cannot process it.
"""
import json
import os
from concurrent import futures

from google.cloud import pubsub_v1

project_id = os.environ["PROJECT_ID"]
region = os.environ.get("REGION", "us-central1")

# Send a batch when it has 10 messages, or 1 KiB of data, or after 1 second.
# The defaults are 100 messages, 1 MB, and 10 ms. A larger batch means fewer requests and more latency.
batch_settings = pubsub_v1.types.BatchSettings(max_messages=10, max_bytes=1024, max_latency=1)
# With ordering, the client sends the messages for one ordering key in order.
publisher_options = pubsub_v1.types.PublisherOptions(enable_message_ordering=True)
# Order applies only to messages published in the same region. Outside Google Cloud,
# a locational endpoint sends all requests to one region.
client_options = {"api_endpoint": f"{region}-pubsub.googleapis.com:443"}
publisher = pubsub_v1.PublisherClient(
    batch_settings, publisher_options=publisher_options, client_options=client_options
)
topic_path = publisher.topic_path(project_id, "lab21-orders")

sent = []
for seq in (1, 2, 3):
    for customer in ("customer-1", "customer-2", "customer-3"):
        data = json.dumps({"order_id": f"{customer}-{seq}", "seq": seq}).encode("utf-8")
        if customer == "customer-2" and seq == 2:
            data = b"POISON: this is not JSON"
        # publish() does not block: it returns a future, and the client sends batches in the background.
        # Keyword arguments become message attributes. Attribute values are strings.
        future = publisher.publish(topic_path, data, ordering_key=customer, source="publisher.py")
        sent.append((customer, seq, future))

futures.wait([future for _, _, future in sent], return_when=futures.ALL_COMPLETED)
for customer, seq, future in sent:
    # If a publish with an ordering key fails, the client stops publishing for that key
    # until you call publisher.resume_publish(topic_path, ordering_key).
    print(f"{customer} seq={seq} message_id={future.result()}")
