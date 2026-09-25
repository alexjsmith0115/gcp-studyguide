"""Lab 62: write, read, and query documents with the Firestore emulator."""
import os
import sys

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

# Stop before the client falls back to a real Firestore database.
if not os.environ.get("FIRESTORE_EMULATOR_HOST"):
    sys.exit("FIRESTORE_EMULATOR_HOST is not set. Start the emulator and export the variable first.")

project = os.environ.get("EMU_PROJECT", "lab62-local")
db = firestore.Client(project=project)
users = db.collection("lab62-users")

users.document("alice").set({"name": "Alice", "team": "platform", "level": 3})
users.document("bob").set({"name": "Bob", "team": "data", "level": 2})
users.document("carol").set({"name": "Carol", "team": "platform", "level": 1})
print("alice ->", users.document("alice").get().to_dict())

# A filter on two fields. The emulator runs it without an index definition.
query = users.where(filter=FieldFilter("team", "==", "platform")).where(
    filter=FieldFilter("level", ">=", 2)
)
for doc in query.stream():
    print("platform, level >= 2 ->", doc.id, doc.to_dict())
