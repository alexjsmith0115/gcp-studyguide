"""Lab 41: a small shop in the named Firestore database lab41-shop.

Data model: products/{sku}, customers/{id}, and the subcollection customers/{id}/orders/{auto-id}.
Usage: python firestore_demo.py seed | order CUSTOMER SKU QTY | query
"""
import sys

from google.api_core.exceptions import FailedPrecondition
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

# Client libraries use the (default) database unless you set the database ID.
db = firestore.Client(database="lab41-shop")

PRODUCTS = {"mug": ("Coffee mug", 12.5, 10), "tee": ("T-shirt", 20.0, 5), "cap": ("Cap", 15.0, 8)}
ORDERS = {  # customer -> (sku, qty, status) for the seed orders
    "ada": [("mug", 2, "paid"), ("tee", 1, "shipped"), ("cap", 3, "paid")],
    "grace": [("tee", 2, "paid"), ("mug", 1, "paid")],
    "linus": [("cap", 1, "shipped"), ("tee", 1, "paid")],
}

def new_order(sku, qty, status, price):
    return {"sku": sku, "qty": qty, "status": status, "total": price * qty,
            "created": firestore.SERVER_TIMESTAMP}

def seed():
    # A batched write: all operations succeed together, or none of them do. No reads.
    batch = db.batch()
    for sku, (name, price, stock) in PRODUCTS.items():
        batch.set(db.collection("products").document(sku),
                  {"name": name, "price": price, "stock": stock})
    for customer, orders in ORDERS.items():
        customer_ref = db.collection("customers").document(customer)
        batch.set(customer_ref, {"name": customer.title()})
        for sku, qty, status in orders:
            # document() with no ID makes a random ID: no sequential IDs, no hotspots.
            batch.set(customer_ref.collection("orders").document(),
                      new_order(sku, qty, status, PRODUCTS[sku][1]))
    batch.commit()
    print(f"Wrote {len(PRODUCTS)} products and {len(ORDERS)} customers with their orders.")

@firestore.transactional
def place_order(transaction, customer, sku, qty):
    # Firestore can run this function more than once, so it only reads and writes documents.
    product_ref = db.collection("products").document(sku)
    product = product_ref.get(transaction=transaction)  # all reads come before the writes
    if not product.exists or product.get("stock") < qty:
        raise ValueError(f"not enough stock of {sku}")
    order_ref = db.collection("customers").document(customer).collection("orders").document()
    transaction.update(product_ref, {"stock": product.get("stock") - qty})
    transaction.set(order_ref, new_order(sku, qty, "paid", product.get("price")))
    return order_ref.id

def pages(size=2):
    # A collection group query: the orders subcollections of all customers. An equality filter
    # with a sort on another field needs a manual (composite) index with collection group scope.
    paid = (db.collection_group("orders").where(filter=FieldFilter("status", "==", "paid"))
            .order_by("total", direction=firestore.Query.DESCENDING))
    page, last = 1, None
    while True:
        query = paid.limit(size)
        if last:
            query = query.start_after(last)  # the cursor: the last document of the previous page
        docs = list(query.stream())
        if not docs:
            break
        print(f"page {page}: " + ", ".join(
            f"{d.get('total')} ({d.reference.parent.parent.id})" for d in docs))
        page, last = page + 1, docs[-1]

if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["seed"]:
        seed()
    elif len(args) == 4 and args[0] == "order":
        try:
            print("New order:", place_order(db.transaction(), args[1], args[2], int(args[3])))
        except ValueError as err:  # the transaction failed, so it wrote nothing
            sys.exit(f"No order: {err}")
    elif args == ["query"]:
        try:
            pages()
        except FailedPrecondition as err:  # no index yet: the message has a link to create it
            sys.exit(err.message)
    else:
        sys.exit(__doc__)
