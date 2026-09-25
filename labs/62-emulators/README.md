---
id: 62-emulators
title: Local development with Cloud emulators
objectives: ["5.2"]
minutes: 45
cost: "No cost. Everything runs on your machine."
requiresOrg: false
---

## Goal

Run the Pub/Sub, Firestore, Spanner, and Bigtable emulators on your machine. Connect small Python programs to them with environment variables, and find where each emulator differs from the real service.

## Exam relevance

- The exam expects you to know when a team can develop and test against a local emulator, and what an emulator cannot prove. IAM, indexes, limits, and performance need a real project. See [Working with Google Cloud programmatically](note:5.2-programmatic-access).
- The Cloud Client Libraries find each emulator through one environment variable per product. If the variable is missing, the library connects to the real service.
- A separate gcloud configuration lets you send `gcloud` commands to the Spanner emulator without a change to your production configuration.
- For where emulator tests fit in a test strategy, see [Advising teams: deployment, API management, and testing](note:5.1-deployment-and-apis) and [Testing, validation, and root cause analysis](note:4.1-testing-and-troubleshooting).

## Before you start

- **APIs:** none. The emulators run on your machine. You do not enable an API, and the lab creates no cloud resources.
- **IAM:** none. The programs connect only to local emulators and use no resources in your project.
- **Tools:**
  - The gcloud CLI with its component manager (`gcloud components`).
  - Java 21 or later. The Firestore emulator needs Java 21 in current gcloud releases, and the Pub/Sub emulator needs a JDK.
  - Docker, for the Spanner emulator on macOS and Windows. Google ships a native Spanner emulator binary for Linux only.
  - Python 3 with the `venv` module.
- **Release levels:** the Firestore and Spanner emulators use GA commands (`gcloud emulators ...`). The Pub/Sub and Bigtable emulators use `gcloud beta emulators ...`, so you install the `beta` component too.
- **Time:** about 45 minutes. Open two terminal windows at the repo root. Terminal A runs an emulator in the foreground. Terminal B runs the client programs.

## Steps

1. Prepare both terminals. The lab environment script scopes gcloud to the lab configuration. The made-up project ID makes it clear that no request goes to your real project.

```bash
# Run in terminal A and in terminal B, from the repo root.
source labs/env.sh
export EMU_PROJECT=lab62-local
```

2. Install the emulator components in terminal B. The Bigtable emulator component is named `bigtable`.

```bash
gcloud components install beta pubsub-emulator cloud-firestore-emulator bigtable
```

On Linux only, also install the native Spanner emulator. On macOS and Windows, skip this command: gcloud runs the Spanner emulator in Docker.

```bash
gcloud components install cloud-spanner-emulator
```

3. Create a Python virtual environment in terminal B and install the Cloud Client Libraries. The same libraries work with the emulators and with the real services.

```bash
python3 -m venv "$HOME/.venvs/lab62"
source "$HOME/.venvs/lab62/bin/activate"
pip install -r labs/62-emulators/requirements.txt
```

4. Start the Pub/Sub emulator in terminal A. The project ID can be any string, because the emulator runs locally. Set the host and port explicitly, because you run more than one emulator in this lab.

```bash
gcloud beta emulators pubsub start --project="$EMU_PROJECT" --host-port=127.0.0.1:8085
```

Wait for the line `Server started, listening on 8085`.

5. In terminal B, set the emulator variables and run the Pub/Sub program. `env-init` prints the variables, and you must set them again each time you start the emulator.

```bash
$(gcloud beta emulators pubsub env-init)
echo "$PUBSUB_EMULATOR_HOST"
python labs/62-emulators/pubsub_demo.py
```

6. Stop the Pub/Sub emulator and remove the variable. Without this step, a later program in terminal B still tries to reach the stopped emulator.

```bash
# Terminal A: press Control+C.
# Terminal B:
unset PUBSUB_EMULATOR_HOST
```

