---
id: 41-firestore-bigquery
title: Firestore transactions and BigQuery Storage Write API from code
objectives: ["4.1", "1.3"]
minutes: 60
cost: "Less than $0.01. The lab does fewer than 100 Firestore reads and writes, and in us-central1 100,000 document writes cost $0.09. BigQuery load jobs are free, the Storage Write API (gRPC) has 2 TiB free each month, and the first 1 TiB of queries each month is free. Run teardown.sh at the end."
requiresOrg: false
---

## Goal

Write Python code that stores a small shop in a named Firestore database, and then copy orders into a BigQuery table for analysis. In Firestore, you use a subcollection, a batched write, a transaction, a query that needs a manual index, and query cursors. In BigQuery, you create a partitioned and clustered table, write rows to it in three ways, and see how a partition filter lowers the bytes that a query reads.

## Exam relevance

- **Firestore data model.** Documents are in collections, and a document can have subcollections. Documents "should be lightweight", so a large list (here, the orders of a customer) goes in a subcollection ([Data model](https://docs.cloud.google.com/firestore/native/docs/data-model)). Monotonically increasing document IDs "can lead to hotspots" ([Best practices](https://docs.cloud.google.com/firestore/native/docs/best-practices)). See [Schema design for Bigtable and Firestore](note:1.3-nosql-schema).
- **Transaction or batched write.** A transaction reads and then writes, and Firestore can run it again after a concurrent edit. A batched write has no reads ([Transactions and batched writes](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions)). See [Reading and writing data with the client libraries](note:4.1-reading-writing-data).
- **Indexes and cursors.** A query that sorts by a field other than its equality filter needs a manual index (formerly a composite index). For pages, use cursors, not offsets ([Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview), [Best practices](https://docs.cloud.google.com/firestore/native/docs/best-practices)).
- **BigQuery write paths.** Load jobs are free and good for files. For new streaming code, Google recommends the Storage Write API (gRPC). The Storage Write API (REST) was "previously known as the legacy `tabledata.insertAll` method" ([Use the Storage Write API (REST)](https://docs.cloud.google.com/bigquery/docs/write-api-rest)). See [Writing data to BigQuery for analytics and AI/ML](note:1.3-bigquery-writes).

## Before you start

- Complete [the setup lab](lab:00-setup). It sets up Application Default Credentials (ADC), which the Python client libraries use. `pcd/labs/env.sh` sets `GOOGLE_CLOUD_PROJECT`, so the libraries use the lab project.
- **IAM:** you are the Owner of the lab project, so you can create and use Firestore databases and BigQuery datasets.
- **Tools:** the gcloud CLI with the `bq` tool, and Python 3.12 or later with the `venv` module.
- **Time:** about 60 minutes. The manual index takes a few minutes to build.
- **Cost:** less than $0.01. Run `teardown.sh` at the end.
- Run all steps in one shell, from the repository root.

Load the lab environment, and enable the APIs. The Storage Write API is part of the BigQuery Storage API (`bigquerystorage.googleapis.com`).

```bash
source pcd/labs/env.sh
gcloud services enable firestore.googleapis.com bigquery.googleapis.com \
  bigquerystorage.googleapis.com
```

## Steps

1. Create a Python virtual environment in the lab folder, and install the client libraries into it. The `.venv` folder is in `.gitignore`.

   ```bash
   python3 -m venv pcd/labs/41-firestore-bigquery/.venv
   source pcd/labs/41-firestore-bigquery/.venv/bin/activate
   pip install -r pcd/labs/41-firestore-bigquery/app/requirements.txt
   ```

2. Create a named Firestore database. A named database is any database that is not `(default)`. The ID has 4 to 63 characters: lowercase letters, numbers, and hyphens ([Create and manage databases](https://docs.cloud.google.com/firestore/native/docs/manage-databases)).

   ```bash
   gcloud firestore databases create --database=lab41-shop --location="$REGION" \
     --edition=standard --type=firestore-native
   ```

   `--edition=standard` and `--type=firestore-native` are the defaults. The command shows them so that you can see the choices. A regional location such as `us-central1` gives "lower costs" and "lower write latency" than a multi-region location ([Locations](https://docs.cloud.google.com/firestore/native/docs/locations)). Delete protection is off by default, so `teardown.sh` can delete the database.

3. Read the Firestore script.

   ```bash
   cat pcd/labs/41-firestore-bigquery/app/firestore_demo.py
   ```

   Look for these points:

   - `firestore.Client(database="lab41-shop")`. Without the database ID, the client libraries connect to the `(default)` database ([Create and manage databases](https://docs.cloud.google.com/firestore/native/docs/manage-databases)).
   - The data model: `products/{sku}`, `customers/{id}`, and the subcollection `customers/{id}/orders`.
   - `document()` with no ID. Firestore makes a random ID, so new orders do not write to one key range.
   - `seed()` is a batched write. All of its writes succeed together, or none of them do.
   - `place_order()` is a transaction. It reads the stock before it writes, and it does nothing outside Firestore, because Firestore can run it more than once.
   - `pages()` runs a collection group query: one query over the `orders` subcollections of all customers.

4. Write the first data with the batched write.

   ```bash
   python pcd/labs/41-firestore-bigquery/app/firestore_demo.py seed
   ```

   Expected output: `Wrote 3 products and 3 customers with their orders.` The batch has 13 writes: 3 products, 3 customers, and 7 orders. Each write in a batch counts separately toward your Firestore usage ([Transactions and batched writes](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions)).

5. Place two orders with the transaction. The T-shirt (`tee`) stock is 5.

   ```bash
   python pcd/labs/41-firestore-bigquery/app/firestore_demo.py order ada tee 2
   python pcd/labs/41-firestore-bigquery/app/firestore_demo.py order grace tee 5
   ```

   The first order succeeds and prints `New order:` with a random ID. The stock is now 3. The second order prints `No order: not enough stock of tee`. The function raised an error, so the transaction wrote nothing. "A failed transaction returns an error and does not write anything to the database", and you do not roll it back yourself ([Transactions and batched writes](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions)).

6. List the paid orders of all customers, sorted by total. Run the query before you create its index.

   ```bash
   python pcd/labs/41-firestore-bigquery/app/firestore_demo.py query
   ```

   The query fails with a message that the query requires an index, and the message has a link that creates it. Firestore Standard edition indexes each field automatically, but a query that sorts by a different field needs a manual index. A collection group query with a filter or a sort also needs an index with collection group scope ([Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview)).

   You can use the link, but this lab creates the index with gcloud. The gcloud command group still uses the old name, `composite`. The command waits until the index is ready. "The minimum build time for an index is a few minutes, even for an empty database" ([Manage Standard edition indexes](https://docs.cloud.google.com/firestore/native/docs/standard-indexing)).

   ```bash
   gcloud firestore indexes composite create --database=lab41-shop \
     --collection-group=orders --query-scope=collection-group \
     --field-config=field-path=status,order=ascending \
     --field-config=field-path=total,order=descending
   gcloud firestore indexes composite list --database=lab41-shop \
     --format="table(name.basename(),queryScope,state)"
   ```

   The index lists `status` first, because the query uses an equality filter on it. For an equality field, the order (ascending or descending) does not matter. The list shows `COLLECTION_GROUP` and `READY`.

7. Run the query again. The script reads 2 orders for each page.

   ```bash
   python pcd/labs/41-firestore-bigquery/app/firestore_demo.py query
   ```

   Expected output:

   ```text
   page 1: 45.0 (ada), 40.0 (grace)
   page 2: 40.0 (ada), 25.0 (ada)
   page 3: 20.0 (linus), 12.5 (grace)
   ```

   - Orders of all three customers are in the result, and the `shipped` orders are not.
   - Two orders have the total `40.0`. An index sorts equal values by the document path (`__name__`), in the direction of the last sorted field ([Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview)).
   - Each page starts after the last document of the previous page: `start_after(last)` with a document snapshot ([Paginate data with query cursors](https://docs.cloud.google.com/firestore/native/docs/query-data/query-cursors)). An offset also skips documents, but you pay a read for each skipped document ([Best practices](https://docs.cloud.google.com/firestore/native/docs/best-practices)).

8. Create the BigQuery dataset and the table. A dataset name cannot contain a hyphen, so the dataset is `lab41_shop` ([Create datasets](https://docs.cloud.google.com/bigquery/docs/datasets)).

   ```bash
   bq --location="$REGION" mk --dataset --description="Lab 41 orders" "${PROJECT_ID}:lab41_shop"
   bq mk --table \
     --schema=order_id:STRING,customer_id:STRING,status:STRING,total:FLOAT,source:STRING,created_at:TIMESTAMP \
     --time_partitioning_field=created_at --time_partitioning_type=DAY \
     --clustering_fields=customer_id,status \
     "${PROJECT_ID}:lab41_shop.orders"
   ```

   | Flag | Why |
   |---|---|
   | `--location` | The location of the dataset. You cannot change it later ([Batch load data](https://docs.cloud.google.com/bigquery/docs/batch-loading-data)). |
   | `--time_partitioning_field`, `--time_partitioning_type` | One partition for each day of `created_at` ([Create partitioned tables](https://docs.cloud.google.com/bigquery/docs/creating-partitioned-tables)). |
   | `--clustering_fields` | Sorts the storage blocks in each partition by `customer_id`, and then by `status`. You can give up to four columns, and their order matters ([Create clustered tables](https://docs.cloud.google.com/bigquery/docs/creating-clustered-tables)). |

9. Load the batch file with a load job.

   ```bash
   cat pcd/labs/41-firestore-bigquery/app/orders_batch.ndjson
   python pcd/labs/41-firestore-bigquery/app/bq_demo.py load
   ```

   Expected output: `Load job ...: 6 rows`. The file is newline-delimited JSON, one row on each line. Its timestamps have no time zone, so BigQuery reads them as UTC ([Load JSON data from Cloud Storage](https://docs.cloud.google.com/bigquery/docs/loading-data-cloud-storage-json)). Load jobs that use the shared slot pool are free ([BigQuery pricing](https://cloud.google.com/bigquery/pricing)). "If your source data changes infrequently, or you don't need continuously updated results", a load job is a less expensive choice ([Introduction to loading data](https://docs.cloud.google.com/bigquery/docs/loading-data)).

10. Stream 3 rows with the Storage Write API (gRPC).

    ```bash
    python pcd/labs/41-firestore-bigquery/app/bq_demo.py stream
    ```

    Expected output: `Appended 3 rows to the _default stream`. Look at `stream()` in `bq_demo.py`:

    - It writes to the default stream, `.../tables/orders/_default`. You do not create this stream. It gives at-least-once delivery, and the data "is available immediately for query" ([Introduction to the Storage Write API (gRPC)](https://docs.cloud.google.com/bigquery/docs/write-api-grpc)).
    - It sends the rows in Apache Arrow format, and follows the Arrow sample in [Stream data using the Storage Write API (gRPC)](https://docs.cloud.google.com/bigquery/docs/write-api-streaming). The protocol buffer sample on that page needs a module that the protocol buffer compiler makes from a `.proto` file. The docs also say: "Avoid using dynamic proto message generation in Python".
    - It sends all 3 rows in one request.

11. Insert 3 rows with the Storage Write API (REST), the API that was `tabledata.insertAll`.

    ```bash
    python pcd/labs/41-firestore-bigquery/app/bq_demo.py legacy
    ```

    Expected output: `Inserted 3 rows`. The code gives no `insertId` for the rows (`row_ids=[None] * len(rows)`). This turns off best-effort de-duplication, and "This is the recommended way to insert data" ([Use the Storage Write API (REST)](https://docs.cloud.google.com/bigquery/docs/write-api-rest)). This API has no free amount: it costs $0.01 for each 200 MiB, and each row counts as at least 1 KB ([BigQuery pricing](https://cloud.google.com/bigquery/pricing)).

12. Query the table. Then compare the bytes that three queries read, with dry runs. A dry run does not run the query, and "you are not charged for performing a dry run" ([Run a query](https://docs.cloud.google.com/bigquery/docs/running-queries)).

    ```bash
    bq query --use_legacy_sql=false \
      'SELECT source, COUNT(*) AS order_rows, SUM(total) AS revenue FROM lab41_shop.orders GROUP BY source ORDER BY source'
    bq query --use_legacy_sql=false --dry_run 'SELECT * FROM lab41_shop.orders'
    bq query --use_legacy_sql=false --dry_run \
      'SELECT * FROM lab41_shop.orders WHERE created_at < TIMESTAMP("2026-09-02")'
    bq query --use_legacy_sql=false --dry_run \
      'SELECT customer_id, total FROM lab41_shop.orders WHERE created_at < TIMESTAMP("2026-09-02")'
    ```

    The first query shows `batch` with 6 rows and a revenue of 157.5, `grpc` with 3 rows and 75.0, and `rest` with 3 rows and 75.0. The rows from steps 10 and 11 are already in the result.

    Each dry run prints the number of bytes that the query would process. The second number is smaller than the first: the filter on the partitioning column lets BigQuery skip the other partitions. This is partition pruning ([Query partitioned tables](https://docs.cloud.google.com/bigquery/docs/querying-partitioned-tables)). The third number is smaller again. BigQuery stores data by column, and you pay for "the total data processed in the columns you select" ([BigQuery pricing](https://cloud.google.com/bigquery/pricing)).

## Check your work

```bash
gcloud firestore databases describe --database=lab41-shop \
  --format="value(name,type,locationId,databaseEdition)"
gcloud firestore indexes composite list --database=lab41-shop \
  --format="table(name.basename(),queryScope,state)"
bq show --format=prettyjson "${PROJECT_ID}:lab41_shop.orders" | grep -A4 -E '"(clustering|timePartitioning)"'
bq query --use_legacy_sql=false \
  'SELECT source, COUNT(*) AS order_rows FROM lab41_shop.orders GROUP BY source ORDER BY source'
```

Expected:

- The database line shows `projects/PROJECT_ID/databases/lab41-shop`, `FIRESTORE_NATIVE`, `us-central1`, and `STANDARD`.
- One index, with `COLLECTION_GROUP` and `READY`.
- The table has `clustering` with the fields `customer_id` and `status`, and `timePartitioning` with the field `created_at` and the type `DAY`.
- `batch` has 6 rows, and `grpc` and `rest` have 3 rows each. If you ran a step two times, the count for that step is higher.

## Explore

1. A teammate adds a line to `place_order()` that sends a confirmation email. What can go wrong, and where must the email code go?

   <details><summary>Answer</summary>

   Firestore runs the transaction function again if a concurrent edit changes a document that it read, so one order can send two or more emails. "Transaction functions should not directly modify application state". Return the information from the function, and send the email after the transaction succeeds ([Transactions and batched writes](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions)). The script does this with the order ID: `place_order()` returns it, and the caller prints it.

   </details>

2. `pages()` gives `start_after()` the last document snapshot of the page. What happens if the code gives only the value of the sort field, `start_after({"total": 40.0})`?

   <details><summary>Answer</summary>

   Page 2 starts after all orders with the total `40.0`, so the `40.0` order of `ada` never appears. A cursor that has only field values is ambiguous when several documents have the same value. You can add more fields to the cursor ([Paginate data with query cursors](https://docs.cloud.google.com/firestore/native/docs/query-data/query-cursors)). A document snapshot is more precise: the Python client also puts the document path (`__name__`) in the cursor, and the index sorts by that path last ([Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview)).

   </details>

3. Which BigQuery write path fits each case? (a) A partner sends a 50 GB file each night. (b) Your app streams click events, and some duplicate rows are acceptable. (c) Your app streams payments, and duplicate rows are not acceptable. (d) An old app calls `tabledata.insertAll`.

   <details><summary>Answer</summary>

   (a) A load job: it is free with the shared slot pool ([BigQuery pricing](https://cloud.google.com/bigquery/pricing)). (b) The default stream of the Storage Write API (gRPC), with at-least-once delivery. (c) A stream of committed type with stream offsets, for exactly-once delivery ([Stream data using the Storage Write API (gRPC)](https://docs.cloud.google.com/bigquery/docs/write-api-streaming)). (d) It still works: the Storage Write API (REST) "is still fully supported". For a migration, Google recommends the default stream of the Storage Write API (gRPC) ([Use the Storage Write API (REST)](https://docs.cloud.google.com/bigquery/docs/write-api-rest)).

   </details>

4. The table is clustered by `customer_id`. Does a filter such as `WHERE customer_id = "ada"` also lower the dry-run number?

   <details><summary>Answer</summary>

   Not reliably. For a clustered table, the dry run cannot give an accurate estimate, "because the number of storage blocks to be scanned is not known before query execution". The final cost is known after the query runs. Clustering also helps little on small tables: tables or partitions larger than 64 MB "are likely to benefit from clustering" ([Introduction to clustered tables](https://docs.cloud.google.com/bigquery/docs/clustered-tables)). If you must know the cost before a query runs, filter on the partitioning column.

   </details>

## Clean up

Run the teardown script, and then remove the virtual environment:

```bash
bash pcd/labs/41-firestore-bigquery/teardown.sh
deactivate
rm -rf pcd/labs/41-firestore-bigquery/.venv
```

The script deletes:

- the manual index on the `orders` collection group,
- the Firestore database `lab41-shop` and all of its documents. Delete operations for a database delete are free. You can use the ID `lab41-shop` again about 5 minutes after the delete ([Create and manage databases](https://docs.cloud.google.com/firestore/native/docs/manage-databases)),
- the BigQuery dataset `lab41_shop` and its table `orders`.

The enabled APIs stay.

## Docs used

- [Create and manage databases](https://docs.cloud.google.com/firestore/native/docs/manage-databases)
- [Data model](https://docs.cloud.google.com/firestore/native/docs/data-model)
- [Best practices](https://docs.cloud.google.com/firestore/native/docs/best-practices)
- [Transactions and batched writes](https://docs.cloud.google.com/firestore/native/docs/manage-data/transactions)
- [Query and filter data](https://docs.cloud.google.com/firestore/native/docs/query-data/queries)
- [Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview)
- [Manage Standard edition indexes](https://docs.cloud.google.com/firestore/native/docs/standard-indexing)
- [Paginate data with query cursors](https://docs.cloud.google.com/firestore/native/docs/query-data/query-cursors)
- [Locations](https://docs.cloud.google.com/firestore/native/docs/locations)
- [Firestore pricing](https://cloud.google.com/firestore/pricing)
- [gcloud firestore indexes composite create](https://docs.cloud.google.com/sdk/gcloud/reference/firestore/indexes/composite/create)
- [Create datasets](https://docs.cloud.google.com/bigquery/docs/datasets)
- [Create partitioned tables](https://docs.cloud.google.com/bigquery/docs/creating-partitioned-tables)
- [Create clustered tables](https://docs.cloud.google.com/bigquery/docs/creating-clustered-tables)
- [Introduction to clustered tables](https://docs.cloud.google.com/bigquery/docs/clustered-tables)
- [Query partitioned tables](https://docs.cloud.google.com/bigquery/docs/querying-partitioned-tables)
- [Introduction to loading data](https://docs.cloud.google.com/bigquery/docs/loading-data)
- [Batch load data](https://docs.cloud.google.com/bigquery/docs/batch-loading-data)
- [Load JSON data from Cloud Storage](https://docs.cloud.google.com/bigquery/docs/loading-data-cloud-storage-json)
- [Introduction to the Storage Write API (gRPC)](https://docs.cloud.google.com/bigquery/docs/write-api-grpc)
- [Stream data using the Storage Write API (gRPC)](https://docs.cloud.google.com/bigquery/docs/write-api-streaming)
- [Use the Storage Write API (REST)](https://docs.cloud.google.com/bigquery/docs/write-api-rest)
- [BigQuery locations](https://docs.cloud.google.com/bigquery/docs/locations)
- [Run a query](https://docs.cloud.google.com/bigquery/docs/running-queries)
- [BigQuery pricing](https://cloud.google.com/bigquery/pricing)
