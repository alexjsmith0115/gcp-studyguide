"""lab70-backend: /price returns a price, and /fail logs an exception for Error Reporting."""
import random
import time
import traceback

from flask import Flask, request
from opentelemetry import trace

from telemetry import log, setup_tracing

app = Flask(__name__)
setup_tracing(app)
tracer = trace.get_tracer("lab70-backend")


@app.get("/price")
def price():
    item = request.args.get("item", "book")
    with tracer.start_as_current_span("compute-price") as span:  # a custom span in the server span
        span.set_attribute("lab70.item", item)
        time.sleep(random.uniform(0.05, 0.2))  # stands in for real work, such as a database query
        log("INFO", f"price computed for {item}", event="price_computed")
    return {"item": item, "price": 12.5}


def charge_card(item):
    raise RuntimeError(f"payment provider timed out for {item}")


@app.get("/fail")
def fail():
    item = request.args.get("item", "book")
    try:
        charge_card(item)
    except RuntimeError:
        # Severity ERROR and a stack trace in "message": Error Reporting creates an error event.
        log("ERROR", traceback.format_exc(), event="payment_failed")
        return {"error": "payment failed"}, 500
