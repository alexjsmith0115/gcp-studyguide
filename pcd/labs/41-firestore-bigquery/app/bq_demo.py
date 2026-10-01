"""Lab 41: three ways to write rows to the BigQuery table lab41_shop.orders.

Usage: python bq_demo.py load | stream | legacy
  load    a batch load job from orders_batch.ndjson (free, not real time)
  stream  the Storage Write API (gRPC), default stream, rows in Apache Arrow format
  legacy  the Storage Write API (REST), formerly tabledata.insertAll: insert_rows_json
"""
import datetime
import os
import sys
import uuid

import pyarrow as pa
from google.cloud import bigquery, bigquery_storage_v1
from google.cloud.bigquery_storage_v1 import types as gapic_types
from google.cloud.bigquery_storage_v1.writer import AppendRowsStream

PROJECT = os.environ["GOOGLE_CLOUD_PROJECT"]  # pcd/labs/env.sh sets it
TABLE_ID = f"{PROJECT}.lab41_shop.orders"
BATCH_FILE = os.path.join(os.path.dirname(__file__), "orders_batch.ndjson")
# BigQuery type -> Arrow type: STRING -> string, FLOAT64 -> float64, TIMESTAMP -> timestamp (us, UTC).
ARROW_SCHEMA = pa.schema([("order_id", pa.string()), ("customer_id", pa.string()),
                          ("status", pa.string()), ("total", pa.float64()),
                          ("source", pa.string()), ("created_at", pa.timestamp("us", tz="UTC"))])

def new_rows(source, count=3):
    now = datetime.datetime.now(datetime.timezone.utc)
    return [{"order_id": str(uuid.uuid4()), "customer_id": "ada", "status": "paid",
             "total": 12.5 * (i + 1), "source": source, "created_at": now} for i in range(count)]

def load():
    config = bigquery.LoadJobConfig(source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON)
    with open(BATCH_FILE, "rb") as f:
        # No location: BigQuery runs the job in the location of the destination dataset.
        job = bigquery.Client().load_table_from_file(f, TABLE_ID, job_config=config)
    job.result()  # waits for the load job to finish
    print(f"Load job {job.job_id}: {job.output_rows} rows")

def stream():
    # This follows the Arrow sample in the docs. It needs no generated protocol buffer code.
    table = pa.Table.from_pylist(new_rows("grpc"), schema=ARROW_SCHEMA)
    # The first request of the connection names the stream and sends the Arrow schema.
    template = gapic_types.AppendRowsRequest()
    template.write_stream = f"projects/{PROJECT}/datasets/lab41_shop/tables/orders/_default"
    arrow_data = gapic_types.AppendRowsRequest.ArrowData()
    arrow_data.writer_schema.serialized_schema = table.schema.serialize().to_pybytes()
    template.arrow_rows = arrow_data
    append_rows_stream = AppendRowsStream(bigquery_storage_v1.BigQueryWriteClient(), template)
    # Send all rows in one request (a batch), not one request for each row.
    request = gapic_types.AppendRowsRequest()
    request.arrow_rows.rows.serialized_record_batch = table.to_batches()[0].serialize().to_pybytes()
    append_rows_stream.send(request).result()  # the default stream: at-least-once delivery
    append_rows_stream.close()
    print(f"Appended {table.num_rows} rows to the _default stream")

def legacy():
    # JSON rows: a TIMESTAMP can be the number of seconds since the Unix epoch.
    rows = [dict(r, created_at=r["created_at"].timestamp()) for r in new_rows("rest")]
    # row_ids=None for each row: no insertId, so no best-effort de-duplication (recommended).
    errors = bigquery.Client().insert_rows_json(TABLE_ID, rows, row_ids=[None] * len(rows))
    if errors:
        sys.exit(f"Errors: {errors}")
    print(f"Inserted {len(rows)} rows")

if __name__ == "__main__":
    commands = {"load": load, "stream": stream, "legacy": legacy}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]]()
