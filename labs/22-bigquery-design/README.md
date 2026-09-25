---
id: 22-bigquery-design
title: BigQuery partitioning, clustering, cost controls, and time travel
objectives: ["1.3", "2.2"]
minutes: 60
cost: "Less than $0.10. The queries process less than 10 GB, and the first 1 TiB of query data each month is free. The lab stores less than 5 GB for less than one day. Run teardown.sh when done."
requiresOrg: false
---

## Goal

Copy a public dataset into a partitioned and clustered BigQuery table. Control query cost with dry runs and a bytes-billed limit. Then share a subset of the data through an authorized view, and recover data with time travel.

## Exam relevance

- Partitioning, clustering, and expiration settings: [Configuring databases for availability, scale, and growth](note:2.2-database-config).
- BigQuery as the analytics store in a storage decision: [Choosing storage: object, block, file, and databases](note:1.3-storage-choice).
- Time travel, fail-safe, and table snapshots: [Data protection: backup, recovery, and retention](note:2.2-data-protection).

## Before you start

- Run all commands from the repository root, in the lab shell from `labs/00-setup`. `labs/env.sh` makes `bq` use the lab project too.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI with `bq`, and `python3` to edit one JSON file.
- Time: about 60 minutes.
- Cost: on-demand queries cost $6.25 per TiB after the free 1 TiB each month. A dry run is free. Each query bills at least 10 MB.

```bash
source labs/env.sh
gcloud services enable bigquery.googleapis.com iam.googleapis.com iamcredentials.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export ANALYST="lab22-analyst@${PROJECT_ID}.iam.gserviceaccount.com"
export ACCOUNT="$(gcloud config get account)"
export SRC_TABLE="\`${PROJECT_ID}.lab22_trips.trips\`"
export WORK="${WORK:-$(mktemp -d)}"
echo "project=$PROJECT_ID account=$ACCOUNT table=$SRC_TABLE work=$WORK"
```

## Steps

1. Create two datasets in the `US` multi-region, which is the location of the public data. One dataset holds the source table, and the other holds the view that you share. Both datasets delete new tables after one day, as a safety net for cost.

   ```bash
   bq --location=US mk --dataset --description="lab22 source data" \
     --default_table_expiration=86400 --max_time_travel_hours=48 "${PROJECT_ID}:lab22_trips"
   bq --location=US mk --dataset --description="lab22 shared views" \
     --default_table_expiration=86400 "${PROJECT_ID}:lab22_shared"
   bq show --format=prettyjson "${PROJECT_ID}:lab22_trips" \
     | grep -E '"(location|defaultTableExpirationMs|maxTimeTravelHours)"'
   ```

   The time travel window of `lab22_trips` is 48 hours, the minimum. A shorter window lowers storage cost only in the physical storage billing model.

2. Look at the public Citi Bike table, and estimate query costs with dry runs. BigQuery stores data by column, so a query pays for the columns that it reads. A `LIMIT` clause does not lower the bytes that a `SELECT *` query reads.

   ```bash
   bq show --schema --format=prettyjson bigquery-public-data:new_york.citibike_trips
   bq query --use_legacy_sql=false --dry_run \
     'SELECT * FROM `bigquery-public-data.new_york.citibike_trips`'
   bq query --use_legacy_sql=false --dry_run \
     'SELECT starttime, start_station_name FROM `bigquery-public-data.new_york.citibike_trips`'
   bq query --use_legacy_sql=false \
     'SELECT MIN(starttime) AS first_trip, MAX(starttime) AS last_trip, COUNT(*) AS trips FROM `bigquery-public-data.new_york.citibike_trips`'
   ```

   Each dry run prints the number of bytes that the query would process. The two-column query processes much less than `SELECT *`. The last query shows that the trips start in July 2013.

