"""Receive messages from the lab21-pull subscription with streaming pull and flow control.

Usage: python subscriber.py [SECONDS]    (default: 90)
Run `source pcd/labs/env.sh` first: the script reads PROJECT_ID.

The callback acknowledges (acks) each message whose data is JSON. It sends a
negative acknowledgment (nack) for a message that it cannot parse, so Pub/Sub
delivers that message again, until the dead-letter topic gets it.
"""
import json
import os
import sys
from concurrent.futures import TimeoutError

from google.cloud import pubsub_v1

project_id = os.environ["PROJECT_ID"]
timeout = float(sys.argv[1]) if len(sys.argv) > 1 else 90.0

subscriber = pubsub_v1.SubscriberClient()
subscription_path = subscriber.subscription_path(project_id, "lab21-pull")


def callback(message: pubsub_v1.subscriber.message.Message) -> None:
    # delivery_attempt has a value only when the subscription has a dead-letter topic.
    about = f"key={message.ordering_key} attempt={message.delivery_attempt} id={message.message_id}"
    try:
        order = json.loads(message.data)
    except ValueError:
        print(f"NACK {about} data={message.data[:24]!r}", flush=True)
        # Pub/Sub delivers a nacked message again after the retry delay of the subscription.
        message.nack()
        return
    print(f"ack  {about} order={order.get('order_id')}", flush=True)
    # Ack only after the work is done. Delivery is at least once, so the work must be safe to repeat.
    message.ack()


# Flow control: the client holds at most 5 messages that it has not acked or nacked yet.
flow_control = pubsub_v1.types.FlowControl(max_messages=5)
streaming_pull_future = subscriber.subscribe(
    subscription_path, callback=callback, flow_control=flow_control
)
print(f"Listening on {subscription_path} for {timeout:.0f} seconds...", flush=True)

# The with block closes the subscriber client at the end.
with subscriber:
    try:
        streaming_pull_future.result(timeout=timeout)
    except TimeoutError:
        streaming_pull_future.cancel()  # Start the shutdown.
        streaming_pull_future.result()  # Wait until the shutdown is complete.
