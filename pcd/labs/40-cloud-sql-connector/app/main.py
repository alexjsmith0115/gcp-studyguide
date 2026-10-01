"""lab40-app: a Cloud Run service that reads and writes Cloud SQL for PostgreSQL.

The Cloud SQL Python Connector opens an encrypted connection to the instance and
logs in with automatic IAM database authentication: there is no database password.
The code follows the connect_with_connector_auto_iam_authn sample in the Cloud SQL
docs (Log in using IAM database authentication).

GET /      adds a row to the visits table and returns the database user and the row count.
GET /slow  holds one connection for 10 seconds, so parallel requests fill the pool.
"""
import os

import pg8000
import sqlalchemy
from flask import Flask
from google.cloud.sql.connector import Connector, IPTypes

INSTANCE_CONNECTION_NAME = os.environ["INSTANCE_CONNECTION_NAME"]  # project:region:instance
# For a service account: its email without the ".gserviceaccount.com" suffix.
DB_IAM_USER = os.environ["DB_IAM_USER"]
DB_NAME = os.environ["DB_NAME"]
# Public IP by default. For a private IP instance (Direct VPC egress), set PRIVATE_IP=1.
IP_TYPE = IPTypes.PRIVATE if os.environ.get("PRIVATE_IP") else IPTypes.PUBLIC

# One Connector for each process. LAZY gets a new certificate only when a connection needs
# one. The docs recommend it for serverless environments, where the CPU can be throttled.
connector = Connector(refresh_strategy="LAZY")


def getconn() -> pg8000.dbapi.Connection:
    # enable_iam_auth=True: the connector logs in as the identity that runs it (ADC),
    # with an OAuth 2.0 token instead of a password. That identity must be DB_IAM_USER.
    return connector.connect(
        INSTANCE_CONNECTION_NAME,
        "pg8000",
        user=DB_IAM_USER,
        db=DB_NAME,
        enable_iam_auth=True,
        ip_type=IP_TYPE,
    )


# One pool for each instance of the service. It is created at startup, and all requests share it.
pool = sqlalchemy.create_engine(
    "postgresql+pg8000://",
    creator=getconn,
    pool_size=5,  # connections that the pool keeps open
    max_overflow=3,  # extra connections when all 5 are busy: 5 + 3 = 8 at most
    pool_timeout=30,  # seconds that a request waits for a free connection, then an error
    pool_recycle=1800,  # replace a connection after 30 minutes
)
# Connections from the service = maximum instances x (pool_size + max_overflow) = 2 x 8 = 16.

app = Flask(__name__)


@app.route("/")
def visit():
    # "with" gives the connection back to the pool at the end of the block.
    with pool.connect() as conn:
        conn.execute(sqlalchemy.text("INSERT INTO visits DEFAULT VALUES"))
        conn.commit()
        user = conn.execute(sqlalchemy.text("SELECT current_user")).scalar()
        visits = conn.execute(sqlalchemy.text("SELECT count(*) FROM visits")).scalar()
    return {"db_user": user, "visits": visits}


@app.route("/slow")
def slow():
    with pool.connect() as conn:
        conn.execute(sqlalchemy.text("SELECT pg_sleep(10)"))
    return {"slept_seconds": 10}


if __name__ == "__main__":
    # Local run only. On Cloud Run, the Procfile starts gunicorn on $PORT.
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8080")))
