---
id: 21-cloud-sql-ha-dr
title: Cloud SQL high availability, backups, and cross-region replica
objectives: ["2.2", "4.1"]
minutes: 90
cost: "About $0.19 per hour while all three instances run (us-central1 prices), which is about $4.50 per day. Do the whole lab in one sitting, and run teardown.sh at the end."
requiresOrg: false
---

## Goal

Create a Cloud SQL for PostgreSQL instance with high availability (HA), backups, and point-in-time recovery (PITR). Test a zone failover, recover from a bad `DELETE` with PITR, and then promote a cross-region read replica in a disaster recovery (DR) drill.

## Exam relevance

- HA, read replicas, and editions: [Configuring databases for availability, scale, and growth](note:2.2-database-config).
- Backups, PITR, and why replication is not a backup: [Data protection: backup, recovery, and retention](note:2.2-data-protection).
- Cross-region replicas in a warm or hot DR pattern: [Disaster recovery planning](note:4.1-disaster-recovery).

## Before you start

> **Cost warning.** This lab runs three Cloud SQL instances at the same time. They are an HA primary, a PITR clone with the same HA setting, and a replica in a second region. Together they cost about $0.19 per hour, or about $4.50 per day if you forget them. Cloud SQL charges for an instance while it exists, even when nobody uses it. Run `teardown.sh` as soon as you finish.

- Run all commands from the repository root, in the lab shell from `labs/00-setup`.
- You need the Owner role on the lab project.
- Tools: the gcloud CLI. You do not need `psql`, a VM, or network setup. The lab runs SQL through the Cloud SQL Data API (`gcloud sql instances execute-sql`) with IAM database authentication.
- Time: about 90 minutes. Most of it is waiting for instances to be created.
- The lab uses the shared-core machine type `db-g1-small` to keep the cost low. The Cloud SQL SLA does not cover shared-core machine types. Do not use them in production.

```bash
source labs/env.sh
gcloud services enable sqladmin.googleapis.com
```

Set the lab variables. Run this block again if you open a new shell.

```bash
export PRIMARY="lab21-pg"
export CLONE="lab21-pg-pitr"
export REPLICA="lab21-pg-dr"
export DR_REGION="us-east1"
if [ "$REGION" = "us-east1" ]; then export DR_REGION="us-central1"; fi
export ACCOUNT="$(gcloud config get account)"
echo "primary=$PRIMARY region=$REGION dr_region=$DR_REGION account=$ACCOUNT"
```

## Steps

1. Create the primary instance with HA, daily backups, and PITR. PostgreSQL 16 and later default to Enterprise Plus edition, so the command sets Enterprise edition to allow the small shared-core machine type. This step takes about 10 to 15 minutes.

   ```bash
   gcloud sql instances create "$PRIMARY" \
     --database-version=POSTGRES_16 --edition=enterprise --tier=db-g1-small \
     --region="$REGION" --availability-type=regional \
     --storage-type=SSD --storage-size=10 \
     --backup-start-time=03:00 --enable-point-in-time-recovery --retained-transaction-log-days=3 \
     --no-retain-backups-on-delete --no-deletion-protection \
     --database-flags=cloudsql.iam_authentication=on --data-api-access=ALLOW_DATA_API
   ```

   `--availability-type=regional` creates a standby in a second zone. Each write goes to the disks in both zones before the transaction commits. In production, keep deletion protection on. This lab turns it off so that `teardown.sh` can delete the instance.

2. Look at the HA configuration, and then fail over to the standby zone. A failover moves the primary to the other zone. Clients lose their connections for about a minute. Then they reconnect to the same IP address.

   ```bash
   gcloud sql instances describe "$PRIMARY" \
     --format="yaml(settings.edition, settings.tier, settings.availabilityType, gceZone, secondaryGceZone, settings.backupConfiguration)"
   gcloud sql instances failover "$PRIMARY"
   gcloud sql instances describe "$PRIMARY" --format="value(gceZone, secondaryGceZone)"
   ```

   After the failover, the two zones have changed places. HA protects against a zone or instance failure. It does not protect against a region outage or a bad write.

3. Add your user account as an IAM database user, and create sample data. The Data API runs each statement as your IAM identity, so the lab does not use a database password.

   ```bash
   gcloud sql users create "$ACCOUNT" --instance="$PRIMARY" \
     --type=cloud_iam_user --database-roles=cloudsqlsuperuser
   gcloud sql instances execute-sql "$PRIMARY" --database=postgres \
     --sql="CREATE TABLE orders (id serial PRIMARY KEY, item text NOT NULL, created_at timestamptz DEFAULT now()); INSERT INTO orders (item) VALUES ('keyboard'), ('mouse'), ('monitor');"
   gcloud sql instances execute-sql "$PRIMARY" --database=postgres \
     --sql="SELECT * FROM orders ORDER BY id;"
   ```

   The query returns three rows. If `execute-sql` fails with an authentication error, wait one minute and run it again. Your Owner role already includes the `cloudsql.instances.login` and `cloudsql.instances.executeSql` permissions. Other users need a role such as Cloud SQL Instance User (`roles/cloudsql.instanceUser`). In production, give the database user a custom database role with fewer privileges than `cloudsqlsuperuser`.

