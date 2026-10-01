---
id: 42-emulators
title: Local development and unit tests with the gcloud emulators
objectives: ["2.1", "2.3"]
minutes: 45
cost: "No cost. The emulators run on your computer, and the lab creates no Google Cloud resources."
requiresOrg: false
---

## Goal

Run the Firestore and Pub/Sub emulators on your computer, and run pytest tests against them. The code under test is normal client library code. An environment variable decides whether a call goes to an emulator or to Google Cloud. You also clear the emulator data between tests, see a query that the emulator accepts but production Firestore rejects without an index, and compare an emulator test with a unit test that uses mocks.

## Exam relevance

- **Start commands and variables.** The GA `gcloud emulators` group has Firestore and Spanner. The Pub/Sub, Bigtable, and Datastore emulators are only in `gcloud beta emulators`. A client library connects to an emulator when its variable is set, for example `PUBSUB_EMULATOR_HOST` or `FIRESTORE_EMULATOR_HOST`. See [Emulating Google Cloud services for local development and unit tests](note:2.1-emulators).
- **What an emulator cannot prove.** The Pub/Sub emulator does not support IAM operations ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)). The Firestore emulator "does not track composite indexes" and runs any valid query ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)). Test IAM, indexes, and limits in a real test project.
- **Mocks or emulators.** A unit test with mocks checks your own logic, with no emulator and no network. An emulator test also checks the client library calls. See [Writing unit tests with AI coding assistants](note:2.3-unit-tests-with-ai).

## Before you start

- **Google Cloud:** none. You do not need the lab project, an API, or an IAM role. All requests go to emulators on your computer.
- **Tools:**
  - The gcloud CLI.
  - A JDK, version 21 or later. The Pub/Sub emulator needs a JDK, and the current Firestore emulator needs Java 21 or later ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator), [Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)). Check with `java -version`.
  - Python 3.12 or later with the `venv` module, and `curl`.
- **Terminals:** open three terminals in the repository root. Terminal 1 runs the Firestore emulator, terminal 2 runs the Pub/Sub emulator, and terminal 3 is your work shell. The optional step 9 uses a fourth terminal.
- **Time:** about 45 minutes.
- **Cost:** none.

## Steps

1. In terminal 3, install the emulator components. The Pub/Sub emulator commands are in the `beta` component.

   ```bash
   gcloud components install beta pubsub-emulator cloud-firestore-emulator
   ```

   If you installed the gcloud CLI with a package manager such as `apt` or `dnf`, the component manager is disabled ([Managing gcloud CLI components](https://docs.cloud.google.com/sdk/docs/components)). Install the packages instead, for example `sudo apt-get install google-cloud-cli-pubsub-emulator google-cloud-cli-firestore-emulator` ([Install the Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk)).

2. Create a Python virtual environment in the lab folder, and install the client libraries and pytest. The `.venv` folder is in `.gitignore`.

   ```bash
   python3 -m venv pcd/labs/42-emulators/.venv
   source pcd/labs/42-emulators/.venv/bin/activate
   pip install -r pcd/labs/42-emulators/app/requirements.txt
   ```

3. Read the code and the tests.

   ```bash
   cat pcd/labs/42-emulators/app/orders.py
   cat pcd/labs/42-emulators/app/test_orders.py
   ```

   Look for these points:

   - `orders.py` has no endpoint and no credentials. The same code works with the emulators and with Google Cloud.
   - The `db` fixture clears Firestore after each test. It sends `DELETE` to the endpoint that the docs give for this purpose: `/emulator/v1/projects/PROJECT_ID/databases/(default)/documents` ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)).
   - The `pubsub` fixture makes a new topic and subscription for each test, and deletes them at the end. The Pub/Sub emulator keeps its resources and messages "for the lifetime of the emulator session", and it does not support the console or `gcloud pubsub` commands, so the test makes them in code ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)). The calls follow the Python samples in [Create a topic](https://docs.cloud.google.com/pubsub/docs/create-topic), [Create pull subscriptions](https://docs.cloud.google.com/pubsub/docs/create-subscription), and [Publish messages to topics](https://docs.cloud.google.com/pubsub/docs/publisher).
   - `needs_emulators` skips a test if a variable is missing. Without the variable, the client library calls the production service.
   - `test_bad_quantity_with_mocks` uses `unittest.mock`, like the Pub/Sub unit test sample in the docs ([Pub/Sub unit tests](https://docs.cloud.google.com/functions/docs/samples/functions-pubsub-unit-test)).

4. Run the tests and the endpoint check before you start the emulators.

   ```bash
   python -m pytest -v pcd/labs/42-emulators/app
   python pcd/labs/42-emulators/app/orders.py
   ```

   pytest reports `1 passed, 2 skipped`: only the mock test runs. `orders.py` prints `Pub/Sub client target: pubsub.googleapis.com:443`, the production endpoint. `target` is "the API endpoint used by the client instance" ([Class Client (Pub/Sub publisher)](https://docs.cloud.google.com/python/docs/reference/pubsub/latest/google.cloud.pubsub_v1.publisher.client.Client)). Creating a client sends no request.

5. In terminal 1, start the Firestore emulator. The Firestore emulator uses the GA command group.

   ```bash
   gcloud emulators firestore start --host-port=127.0.0.1:8080
   ```

   The emulator prints the host and port where it runs. `127.0.0.1:8080` is the default in the docs. The command sets it so that the address is clear. The emulator keeps data in memory only ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)).

6. In terminal 2, start the Pub/Sub emulator. The project ID does not have to be a real project. The lab uses `lab42-local`, the project ID in `orders.py`.

   ```bash
   export EMU_PROJECT=lab42-local
   gcloud beta emulators pubsub start --project="$EMU_PROJECT" --host-port=127.0.0.1:8085
   ```

   Wait for `Server started, listening on 8085`. By default, the emulator listens on the IPv6 address `::1`. `--host-port=127.0.0.1:8085` makes it use IPv4, which also works when IPv6 is off ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)).

7. In terminal 3, set the variables, and run the endpoint check again.

   ```bash
   $(gcloud beta emulators pubsub env-init)
   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   env | grep EMULATOR_HOST
   python pcd/labs/42-emulators/app/orders.py
   ```

   - `env-init` prints the command that sets `PUBSUB_EMULATOR_HOST`, and `$( )` runs it. Set the variables again each time that you start the emulator, because the port can change ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)).
   - The Firestore emulator group has no `env-init` command, so you set `FIRESTORE_EMULATOR_HOST` yourself. When it is set, "the server client libraries automatically connect to the emulator" ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)).
   - The endpoint check now prints `Pub/Sub client target: 127.0.0.1:8085`. The code did not change.

