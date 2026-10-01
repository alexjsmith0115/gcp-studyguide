# Context for the lab 42 app

This folder has `orders.py` and its tests in `test_orders.py`. `orders.py` saves orders in Firestore and publishes an order event to Pub/Sub.

## Rules for tests

- Use pytest. Write new tests in a new file, `test_orders_ai.py`. Do not change `orders.py` or `test_orders.py`, and do not add other files.
- Tests never call Google Cloud. They use the Firestore emulator and the Pub/Sub emulator, with the project ID `orders.PROJECT`.
- Skip a test that needs an emulator when `FIRESTORE_EMULATOR_HOST` or `PUBSUB_EMULATOR_HOST` is not set, as `test_orders.py` does.
- Create Pub/Sub topics and subscriptions in code, with a new name for each test, as the `pubsub` fixture does. Do not run gcloud commands.
- Delete the Firestore data after each test, as the `db` fixture does.
- Each test checks one behavior and asserts a specific expected value.

## Run the tests

Run this command from the repository root. The emulators run in other terminals.

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 PUBSUB_EMULATOR_HOST=127.0.0.1:8085 \
  pcd/labs/42-emulators/.venv/bin/python -m pytest -v pcd/labs/42-emulators/app
```
