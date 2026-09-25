"""Lab 62: create an instance, a database, and rows with the Spanner emulator."""
import os
import sys

from google.cloud import spanner

# Stop before the client falls back to real Spanner, where an instance is billable.
if not os.environ.get("SPANNER_EMULATOR_HOST"):
    sys.exit("SPANNER_EMULATOR_HOST is not set. Start the emulator and run env-init first.")

project = os.environ.get("EMU_PROJECT", "lab62-local")
client = spanner.Client(project=project)

# The emulator has one instance configuration: emulator-config.
instance = client.instance(
    "lab62-instance",
    configuration_name=f"{client.project_name}/instanceConfigs/emulator-config",
    display_name="Lab 62 emulator",
    node_count=1,
)
if not instance.exists():
    instance.create().result(120)

database = instance.database(
    "lab62-db",
    ddl_statements=[
        "CREATE TABLE Orders (OrderId INT64 NOT NULL, Item STRING(100), Quantity INT64) "
        "PRIMARY KEY (OrderId)"
    ],
)
if not database.exists():
    database.create().result(120)

with database.batch() as batch:
    batch.insert_or_update(
        table="Orders",
        columns=("OrderId", "Item", "Quantity"),
        values=[(1, "keyboard", 2), (2, "monitor", 1)],
    )

with database.snapshot() as snapshot:
    for row in snapshot.execute_sql("SELECT OrderId, Item, Quantity FROM Orders ORDER BY OrderId"):
        print("Orders row ->", row)
