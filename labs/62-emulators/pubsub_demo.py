"""Lab 62: create a topic and a subscription, publish, and pull with the Pub/Sub emulator."""
import os
import sys

from google.api_core.exceptions import AlreadyExists
from google.cloud import pubsub_v1

# Stop before the client falls back to the real Pub/Sub service.
if not os.environ.get("PUBSUB_EMULATOR_HOST"):
    sys.exit("PUBSUB_EMULATOR_HOST is not set. Start the emulator and run env-init first.")

project = os.environ.get("EMU_PROJECT", "lab62-local")
publisher = pubsub_v1.PublisherClient()
subscriber = pubsub_v1.SubscriberClient()
topic = publisher.topic_path(project, "lab62-orders")
subscription = subscriber.subscription_path(project, "lab62-orders-sub")

try:
    publisher.create_topic(request={"name": topic})
    subscriber.create_subscription(request={"name": subscription, "topic": topic})
except AlreadyExists:
    pass  # a second run against the same emulator session
print(f"Emulator at {os.environ['PUBSUB_EMULATOR_HOST']} has {topic}")

for n in range(1, 4):
    message_id = publisher.publish(topic, f"order {n}".encode(), source="lab62").result()
    print(f"Published 'order {n}' as message {message_id}")

# One pull can return fewer messages than exist, so pull until all three arrive.
received = []
for _ in range(5):
    response = subscriber.pull(request={"subscription": subscription, "max_messages": 10})
    if response.received_messages:
        subscriber.acknowledge(
            request={
                "subscription": subscription,
                "ack_ids": [m.ack_id for m in response.received_messages],
            }
        )
        received += response.received_messages
    if len(received) >= 3:
        break

for m in received:
    print(f"Pulled '{m.message.data.decode()}' attributes={dict(m.message.attributes)}")
subscriber.close()
