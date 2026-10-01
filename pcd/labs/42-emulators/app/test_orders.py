"""Lab 42: tests for orders.py.

Run them from the repository root: python -m pytest -v pcd/labs/42-emulators/app
"""
import json
import os
import urllib.request
import uuid
from unittest import mock

import pytest
from google.cloud import firestore, pubsub_v1

import orders

FIRESTORE_HOST = os.environ.get("FIRESTORE_EMULATOR_HOST")
PUBSUB_HOST = os.environ.get("PUBSUB_EMULATOR_HOST")
# Safety check: without both variables, the client libraries call Google Cloud, not the emulators.
needs_emulators = pytest.mark.skipif(
    not (FIRESTORE_HOST and PUBSUB_HOST),
    reason="FIRESTORE_EMULATOR_HOST or PUBSUB_EMULATOR_HOST is not set")

@pytest.fixture
def db():
    yield firestore.Client(project=orders.PROJECT)
    # After each test, delete all documents with the documented emulator endpoint.
    url = (f"http://{FIRESTORE_HOST}/emulator/v1/projects/{orders.PROJECT}"
           "/databases/(default)/documents")
    urllib.request.urlopen(urllib.request.Request(url, method="DELETE")).close()

@pytest.fixture
def pubsub():
    # The Pub/Sub emulator has no reset endpoint, so each test gets a new topic and subscription.
    publisher, subscriber = pubsub_v1.PublisherClient(), pubsub_v1.SubscriberClient()
    suffix = uuid.uuid4().hex[:8]
    topic = publisher.topic_path(orders.PROJECT, f"lab42-orders-{suffix}")
    sub = subscriber.subscription_path(orders.PROJECT, f"lab42-orders-test-{suffix}")
    publisher.create_topic(request={"name": topic})  # code only: no gcloud pubsub commands
    subscriber.create_subscription(request={"name": sub, "topic": topic})
    yield publisher, subscriber, topic, sub
    subscriber.delete_subscription(request={"subscription": sub})
    publisher.delete_topic(request={"topic": topic})
    subscriber.close()

@needs_emulators
def test_place_order_saves_and_publishes(db, pubsub):
    publisher, subscriber, topic, sub = pubsub
    orders.place_order(db, publisher, topic, "o1", "mug", 2)
    saved = db.collection("orders").document("o1").get().to_dict()
    assert saved == {"item": "mug", "qty": 2, "status": "new"}
    response = subscriber.pull(request={"subscription": sub, "max_messages": 1}, timeout=30)
    message = response.received_messages[0].message
    assert json.loads(message.data) == {"order_id": "o1", "item": "mug", "qty": 2}
    assert message.attributes["event"] == "order-placed"

@needs_emulators
def test_query_needs_no_index_in_the_emulator(db):
    for order_id, qty in [("a", 1), ("b", 3), ("c", 2)]:
        db.collection("orders").document(order_id).set({"item": "cap", "qty": qty, "status": "new"})
    assert orders.new_orders_by_qty(db) == ["b", "c", "a"]

def test_bad_quantity_with_mocks():
    # A unit test with mocks: no emulator and no network. It checks only the logic of place_order.
    db, publisher = mock.Mock(), mock.Mock()
    with pytest.raises(ValueError):
        orders.place_order(db, publisher, "topic", "o2", "mug", 0)
    db.collection.assert_not_called()
    publisher.publish.assert_not_called()