7. Start the Firestore emulator in terminal A. This emulator has a GA command.

```bash
gcloud emulators firestore start --host-port=127.0.0.1:8080
```

8. In terminal B, point the client at the Firestore emulator and run the program. Then delete all emulator data through the emulator REST endpoint. Tests use this endpoint to start from an empty database without a restart.

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
python labs/62-emulators/firestore_demo.py
curl -s -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/$EMU_PROJECT/databases/(default)/documents"
```

9. Stop the Firestore emulator and remove the variable.

```bash
# Terminal A: press Control+C.
# Terminal B:
unset FIRESTORE_EMULATOR_HOST
```

10. Start the Spanner emulator in terminal A. On macOS, start Docker Desktop first. The emulator serves gRPC on port 9010 and REST on port 9020.

```bash
gcloud emulators spanner start
```

11. In terminal B, set the Spanner emulator variable and run the program. The program creates an instance with the emulator instance configuration, a database, and two rows.

```bash
$(gcloud emulators spanner env-init)
echo "$SPANNER_EMULATOR_HOST"
python labs/62-emulators/spanner_demo.py
```

12. Send `gcloud` commands to the Spanner emulator through a separate configuration. The Spanner emulator accepts gcloud and REST requests, but the Pub/Sub emulator does not accept `gcloud pubsub` commands. The `--no-activate` flag keeps your current configuration active. If gcloud warns that the endpoint is outside the current universe domain, type `y`.

```bash
gcloud config configurations create lab62-emulator --no-activate
gcloud config set auth/disable_credentials true --configuration=lab62-emulator
gcloud config set api_endpoint_overrides/spanner http://localhost:9020/ --configuration=lab62-emulator
gcloud spanner instances list --configuration=lab62-emulator --project="$EMU_PROJECT"
gcloud spanner databases execute-sql lab62-db --instance=lab62-instance \
  --sql="SELECT OrderId, Item, Quantity FROM Orders ORDER BY OrderId" \
  --configuration=lab62-emulator --project="$EMU_PROJECT"