3. Create a partitioned and clustered table from two columns of the public table. The data has few rows for each day but covers several years. For this shape of data, Google recommends monthly or yearly partitions, together with clustering.

   ```bash
   bq query --use_legacy_sql=false --maximum_bytes_billed=10000000000 '
   CREATE TABLE lab22_trips.trips
   PARTITION BY DATE_TRUNC(trip_date, YEAR)
   CLUSTER BY start_station_name, trip_date
   OPTIONS (require_partition_filter = TRUE)
   AS
   SELECT DATE(starttime) AS trip_date, starttime, start_station_name
   FROM `bigquery-public-data.new_york.citibike_trips`
   WHERE starttime IS NOT NULL'
   bq show --format=prettyjson "${PROJECT_ID}:lab22_trips.trips" \
     | grep -E -A3 '"(timePartitioning|clustering|requirePartitionFilter)"'
   bq query --use_legacy_sql=false \
     'SELECT partition_id, total_rows, total_logical_bytes FROM lab22_trips.INFORMATION_SCHEMA.PARTITIONS WHERE table_name = "trips" ORDER BY partition_id'
   ```

   The table has one partition for each year. The order of the clustering columns matters: queries that filter on the first column, `start_station_name`, get the most benefit. `require_partition_filter` makes every query filter on `trip_date`.

4. Test the partition filter requirement and partition pruning with dry runs. A filter on the partitioning column lets BigQuery skip the partitions that do not match.

   ```bash
   bq query --use_legacy_sql=false --dry_run \
     'SELECT COUNT(*) FROM lab22_trips.trips'
   bq query --use_legacy_sql=false --dry_run \
     'SELECT start_station_name, COUNT(*) AS trips FROM lab22_trips.trips WHERE trip_date >= "2013-01-01" GROUP BY start_station_name'
   bq query --use_legacy_sql=false --dry_run \
     'SELECT start_station_name, COUNT(*) AS trips FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-01-01" AND "2014-12-31" GROUP BY start_station_name'
   ```

   The first query fails: `Cannot query over table ... without a filter that can be used for partition elimination`. The second query filters on `trip_date` but keeps all partitions. The third query reads only the 2014 partition, so its estimate is much smaller.

5. Find the busiest station of 2014, and query it with a bytes-billed limit of 100 MB. A dry run cannot see how many clustered blocks a query skips. The estimate is therefore an upper bound, and the limit uses the estimate.

   ```bash
   export STATION="$(bq --quiet --format=csv query --use_legacy_sql=false \
     'SELECT start_station_name FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-01-01" AND "2014-12-31" GROUP BY start_station_name ORDER BY COUNT(*) DESC LIMIT 1' | tail -n 1)"
   echo "Busiest station in 2014: $STATION"
   bq query --use_legacy_sql=false --dry_run --parameter="station::${STATION}" \
     'SELECT COUNT(*) AS trips FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-01-01" AND "2014-12-31" AND start_station_name = @station'
   bq query --use_legacy_sql=false --maximum_bytes_billed=100000000 --parameter="station::${STATION}" \
     'SELECT COUNT(*) AS trips FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-01-01" AND "2014-12-31" AND start_station_name = @station'
   ```

   The dry run shows the same bytes as a query of the whole 2014 partition. The limited query fails with `Query exceeded limit for bytes billed`, and you pay nothing for it. Now run the query without the limit, and compare the real bytes in the job history:

   ```bash
   bq query --use_legacy_sql=false --parameter="station::${STATION}" \
     'SELECT COUNT(*) AS trips FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-01-01" AND "2014-12-31" AND start_station_name = @station'
   bq query --use_legacy_sql=false \
     'SELECT creation_time, total_bytes_processed, total_bytes_billed, error_result.reason AS error FROM `region-us`.INFORMATION_SCHEMA.JOBS_BY_USER WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR) ORDER BY creation_time DESC LIMIT 5'
   ```

   The newest row is the station query. It processed less than its dry-run estimate, because clustering let BigQuery skip blocks. `total_bytes_billed` is at least 10 MB for each query that ran.

6. Create a view that shares only daily trip counts for each station, and authorize it to read the source dataset. Users of an authorized view can query it without any access to the source table.

   ```bash
   bq query --use_legacy_sql=false "
   CREATE VIEW lab22_shared.station_daily
   OPTIONS (description = 'Daily trips for each start station in 2014')
   AS
   SELECT trip_date, start_station_name, COUNT(*) AS trips
   FROM ${SRC_TABLE}
   WHERE trip_date BETWEEN '2014-01-01' AND '2014-12-31'
   GROUP BY trip_date, start_station_name"
   bq show --format=prettyjson "${PROJECT_ID}:lab22_trips" > "$WORK/lab22_trips.json"
   python3 -c 'import json, sys; p = sys.argv[1]; d = json.load(open(p)); d["access"].append({"view": {"projectId": sys.argv[2], "datasetId": "lab22_shared", "tableId": "station_daily"}}); json.dump(d, open(p, "w"), indent=2)' \
     "$WORK/lab22_trips.json" "$PROJECT_ID"
   bq update --source "$WORK/lab22_trips.json" "${PROJECT_ID}:lab22_trips"
   bq show --format=prettyjson "${PROJECT_ID}:lab22_trips" | grep -A5 '"view"'
   ```

   The access list of `lab22_trips` now has a `view` entry. The view is in a second dataset, as an authorized view must be, and both datasets are in the same location.

