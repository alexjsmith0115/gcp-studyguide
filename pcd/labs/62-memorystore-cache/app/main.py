"""lab62-app: the cache-aside pattern with Memorystore for Redis.

GET    /products/<id>  Reads the cache first. On a miss, reads the slow source and
                       writes the result to the cache with a TTL.
DELETE /products/<id>  Deletes the entry from the cache (invalidation).
"""
import json
import os
import time

import redis
from flask import Flask, jsonify

TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "60"))
CA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "server-ca.pem")

# One client for each app instance, created at startup. Its connection pool keeps
# connections open and reuses them, because each new connection costs a TLS handshake.
cache = redis.Redis(
    host=os.environ["REDIS_HOST"],       # a private IP address, reached over Direct VPC egress
    port=int(os.environ["REDIS_PORT"]),  # 6378: the port for in-transit encryption
    password=os.environ["REDIS_AUTH"],   # the AUTH string. Cloud Run reads it from Secret Manager.
    ssl=True,                            # the instance blocks clients that do not use TLS
    ssl_ca_certs=CA_FILE,                # the CA certificates of this instance
    ssl_check_hostname=False,            # the host is an IP address, so check only the CA chain
    socket_connect_timeout=2,            # if the cache is slow or down, fail fast and use the source
    socket_timeout=2,
    decode_responses=True,
)
app = Flask(__name__)


def load_from_source(product_id):
    """The slow source of truth, for example a database query or a call to another API."""
    time.sleep(1.5)
    return {"id": product_id, "name": f"Product {product_id}", "loaded_at": time.strftime("%H:%M:%S")}


def reply(start, product, result, ttl_left=None):
    latency_ms = round((time.perf_counter() - start) * 1000, 1)
    return jsonify(product=product, cache=result, latency_ms=latency_ms, ttl_left=ttl_left)


@app.get("/products/<product_id>")
def get_product(product_id):
    start = time.perf_counter()
    key = f"product:{product_id}"
    try:
        cached = cache.get(key)  # 1. read the cache
    except redis.RedisError as e:  # the cache is not the source of truth: keep serving without it
        return reply(start, load_from_source(product_id), f"error: {e}")
    if cached is not None:  # 2. hit: no call to the source
        return reply(start, json.loads(cached), "hit", cache.ttl(key))
    product = load_from_source(product_id)  # 3. miss: read the source, then fill the cache
    # The TTL limits how old the data can get. The default eviction policy,
    # volatile-lru, evicts only keys that have a TTL.
    cache.set(key, json.dumps(product), ex=TTL_SECONDS)
    return reply(start, product, "miss", TTL_SECONDS)


@app.delete("/products/<product_id>")
def invalidate(product_id):
    # Invalidation: after a change to the source, delete the entry. The next read is a miss.
    return jsonify(deleted=cache.delete(f"product:{product_id}"))