4. Take an on-demand backup. An on-demand backup gives you a known restore point before a risky change, for example a schema change. Cloud SQL does not delete a standard on-demand backup automatically.

   ```bash
   gcloud sql backups create --instance="$PRIMARY" --description="lab21 before the bad delete"
   gcloud sql backups list --instance="$PRIMARY" --format="table(id, type, status, windowStartTime)"
   ```

   The backup shows the type `ON_DEMAND` and the status `SUCCESSFUL`.

5. Record a recovery point, and then make a mistake. The `DELETE` removes two of the three rows. HA copies it to the standby at once, so the standby cannot help.

   ```bash
   export BEFORE="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
   echo "Recovery point: $BEFORE"
   sleep 10
   gcloud sql instances execute-sql "$PRIMARY" --database=postgres \
     --sql="DELETE FROM orders WHERE item <> 'keyboard';"
   gcloud sql instances execute-sql "$PRIMARY" --database=postgres \
     --sql="SELECT count(*) FROM orders;"
   ```

   The count is now 1.

6. Recover the data with PITR. A PITR always creates a new instance, so the primary keeps serving and keeps its later writes. The new instance gets the settings and the database users of the source. This step takes about 10 to 15 minutes.

   ```bash
   gcloud sql instances clone "$PRIMARY" "$CLONE" --point-in-time="$BEFORE"
   gcloud sql instances execute-sql "$CLONE" --database=postgres \
     --sql="SELECT * FROM orders ORDER BY id;"
   ```

   The clone has all three rows. In a real incident, you copy the missing rows from the clone back to the primary, and then delete the clone. If the clone command says that the time is after the latest recovery time, wait a few minutes and run it again. If `execute-sql` on the clone says that the instance does not allow the Data API, run `gcloud sql instances patch "$CLONE" --data-api-access=ALLOW_DATA_API` first.

7. Create a read replica in a second region. The replica gets changes from the primary through asynchronous replication. It gives read capacity in the DR region and a copy that you can promote in a region outage. This step takes about 10 to 15 minutes.

   ```bash
   gcloud sql instances create "$REPLICA" --master-instance-name="$PRIMARY" \
     --region="$DR_REGION" --edition=enterprise --tier=db-g1-small --availability-type=zonal \
     --database-flags=cloudsql.iam_authentication=on --data-api-access=ALLOW_DATA_API
   gcloud sql instances describe "$REPLICA" \
     --format="yaml(instanceType, masterInstanceName, region, settings.availabilityType)"
   gcloud sql instances execute-sql "$PRIMARY" --database=postgres \
     --sql="INSERT INTO orders (item) VALUES ('headset');"
   gcloud sql instances execute-sql "$REPLICA" --database=postgres \
     --sql="SELECT * FROM orders ORDER BY id;"
   ```

   The replica shows `keyboard` and `headset`. If `headset` is not there yet, wait a few seconds and run the query again. The command sets the IAM authentication flag on the replica. The Cloud SQL docs do not agree on whether a replica gets this flag from the primary.

   Now try to write to the replica. This command fails on purpose, because a read replica is read-only:

   ```bash
   gcloud sql instances execute-sql "$REPLICA" --database=postgres \
     --sql="INSERT INTO orders (item) VALUES ('replica write');"
   ```

   A read replica also cannot fail over. Promotion is a manual step.

8. Run a DR drill: promote the replica to a standalone primary in the second region. Promotion stops replication and gives the instance read and write access. In a real region outage, you then point the applications to the new primary.

   ```bash
   gcloud sql instances promote-replica "$REPLICA"
   gcloud sql instances describe "$REPLICA" \
     --format="yaml(instanceType, masterInstanceName, region, settings.backupConfiguration.enabled)"
   gcloud sql instances execute-sql "$REPLICA" --database=postgres \
     --sql="INSERT INTO orders (item) VALUES ('written in the DR region'); SELECT * FROM orders ORDER BY id;"
   ```

   The instance type changes to `CLOUD_SQL_INSTANCE`, and the write succeeds. Cloud SQL turns on backups for a promoted replica, but it does not turn on HA. For DR, Google recommends that you make the replica that you plan to promote an HA replica, or that you turn on HA after promotion. In a planned migration, first stop the writes to the primary and wait until the replication lag is zero. If you do not, the new primary can miss recent transactions.

