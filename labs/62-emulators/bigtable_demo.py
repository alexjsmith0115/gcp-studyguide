"""Lab 62: create a table, write rows, and read them with the Bigtable emulator."""
import os
import sys

from google.cloud import bigtable
from google.cloud.bigtable import column_family

# Stop before the client falls back to real Bigtable.
if not os.environ.get("BIGTABLE_EMULATOR_HOST"):
    sys.exit("BIGTABLE_EMULATOR_HOST is not set. Start the emulator and run env-init first.")

project = os.environ.get("EMU_PROJECT", "lab62-local")
client = bigtable.Client(project=project, admin=True)

# The emulator has no instance admin API: any instance name works.
table = client.instance("lab62-instance").table("lab62-events")
if not table.exists():
    table.create(column_families={"stats": column_family.MaxVersionsGCRule(1)})

for key, clicks in ((b"user#alice#20260924", b"12"), (b"user#bob#20260924", b"7")):
    row = table.direct_row(key)
    row.set_cell("stats", b"clicks", clicks)
    row.commit()

alice = table.read_row(b"user#alice#20260924")
print("alice clicks ->", alice.cell_value("stats", b"clicks").decode())
for row in table.read_rows():
    print("scan ->", row.row_key.decode(), row.cell_value("stats", b"clicks").decode())