8. Run the tests against the emulators.

   ```bash
   python -m pytest -v pcd/labs/42-emulators/app
   ```

   pytest reports `3 passed`. Look at `test_query_needs_no_index_in_the_emulator`. The query has an equality filter on `status` and a sort on `qty`. In production Firestore, this query fails until you create a manual index (formerly a composite index). The emulator "does not track composite indexes and will instead execute any valid query" ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)). [The Firestore and BigQuery lab](lab:41-firestore-bigquery) shows the production error.

9. (Optional) Start the Bigtable and Spanner emulators, and set their variables with `env-init`. Use a fourth terminal for each emulator, and press Ctrl+C there to stop it.

   The Bigtable emulator is in the `beta` group. Its component is `bigtable`, and it uses `localhost:8086` by default ([Test using the emulator](https://docs.cloud.google.com/bigtable/docs/emulator)):

   ```bash
   gcloud components install bigtable              # terminal 3
   gcloud beta emulators bigtable start            # terminal 4
   $(gcloud beta emulators bigtable env-init)      # terminal 3
   echo "$BIGTABLE_EMULATOR_HOST"
   ```

   The Spanner emulator is in the GA group. It uses `localhost:9010` for gRPC and `localhost:9020` for REST ([Emulate Spanner locally](https://docs.cloud.google.com/spanner/docs/emulator)). gcloud has a native binary for Linux only. On other systems, install Docker first, and gcloud runs the emulator in a container ([gcloud emulators spanner start](https://docs.cloud.google.com/sdk/gcloud/reference/emulators/spanner/start)).

   ```bash
   gcloud components install cloud-spanner-emulator   # terminal 3, Linux only
   gcloud emulators spanner start                     # terminal 4
   $(gcloud emulators spanner env-init)               # terminal 3
   echo "$SPANNER_EMULATOR_HOST"
   ```

   After you stop these emulators, run `unset BIGTABLE_EMULATOR_HOST SPANNER_EMULATOR_HOST` in terminal 3.

## Check your work

With the Firestore and Pub/Sub emulators still running, run in terminal 3:

```bash
env | grep EMULATOR_HOST
python -m pytest -v pcd/labs/42-emulators/app
python pcd/labs/42-emulators/app/orders.py
```

Expected:

- `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `PUBSUB_EMULATOR_HOST=127.0.0.1:8085`.
- `3 passed`. If you run the tests again, they pass again, because the fixtures clear the data.
- `Pub/Sub client target: 127.0.0.1:8085`.

## Explore

1. Your team wants a CI test that proves that the subscriber service account has only the permissions that it needs. Can a test against the Pub/Sub emulator prove this?

   <details><summary>Answer</summary>

   No. The Pub/Sub emulator does not support IAM operations ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)). Keep the fast functional tests on the emulator. Add an integration test that runs as the service account against real resources in a test project. See [Automated integration tests in Cloud Build](note:2.3-integration-tests-cloud-build).

   </details>

2. All Firestore tests pass against the emulator. After the deployment, one query fails with an error that says that the query requires an index. Why did the tests not find this, and how do you prevent it?

   <details><summary>Answer</summary>

   The query needs a manual index, and the emulator does not check indexes. In production, Firestore returns an error with a link to create the missing index ([Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview)). "Make sure to test your app against a real Firestore instance to determine which indexes you require" ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)). Keep the index definitions with your deployment code, for example in Terraform or in the Firebase CLI index file ([Manage Standard edition indexes](https://docs.cloud.google.com/firestore/native/docs/standard-indexing)).

   </details>

3. When is a mock a better choice than an emulator?

   <details><summary>Answer</summary>

   Use a mock to test your own logic, for example the input check in `place_order`, or a function that reads fields from a context object. The test is fast and needs no emulator, as in the [Pub/Sub unit tests](https://docs.cloud.google.com/functions/docs/samples/functions-pubsub-unit-test) sample. A mock returns only what the test tells it to return, so it cannot show that a real query or a real API call works. Firebase says that stubbing every database call "greatly increases the complexity of your test code" for functions that use Firestore ([Unit testing of Cloud Functions](https://firebase.google.com/docs/functions/unit-testing)). For code that reads and writes Firestore or Pub/Sub, use the emulator.

   </details>

4. A developer stops the Pub/Sub emulator, but `PUBSUB_EMULATOR_HOST` stays set in the shell. Later, the developer runs a script in that shell that must publish to the real Pub/Sub service. What happens?

   <details><summary>Answer</summary>

   The client library still sends the calls to the emulator address, so the script fails to connect. After you stop the emulator, run `unset PUBSUB_EMULATOR_HOST`, "so your application will connect to Pub/Sub" ([Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)). Do the same for `FIRESTORE_EMULATOR_HOST`.

   </details>

## Clean up

The lab creates no Google Cloud resources, so it has no teardown script.

1. In terminals 1 and 2, press Ctrl+C to stop the emulators. You can also stop the Firestore emulator with a POST to `/shutdown`: `curl -d '' 127.0.0.1:8080/shutdown` ([Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)).
2. In terminal 3, remove the variables, leave the virtual environment, and delete it:

   ```bash
   unset PUBSUB_EMULATOR_HOST FIRESTORE_EMULATOR_HOST
   deactivate
   rm -rf pcd/labs/42-emulators/.venv
   ```

The emulator components stay installed. To remove them, run `gcloud components remove pubsub-emulator cloud-firestore-emulator`.

## Docs used

- [Testing apps locally with the emulator](https://docs.cloud.google.com/pubsub/docs/emulator)
- [Use Firestore emulator locally](https://docs.cloud.google.com/firestore/native/docs/emulator)
- [Test using the emulator](https://docs.cloud.google.com/bigtable/docs/emulator)
- [Emulate Spanner locally](https://docs.cloud.google.com/spanner/docs/emulator)
- [gcloud emulators spanner start](https://docs.cloud.google.com/sdk/gcloud/reference/emulators/spanner/start)
- [Managing gcloud CLI components](https://docs.cloud.google.com/sdk/docs/components)
- [Install the Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk)
- [Create a topic](https://docs.cloud.google.com/pubsub/docs/create-topic)
- [Create pull subscriptions](https://docs.cloud.google.com/pubsub/docs/create-subscription)
- [Publish messages to topics](https://docs.cloud.google.com/pubsub/docs/publisher)
- [Class Client (Pub/Sub publisher)](https://docs.cloud.google.com/python/docs/reference/pubsub/latest/google.cloud.pubsub_v1.publisher.client.Client)
- [Pub/Sub unit tests](https://docs.cloud.google.com/functions/docs/samples/functions-pubsub-unit-test)
- [Unit testing of Cloud Functions](https://firebase.google.com/docs/functions/unit-testing)
- [Standard edition index overview](https://docs.cloud.google.com/firestore/native/docs/standard-index-overview)
- [Manage Standard edition indexes](https://docs.cloud.google.com/firestore/native/docs/standard-indexing)
