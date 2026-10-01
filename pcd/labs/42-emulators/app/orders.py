"""Lab 42: order code that uses Firestore and Pub/Sub.

The code has no emulator settings. A client library connects to an emulator when its
variable (FIRESTORE_EMULATOR_HOST or PUBSUB_EMULATOR_HOST) is set, and to Google Cloud
when it is not set. Run "python orders.py" to see where the Pub/Sub client connects.
"""
import json
import os

from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore, pubsub_v1
from google.cloud.firestore_v1.base_query import FieldFilter

PROJECT = "lab42-local"  # the emulators accept any project ID

def place_order(db, publisher, topic_path, order_id, item, qty):
    """Saves the order in Firestore, and then publishes an order event to Pub/Sub."""
    if qty < 1:
        raise ValueError("qty must be 1 or more")
    db.collection("orders").document(order_id).set({"item": item, "qty": qty, "status": "new"})
    data = json.dumps({"order_id": order_id, "item": item, "qty": qty}).encode("utf-8")
    future = publisher.publish(topic_path, data, event="order-placed")  # attribute: event
    return future.result()  # the message ID

def new_orders_by_qty(db):
    """An equality filter and a sort on another field: production Firestore needs a manual index."""
    query = (db.collection("orders").where(filter=FieldFilter("status", "==", "new"))
             .order_by("qty", direction=firestore.Query.DESCENDING))
    return [doc.id for doc in query.stream()]

if __name__ == "__main__":
    for name in ("FIRESTORE_EMULATOR_HOST", "PUBSUB_EMULATOR_HOST"):
        print(f"{name}={os.environ.get(name, '(not set)')}")
    # target is the endpoint for the requests of the client. Creating a client sends no request,
    # and AnonymousCredentials means that this check does not read your ADC file.
    publisher = pubsub_v1.PublisherClient(credentials=AnonymousCredentials())
    print("Pub/Sub client target:", publisher.target)