7. Create an analyst service account, and give it access to the view only. The analyst needs permission to run query jobs in the project and to read the view. You impersonate the account, so no key file exists.

   ```bash
   gcloud iam service-accounts create lab22-analyst --display-name="lab22 analyst"
   gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${ANALYST}" \
     --role="roles/bigquery.jobUser" --condition=None --format=none
   bq add-iam-policy-binding --member="serviceAccount:${ANALYST}" \
     --role="roles/bigquery.dataViewer" --table=true "${PROJECT_ID}:lab22_shared.station_daily"
   gcloud iam service-accounts add-iam-policy-binding "$ANALYST" \
     --member="user:${ACCOUNT}" --role="roles/iam.serviceAccountTokenCreator" --format=none
   ```

   If a command says that the service account does not exist, wait 30 seconds and run it again. IAM changes take effect after about one minute.

8. Query as the analyst. `CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT` makes one command impersonate the service account and does not change your configuration.

   ```bash
   CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT="$ANALYST" bq query --use_legacy_sql=false \
     'SELECT start_station_name, SUM(trips) AS trips FROM lab22_shared.station_daily GROUP BY start_station_name ORDER BY trips DESC LIMIT 5'
   CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT="$ANALYST" bq query --use_legacy_sql=false \
     'SELECT COUNT(*) AS trips FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-01-01" AND "2014-12-31"'
   ```

   The view query returns the top five stations. The source table query fails with an access denied error. If the view query also fails, wait one or two minutes for IAM and try again.

9. Record a time, delete the trips of July 2014, and read the table as it was before the `DELETE`. Time travel keeps changed and deleted data for the time travel window of the dataset.

   ```bash
   export BEFORE_MS="$(( $(date +%s) * 1000 ))"
   sleep 10
   bq query --use_legacy_sql=false \
     'DELETE FROM lab22_trips.trips WHERE trip_date BETWEEN "2014-07-01" AND "2014-07-31"'
   bq query --use_legacy_sql=false "
   SELECT
     (SELECT COUNT(*) FROM lab22_trips.trips
       WHERE trip_date BETWEEN '2014-07-01' AND '2014-07-31') AS july_rows_now,
     (SELECT COUNT(*) FROM lab22_trips.trips FOR SYSTEM_TIME AS OF TIMESTAMP_MILLIS(${BEFORE_MS})
       WHERE trip_date BETWEEN '2014-07-01' AND '2014-07-31') AS july_rows_before"
   ```

   `july_rows_now` is 0, and `july_rows_before` shows the rows that the `DELETE` removed.

10. Drop the whole table, and restore it into a new table with a time decorator. You cannot query a deleted table, but you can copy it from a time inside the time travel window.

    ```bash
    export BEFORE_DROP_MS="$(( $(date +%s) * 1000 ))"
    sleep 10
    bq rm -f -t "${PROJECT_ID}:lab22_trips.trips"
    bq cp "${PROJECT_ID}:lab22_trips.trips@${BEFORE_DROP_MS}" "${PROJECT_ID}:lab22_trips.trips_restored"
    bq show --format=prettyjson "${PROJECT_ID}:lab22_trips.trips_restored" \
      | grep -E '"(numRows|timePartitioning|expirationTime)"'
    ```

    The restored table has the rows that `trips` had before the drop, but it has no `timePartitioning` entry. A restore from time travel does not copy the partitioning of the table.

11. Set an expiration of one hour on the restored table. An expiration deletes a table automatically, and it overrides the default expiration of the dataset.

    ```bash
    bq update --expiration=3600 "${PROJECT_ID}:lab22_trips.trips_restored"
    bq show --format=prettyjson "${PROJECT_ID}:lab22_trips.trips_restored" | grep '"expirationTime"'
    ```

    `expirationTime` is now one hour from now, in milliseconds since the Unix epoch. You can restore an expired table in the time travel window, as in step 10.