## Check your work

```bash
gcloud sql instances list --filter="name~^lab21-" \
  --format="table(name, region, settings.availabilityType, instanceType, state)"
gcloud sql backups list --instance="$PRIMARY" --format="table(id, type, status)"
gcloud sql instances execute-sql "$CLONE" --database=postgres --sql="SELECT count(*) FROM orders;"
```

Expect the following:

- Three instances: `lab21-pg` (`REGIONAL`), `lab21-pg-pitr` (`REGIONAL`, because a clone copies the settings of its source), and `lab21-pg-dr` (`ZONAL`, instance type `CLOUD_SQL_INSTANCE`).
- At least one `ON_DEMAND` backup with the status `SUCCESSFUL`.
- A count of 3 in the clone.

## Explore

1. The primary had HA. Why did HA not protect the orders from the `DELETE`?

   <details><summary>Answer</summary>

   HA uses synchronous replication to the disks in both zones, so every committed write, including the bad `DELETE`, reaches the standby. HA protects against a zone or instance failure. Backups and PITR protect against bad writes. PITR restores to a new instance, and it typically has an RPO of five minutes or less.

   </details>

2. The business wants to fail over to the second region in a region outage. After the outage, it wants to return to the first region without a rebuild. What changes?

   <details><summary>Answer</summary>

   Use Cloud SQL Enterprise Plus edition with advanced DR. You designate a cross-region replica as the DR replica. A replica failover makes the DR replica the primary, and the old primary becomes its replica. Later, a switchover returns the roles to the original state with zero data loss. In Enterprise edition, as in this lab, a promoted replica is a standalone instance. You must create new replicas to protect it again.

   </details>

3. The company plans to delete the primary instance. Auditors want its last state for one year. What must you do before the deletion?

   <details><summary>Answer</summary>

   With standard backups, Cloud SQL deletes the backups together with the instance, unless you turned on retained backups or you take a final backup. Delete the instance with a final backup that you keep for 365 days, for example `gcloud sql instances delete lab21-pg --enable-final-backup --final-backup-retention-days=365`. For a longer period, use enhanced backups with Backup and DR Service, which can keep a final backup for up to 10 years.

   </details>

4. Why did this lab use `db-g1-small`, and what do you use for production?

   <details><summary>Answer</summary>

   `db-g1-small` is a low-cost shared-core type for test and development. The Cloud SQL SLA does not cover it. For production, use a dedicated-core machine type. If the database needs the highest availability, use Enterprise Plus edition, which has a 99.99% SLA that includes maintenance.

   </details>

## Clean up

```bash
bash labs/21-cloud-sql-ha-dr/teardown.sh
```

The script does the following:

- Deletes the DR instance `lab21-pg-dr`, whether you promoted it or not. Cloud SQL cannot delete an instance that has replicas, so the replica goes first.
- Deletes the clone `lab21-pg-pitr`.
- Deletes the primary `lab21-pg`. The instance does not retain backups, so Cloud SQL deletes its backups too.

Confirm that no lab instance is left, because each one costs money every hour:

```bash
gcloud sql instances list --filter="name~^lab21-"
```

## Docs used

- [About high availability](https://docs.cloud.google.com/sql/docs/postgres/high-availability)
- [Cloud SQL editions overview](https://docs.cloud.google.com/sql/docs/postgres/editions-intro)
- [About instance settings](https://docs.cloud.google.com/sql/docs/postgres/instance-settings)
- [Cloud SQL backups overview](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups)
- [Restore an instance overview](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/restore)
- [Perform point-in-time recovery (PITR)](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/pitr)
- [Clone instances](https://docs.cloud.google.com/sql/docs/postgres/clone-instance)
- [About replication in Cloud SQL](https://docs.cloud.google.com/sql/docs/postgres/replication)
- [Create read replicas](https://docs.cloud.google.com/sql/docs/postgres/replication/create-replica)
- [Manage read replicas](https://docs.cloud.google.com/sql/docs/postgres/replication/manage-replicas)
- [Promote replicas for regional migration or disaster recovery](https://docs.cloud.google.com/sql/docs/postgres/replication/cross-region-replicas)
- [IAM authentication](https://docs.cloud.google.com/sql/docs/postgres/iam-authentication)
- [Execute SQL statements using the Cloud SQL Data API](https://docs.cloud.google.com/sql/docs/postgres/executesql-instance)
- [Delete instances](https://docs.cloud.google.com/sql/docs/postgres/delete-instance)
- [Cloud SQL pricing](https://cloud.google.com/sql/pricing)