```

13. Stop the Spanner emulator and remove the variable. The emulator keeps data in memory only, so the instance and the rows are gone after the stop.

```bash
# Terminal A: press Control+C.
# Terminal B:
unset SPANNER_EMULATOR_HOST
```

14. Start the Bigtable emulator in terminal A.

```bash
gcloud beta emulators bigtable start --host-port=127.0.0.1:8086
```

If you cannot install the `beta` component, the Bigtable docs give a Docker alternative:

```bash
docker run -p 127.0.0.1:8086:8086 --rm -ti google/cloud-sdk gcloud beta emulators bigtable start --host-port=0.0.0.0:8086
```

15. In terminal B, set the Bigtable emulator variable and run the program. The emulator has no instance admin API, so the program uses any instance name and creates only a table.

```bash
$(gcloud beta emulators bigtable env-init)
echo "$BIGTABLE_EMULATOR_HOST"
python labs/62-emulators/bigtable_demo.py
```

16. Stop the Bigtable emulator and remove the variable. Then run one program without its variable, to see the safety check in the programs.

```bash
# Terminal A: press Control+C.
# Terminal B:
unset BIGTABLE_EMULATOR_HOST
python labs/62-emulators/bigtable_demo.py
```

## Check your work

Your IDs and the order of dictionary keys can differ. Step 5 prints output similar to this:

```text
Emulator at 127.0.0.1:8085 has projects/lab62-local/topics/lab62-orders
Published 'order 1' as message 1
Published 'order 2' as message 2
Published 'order 3' as message 3
Pulled 'order 1' attributes={'source': 'lab62'}
Pulled 'order 2' attributes={'source': 'lab62'}
Pulled 'order 3' attributes={'source': 'lab62'}
```

Step 8 prints the document and one query result. The two-field query runs in the emulator without an index definition:

```text
alice -> {'level': 3, 'name': 'Alice', 'team': 'platform'}
platform, level >= 2 -> alice {'level': 3, 'name': 'Alice', 'team': 'platform'}
```

Step 11 prints two rows, and the `execute-sql` command in step 12 prints the same rows as a table:

```text
Orders row -> [1, 'keyboard', 2]
Orders row -> [2, 'monitor', 1]
```

Step 15 prints:

```text
alice clicks -> 12
scan -> user#alice#20260924 12
scan -> user#bob#20260924 7
```

Step 16 stops with `BIGTABLE_EMULATOR_HOST is not set. Start the emulator and run env-init first.`

## Explore

1. A team runs its integration tests against the Pub/Sub emulator in CI. The team also wants the tests to prove that the subscriber service account has only the permissions it needs. What do you advise?

<details><summary>Answer</summary>

The Pub/Sub emulator does not support IAM operations, so no emulator test can prove a permission design. Keep the fast functional tests on the emulator. Add a smaller test stage in a real test project, where the tests run as the service account through impersonation and check that allowed and denied calls behave as planned.

</details>

2. All Firestore queries passed against the emulator, but some queries fail in the staging database. What is the likely cause, and how do you prevent it?

<details><summary>Answer</summary>

The emulator does not track composite indexes. It runs any valid query, so a query that needs an index in production passes locally. Run the query suite against a real Firestore database before release, and keep the index definitions in source control with the rest of the deployment.

</details>

3. A team wants to use the Spanner emulator to measure latency and to choose the node count for production. Is that a good plan?

<details><summary>Answer</summary>

No. The emulator performance and scalability do not compare to the production service, and its read-write transactions lock the entire database. Use the emulator for functional tests and schema work. Use a real Spanner instance for performance and capacity tests.

</details>

4. Why did step 12 create a new configuration and use the `--configuration` flag, and not change your usual configuration?

<details><summary>Answer</summary>

A configuration is a named set of properties, such as the project, the account, and endpoint overrides. A separate configuration lets you switch between the emulator and the real service per command (`--configuration`) or per terminal (`CLOUDSDK_ACTIVE_CONFIG_NAME`). Your production configuration never contains `auth/disable_credentials` or a local endpoint, so a mistake in one environment does not affect the other.

</details>

## Clean up

In terminal A, press Control+C to stop a running emulator. In terminal B, run `deactivate` to leave the virtual environment. Then run the teardown script:

```bash
bash labs/62-emulators/teardown.sh
```

The script deletes these local items. The lab creates no cloud resources, so the script deletes nothing in Google Cloud.

- The gcloud configuration `lab62-emulator`.
- Running containers from the Spanner emulator image, if Docker is installed.
- The Python virtual environment in `$HOME/.venvs/lab62`.

The emulator components and the Docker image stay installed. To remove the Spanner emulator image, run `docker rmi gcr.io/cloud-spanner-emulator/emulator`.

## Docs used

- [Testing apps locally with the emulator (Pub/Sub)](https://docs.cloud.google.com/pubsub/docs/emulator)
- [Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)
- [Emulate Spanner locally](https://docs.cloud.google.com/spanner/docs/emulator)
- [gcloud emulators spanner start](https://docs.cloud.google.com/sdk/gcloud/reference/emulators/spanner/start)
- [Test using the emulator (Bigtable)](https://docs.cloud.google.com/bigtable/docs/emulator)
- [gcloud beta emulators bigtable env-init](https://docs.cloud.google.com/sdk/gcloud/reference/beta/emulators/bigtable/env-init)
- [Running the Datastore Emulator](https://docs.cloud.google.com/datastore/docs/tools/datastore-emulator)
- [Managing gcloud CLI configurations](https://docs.cloud.google.com/sdk/docs/configurations)
- [gcloud CLI overview: release levels](https://docs.cloud.google.com/sdk/gcloud)