## Check your work

```bash
bq ls "${PROJECT_ID}:lab22_trips"
bq ls "${PROJECT_ID}:lab22_shared"
bq show --format=prettyjson "${PROJECT_ID}:lab22_trips" | grep -c '"view"'
```

Expect the following:

- `lab22_trips` contains only `trips_restored`, because you dropped `trips` in step 10.
- `lab22_shared` contains the view `station_daily` with the type `VIEW`.
- The access list of `lab22_trips` has 1 `view` entry.

## Explore

1. The station query in step 5 would process much less than 100 MB. Why did the 100 MB limit stop it?

   <details><summary>Answer</summary>

   For a clustered table, BigQuery knows which blocks to skip only when the query runs. The dry-run estimate and the bytes-billed check use an upper bound: the columns of every partition that the filter keeps. The limit therefore can stop a clustered query that would process less. A partition filter gives an exact estimate before the query runs.

   </details>

2. A teammate sets a partition expiration of 365 days on `lab22_trips.trips`. What happens to the data?

   <details><summary>Answer</summary>

   BigQuery calculates the expiration of each partition from the partition time, not from the load time. All the partitions are years old, so they expire immediately. You can recover the data only in the time travel window, which is 48 hours for this dataset, or from fail-safe through Cloud Customer Care.

   </details>

3. After step 10, the view `station_daily` fails because `trips` does not exist. How do you get back a partitioned table and a working view?

   <details><summary>Answer</summary>

   Create `lab22_trips.trips` again with `CREATE TABLE ... PARTITION BY ... CLUSTER BY ... AS SELECT * FROM lab22_trips.trips_restored`. Time travel does not restore the partitioning, so you must define it again. The view works again because it refers to the table by name. The access list of `lab22_trips` still authorizes the view.

   </details>

4. Auditors want the table as it was today for the next 90 days. Time travel keeps at most seven days. What do you use?

   <details><summary>Answer</summary>

   Create a table snapshot, for example `bq cp --snapshot --no_clobber --expiration=7776000 SOURCE SNAPSHOT`. A snapshot is read-only, and it stores only the bytes that differ from its base table. You can keep a snapshot for as long as you want.

   </details>

## Clean up

```bash
bash labs/22-bigquery-design/teardown.sh
rm -rf "$WORK"
```

The script deletes both datasets with their tables and the view. It also removes the BigQuery Job User role of the analyst from the project and deletes the analyst service account.

## Docs used

- [Introduction to partitioned tables](https://docs.cloud.google.com/bigquery/docs/partitioned-tables)
- [Manage partitioned tables](https://docs.cloud.google.com/bigquery/docs/managing-partitioned-tables)
- [Introduction to clustered tables](https://docs.cloud.google.com/bigquery/docs/clustered-tables)
- [Data definition language (DDL) statements in GoogleSQL](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/data-definition-language)
- [Run a query](https://docs.cloud.google.com/bigquery/docs/running-queries)
- [Estimate and control costs](https://docs.cloud.google.com/bigquery/docs/best-practices-costs)
- [Optimize query computation](https://docs.cloud.google.com/bigquery/docs/best-practices-performance-compute)
- [JOBS_BY_USER view](https://docs.cloud.google.com/bigquery/docs/information-schema-jobs-by-user)
- [Authorized views](https://docs.cloud.google.com/bigquery/docs/authorized-views)
- [Control access to resources with IAM](https://docs.cloud.google.com/bigquery/docs/control-access-to-resources-iam)
- [REST Resource: datasets](https://docs.cloud.google.com/bigquery/docs/reference/rest/v2/datasets)
- [bq command-line tool reference](https://docs.cloud.google.com/bigquery/docs/reference/bq-cli-reference)
- [Managing gcloud CLI properties](https://docs.cloud.google.com/sdk/docs/properties)
- [Data retention with time travel and fail-safe](https://docs.cloud.google.com/bigquery/docs/time-travel)
- [Access historical data](https://docs.cloud.google.com/bigquery/docs/access-historical-data)
- [Manage tables](https://docs.cloud.google.com/bigquery/docs/managing-tables)
- [Introduction to table snapshots](https://docs.cloud.google.com/bigquery/docs/table-snapshots-intro)
- [BigQuery pricing](https://cloud.google.com/bigquery/pricing)
