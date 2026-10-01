---
id: 30-secrets-and-kms
title: "Secret Manager in Cloud Run, rotation, and envelope encryption with Cloud KMS"
objectives: ["1.2"]
minutes: 60
cost: "Less than $0.10 if you run teardown.sh when done, plus about $0.06 each month for the Cloud KMS key version that teardown keeps (see Clean up). Secret Manager (6 active secret versions, 10,000 access operations, and 3 rotation notifications each month), Pub/Sub (10 GiB each month), Cloud Run, Cloud Build, and Artifact Registry have free tiers."
requiresOrg: false
---

## Goal

Give a Cloud Run service one secret in two ways, as an environment variable and as a mounted file, and see which version each one shows. Then add a rotation schedule, retire an old version, and protect data with Cloud KMS: first directly, then with envelope encryption.

## Exam relevance

- **Environment variable or volume.** Cloud Run resolves a secret in an environment variable when the instance starts, so Google recommends a pinned version. For a mounted volume, Cloud Run fetches the secret each time the app reads the file ([Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)). See [Secrets, credentials, and keys](note:1.2-secrets-and-keys).
- **Least privilege for secrets.** The service identity gets the Secret Manager Secret Accessor role on one secret, not on the project ([Access control with IAM](https://docs.cloud.google.com/secret-manager/docs/access-control)). See [Service accounts, IAM roles, and least privilege](note:1.2-service-accounts-least-privilege).
- **Rotation is a notification.** A rotation schedule sends a `SECRET_ROTATE` message to Pub/Sub. Your own code must make the new value ([Create rotation schedules in Secret Manager](https://docs.cloud.google.com/secret-manager/docs/secret-rotation)).
- **Disable first, then destroy.** You can enable a disabled version again. A destroyed version is gone for good ([Destroy a secret version](https://docs.cloud.google.com/secret-manager/docs/destroy-secret-version)).
- **Envelope encryption.** A data encryption key (DEK) that you make locally encrypts the data. A key encryption key (KEK) in Cloud KMS wraps the DEK, and the KEK never leaves Cloud KMS ([Envelope encryption](https://docs.cloud.google.com/kms/docs/envelope-encryption)).
- **Key rotation and cost.** Rotation adds a new primary key version. It does not re-encrypt data, and the old versions stay active and billed until you destroy them ([Key rotation](https://docs.cloud.google.com/kms/docs/key-rotation)).
- **No service account keys.** Your local code acts as a service account through impersonation. See [Authenticating code to Google Cloud](note:1.2-authenticating-to-google-cloud).

## Before you start

- Complete [the setup lab](lab:00-setup). It grants the Cloud Run Builder role to the Compute Engine default service account, which runs the builds for source deployments.
- **IAM:** you are the Owner of the lab project. To grant a role on the Pub/Sub topic to the Secret Manager service agent, you need the `resourcemanager.projects.setIamPolicy` permission, which the Owner role includes ([Set up notifications on a secret](https://docs.cloud.google.com/secret-manager/docs/event-notifications)).
- **Tools:** the gcloud CLI with its beta commands (step 2), `curl`, and Python 3.12 or later with `venv`.
- **Time:** about 60 minutes. Run all steps in one shell, from the repository root. Later steps use variables from earlier steps.

Load the lab environment, enable the APIs, and make a folder for local files:

```bash
source pcd/labs/env.sh
gcloud services enable secretmanager.googleapis.com cloudkms.googleapis.com \
  pubsub.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iamcredentials.googleapis.com
export LAB30_DIR="${TMPDIR:-/tmp}/lab30"
mkdir -p "$LAB30_DIR"
```

## Steps

1. Create a Pub/Sub topic for the secret events, and a pull subscription to read them later. Create them first, so that the subscription gets the events from the first change of the secret.

   ```bash
   gcloud pubsub topics create lab30-secret-events
   gcloud pubsub subscriptions create lab30-secret-events-sub --topic=lab30-secret-events
   ```

2. Let Secret Manager publish to the topic. Secret Manager publishes as its service agent, a service account that Google manages. The first command creates the service agent for the project. There is no GA command for this, so the docs use `gcloud beta` ([Set up notifications on a secret](https://docs.cloud.google.com/secret-manager/docs/event-notifications)). Then grant the Pub/Sub Publisher role on this topic only.

   ```bash
   gcloud beta services identity create --service=secretmanager.googleapis.com --project="$PROJECT_ID"
   export SM_AGENT="service-${PROJECT_NUMBER}@gcp-sa-secretmanager.iam.gserviceaccount.com"
   gcloud pubsub topics add-iam-policy-binding lab30-secret-events \
     --member="serviceAccount:${SM_AGENT}" --role=roles/pubsub.publisher
   ```

   If gcloud asks to install the beta component, answer `Y`.

3. Create the secret `lab30-db-password` with version 1, the topic, and a rotation schedule. Then add version 2. The values are fake labels, so that the app output shows the version. `printf` adds no newline to the value.

   ```bash
   export NEXT_ROTATION="$(python3 -c 'import datetime as d; t = d.datetime.now(d.timezone.utc) + d.timedelta(minutes=6); print(t.strftime("%Y-%m-%dT%H:%M:%SZ"))')"
   printf 'password-v1' | gcloud secrets create lab30-db-password --data-file=- \
     --replication-policy=automatic \
     --topics="projects/${PROJECT_ID}/topics/lab30-secret-events" \
     --next-rotation-time="$NEXT_ROTATION" --rotation-period=2592000s
   printf 'password-v2' | gcloud secrets versions add lab30-db-password --data-file=-
   gcloud secrets versions list lab30-db-password
   ```

   The first `SECRET_ROTATE` message comes at `NEXT_ROTATION`, in about 6 minutes. The next ones come every 30 days (2,592,000 seconds). The next rotation time must be at least 5 minutes in the future, and the rotation period must be at least 1 hour ([Create rotation schedules in Secret Manager](https://docs.cloud.google.com/secret-manager/docs/secret-rotation)). Google recommends automatic replication, unless your workload has location requirements ([Secret Manager best practices](https://docs.cloud.google.com/secret-manager/docs/best-practices)). Cloud Run cannot use regional secrets ([Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)).

   If `gcloud secrets create` fails because Secret Manager cannot publish to the topic, the grant from step 2 is not active yet. Wait one minute, then run the two `export` and `printf` commands again. A role grant typically takes 2 minutes to propagate, and sometimes 7 minutes or longer ([Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)).

4. Create the service identity `lab30-run` for the Cloud Run service. Grant it the Secret Manager Secret Accessor role on this one secret. Google recommends the lowest level in the resource hierarchy ([Access control with IAM](https://docs.cloud.google.com/secret-manager/docs/access-control)).

   ```bash
   gcloud iam service-accounts create lab30-run --display-name="lab30 service identity"
   export RUN_SA="lab30-run@${PROJECT_ID}.iam.gserviceaccount.com"
   gcloud secrets add-iam-policy-binding lab30-db-password \
     --member="serviceAccount:${RUN_SA}" --role=roles/secretmanager.secretAccessor
   ```

   If the binding fails because the service account does not exist yet, wait one minute and run the last command again.

5. Read the app, then deploy it from source. The environment variable `DB_PASSWORD` is pinned to version 2. The file `/secrets/db/password` uses `latest`. Mount a secret in a new directory: a mount hides all other files in an existing directory ([Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)).

   ```bash
   cat pcd/labs/30-secrets-and-kms/app/main.py
   gcloud run deploy lab30-app \
     --source=pcd/labs/30-secrets-and-kms/app \
     --region="$REGION" \
     --service-account="$RUN_SA" \
     --no-allow-unauthenticated \
     --max=1 \
     --set-secrets="DB_PASSWORD=lab30-db-password:2,/secrets/db/password=lab30-db-password:latest"
   ```

   If the CLI asks to create the `cloud-run-source-deploy` repository, answer `Y`. During the deployment, Cloud Run checks that the service account can access each secret. If the deployment fails with a permission error on the secret, wait one minute and deploy again.

   If the build fails with a permission error, the Compute Engine default service account does not have the Cloud Run Builder role. Cloud Build uses this account for deploys from source. Grant the role as in 00-setup. The grant takes a few minutes to propagate, so wait a few minutes before you deploy again. `teardown.sh` does not remove this grant, because other labs need it.

   ```bash
   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role=roles/run.builder --condition=None
   ```

6. Call the service. It is private, so send your ID token. As the project Owner, you have the `run.routes.invoke` permission.

   ```bash
   export URL="$(gcloud run services describe lab30-app --region="$REGION" --format='value(status.url)')"
   curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
   ```

   Expected output:

   ```text
   env  DB_PASSWORD=password-v2
   file /secrets/db/password=password-v2
   ```

7. Add version 3, then call the service again. You do not deploy again.

   ```bash
   printf 'password-v3' | gcloud secrets versions add lab30-db-password --data-file=-
   curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
   gcloud run revisions list --service=lab30-app --region="$REGION"
   ```

   The environment variable still shows `password-v2`, and the file shows `password-v3`. There is still one revision. The pinned environment variable changes only when you deploy a new revision with a new version number. The `latest` file changes at once in every instance. That is fast, but a bad new version also reaches every instance at once, with no gradual rollout ([About rotation schedules](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations)).

8. Retire version 1. Disable it first, and check that nothing breaks. Then destroy it. You can enable a disabled version again, but a destroyed version is gone for good ([Destroy a secret version](https://docs.cloud.google.com/secret-manager/docs/destroy-secret-version)).

   ```bash
   gcloud secrets versions disable 1 --secret=lab30-db-password
   gcloud secrets versions access 1 --secret=lab30-db-password
   curl -s -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL"
   gcloud secrets versions destroy 1 --secret=lab30-db-password
   gcloud secrets versions list lab30-db-password
   ```

   The `access` command fails, because version 1 is disabled. A disable takes time to propagate, so if the command still prints the value, wait one minute and run it again. The app still works, because it uses versions 2 and 3. Answer `Y` to the `destroy` prompt. The list shows version 1 as `DESTROYED`, and versions 2 and 3 as `ENABLED`.

   By default, Secret Manager destroys a version at once. If an admin turns on delayed destruction for the secret, a destroy request disables the version and schedules the destruction for later, and the admin can restore the version until then ([Destroy a secret version](https://docs.cloud.google.com/secret-manager/docs/destroy-secret-version)). Cloud KMS works the other way: it never destroys a key version at once. By default, the version stays scheduled for destruction for 30 days, and you can restore it during that time ([Destroy and restore key versions](https://docs.cloud.google.com/kms/docs/destroy-restore)).

9. Read the secret events. Wait until the time in `NEXT_ROTATION` has passed, then pull the messages.

   ```bash
   echo "First rotation: ${NEXT_ROTATION}. Now: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
   gcloud pubsub subscriptions pull lab30-secret-events-sub --auto-ack --limit=20 \
     --format="table(message.publishTime, message.attributes.eventType, message.attributes.versionId.basename())"
   gcloud secrets describe lab30-db-password --format="yaml(rotation, topics)"
   ```

   The table shows event types such as `SECRET_CREATE`, `SECRET_VERSION_ADD`, `SECRET_VERSION_DISABLE`, `SECRET_VERSION_DESTROY`, and `SECRET_ROTATE`. The pull command can return fewer messages than are waiting, so run it again until it returns nothing. `nextRotationTime` is now 30 days later. Secret Manager did not change the value: a rotation subscriber must add the new version ([Set up notifications on a secret](https://docs.cloud.google.com/secret-manager/docs/event-notifications), [Create rotation schedules in Secret Manager](https://docs.cloud.google.com/secret-manager/docs/secret-rotation)).

10. Create a Cloud KMS key ring and a symmetric encryption key in your region. The key rotates automatically every 30 days. When you destroy a version of this key, it stays scheduled for destruction for 24 hours, not for the default 30 days. 24 hours is the minimum ([Create a key](https://docs.cloud.google.com/kms/docs/create-key), [Destroy and restore key versions](https://docs.cloud.google.com/kms/docs/destroy-restore)).

    ```bash
    gcloud kms keyrings create lab30-ring --location="$REGION"
    gcloud kms keys create lab30-key --keyring=lab30-ring --location="$REGION" \
      --purpose=encryption --rotation-period=30d --destroy-scheduled-duration=24h
    gcloud kms keys describe lab30-key --keyring=lab30-ring --location="$REGION" \
      --format="yaml(primary.name, primary.state, rotationPeriod, nextRotationTime, destroyScheduledDuration)"
    ```

    Without `--next-rotation-time`, the first rotation comes one rotation period after you create the key ([Rotate a key](https://docs.cloud.google.com/kms/docs/rotate-key)). If you run the lab again, the key ring and the key already exist. The two `create` commands then fail with `ALREADY_EXISTS`, and you can continue.

11. Encrypt and decrypt a small file directly with Cloud KMS. You can do this because you are the project Owner: the Owner role can both create a key and decrypt with it. For this reason, Google advises against granting the Owner role ([Permissions and roles](https://docs.cloud.google.com/kms/docs/reference/permissions-and-roles)).

    ```bash
    printf 'lab30 test data\n' > "$LAB30_DIR/note.txt"
    gcloud kms encrypt --key=lab30-key --keyring=lab30-ring --location="$REGION" \
      --plaintext-file="$LAB30_DIR/note.txt" --ciphertext-file="$LAB30_DIR/note.txt.enc"
    gcloud kms decrypt --key=lab30-key --keyring=lab30-ring --location="$REGION" \
      --ciphertext-file="$LAB30_DIR/note.txt.enc" --plaintext-file=-
    python3 -c 'print("lab30 test record " * 5000)' > "$LAB30_DIR/report.txt"
    gcloud kms encrypt --key=lab30-key --keyring=lab30-ring --location="$REGION" \
      --plaintext-file="$LAB30_DIR/report.txt" --ciphertext-file="$LAB30_DIR/report.txt.enc"
    ```

    The decrypt command prints `lab30 test data`. The last command fails: `report.txt` has about 90 KB, and the Encrypt and Decrypt methods take at most 64 KiB. Cloud KMS is made to manage key encryption keys, not to encrypt large data ([Envelope encryption](https://docs.cloud.google.com/kms/docs/envelope-encryption)).

12. Prepare a least-privilege identity for envelope encryption. `lab30-crypto` gets the Cloud KMS CryptoKey Encrypter/Decrypter role on this one key. You get the Service Account Token Creator role on `lab30-crypto`, so that your local code can impersonate it.

    ```bash
    gcloud iam service-accounts create lab30-crypto --display-name="lab30 envelope encryption"
    export CRYPTO_SA="lab30-crypto@${PROJECT_ID}.iam.gserviceaccount.com"
    gcloud kms keys add-iam-policy-binding lab30-key --keyring=lab30-ring --location="$REGION" \
      --member="serviceAccount:${CRYPTO_SA}" --role=roles/cloudkms.cryptoKeyEncrypterDecrypter
    gcloud iam service-accounts add-iam-policy-binding "$CRYPTO_SA" \
      --member="user:$(gcloud config get-value account)" --role=roles/iam.serviceAccountTokenCreator
    ```

    The key is the lowest level where you can grant this role. You cannot grant roles on a key version ([Permissions and roles](https://docs.cloud.google.com/kms/docs/reference/permissions-and-roles)). If a binding fails because the service account does not exist yet, wait one minute and run it again.

13. Install the libraries in a virtual environment, and read the script. `envelope.py` follows the steps from the docs: make a DEK locally, encrypt the data with AES-256 in Galois Counter Mode (GCM), wrap the DEK with the KEK, and store the wrapped DEK with the data.

    ```bash
    python3 -m venv "$LAB30_DIR/venv"
    "$LAB30_DIR/venv/bin/python" -m pip install --quiet -r pcd/labs/30-secrets-and-kms/requirements.txt
    cat pcd/labs/30-secrets-and-kms/envelope.py
    ```

    The script impersonates `lab30-crypto` with short-lived credentials, as in the docs sample for Python ([Create short-lived credentials for a service account](https://docs.cloud.google.com/iam/docs/create-short-lived-credentials-direct)). The KMS calls follow the docs sample ([Encrypting and decrypting data with a symmetric key](https://docs.cloud.google.com/kms/docs/encrypt-decrypt)). The local encryption uses the Pyca `cryptography` package from the Python Package Index. The Cloud KMS docs install the same package for key import ([Including the Pyca cryptography library](https://docs.cloud.google.com/kms/docs/crypto)).

14. Encrypt the 90 KB file with envelope encryption, look at the result, and decrypt it. The new role grants can take a few minutes. If you get a permission error, wait one minute and try again.

    ```bash
    "$LAB30_DIR/venv/bin/python" pcd/labs/30-secrets-and-kms/envelope.py \
      encrypt "$LAB30_DIR/report.txt" "$LAB30_DIR/report.json"
    cut -c1-100 "$LAB30_DIR/report.json"
    "$LAB30_DIR/venv/bin/python" pcd/labs/30-secrets-and-kms/envelope.py \
      decrypt "$LAB30_DIR/report.json" > "$LAB30_DIR/report.out"
    cmp "$LAB30_DIR/report.txt" "$LAB30_DIR/report.out" && echo "Round trip OK"
    ```

    The envelope file holds four fields: the key name (`kek`), the wrapped DEK, the nonce, and the ciphertext. It does not hold the plaintext DEK. Only one small Cloud KMS call wrapped the DEK, and one call unwrapped it, for 90 KB of data.

15. Check the least privilege. `lab30-crypto` can use the key, but it has no role on the secret.

    ```bash
    gcloud secrets versions access 3 --secret=lab30-db-password \
      --impersonate-service-account="$CRYPTO_SA"
    ```

    The command fails with a `PERMISSION_DENIED` error. Each service account has only the role that its job needs.

## Check your work

```bash
gcloud secrets get-iam-policy lab30-db-password \
  --flatten="bindings[].members" --format="table(bindings.role, bindings.members)"
gcloud kms keys get-iam-policy lab30-key --keyring=lab30-ring --location="$REGION" \
  --flatten="bindings[].members" --format="table(bindings.role, bindings.members)"
gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
  --filter="bindings.members:${RUN_SA} OR bindings.members:${CRYPTO_SA}" --format="value(bindings.role)"
gcloud secrets versions list lab30-db-password --format="table(name, state)"
gcloud run revisions list --service=lab30-app --region="$REGION" --format="value(metadata.name)"
```

Expected output:

- The secret policy has one binding: `roles/secretmanager.secretAccessor` for `serviceAccount:lab30-run@...`.
- The key policy has one binding: `roles/cloudkms.cryptoKeyEncrypterDecrypter` for `serviceAccount:lab30-crypto@...`.
- The project policy has no roles for the two lab service accounts (empty output).
- Secret versions: `1` is `DESTROYED`, and `2` and `3` are `ENABLED`.
- One revision of `lab30-app`.

## Explore

1. A teammate wants `DB_PASSWORD=lab30-db-password:latest` in the environment variable, so that rotation reaches the app without a deployment. What happens, and what do you recommend?

   <details><summary>Answer</summary>

   Cloud Run resolves an environment variable when an instance starts, so Google recommends a pinned version there ([Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)). With `latest`, running instances keep the old value, and new instances get the new value. If the new value is bad, the app fails as instances restart or the service scales up, and this can become a service outage ([About rotation schedules](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations)). Recommend a version number that you deploy with your release process. Then you can validate the change and roll it back ([Secret Manager best practices](https://docs.cloud.google.com/secret-manager/docs/best-practices)).

   </details>

2. The rotation schedule sent `SECRET_ROTATE`, but the database password did not change. What is missing?

   <details><summary>Answer</summary>

   A subscriber. Secret Manager only sends the `SECRET_ROTATE` message to the Pub/Sub topics of the secret. You must configure a subscriber that acts on the message. For example, it creates a new credential in the database and adds it as a new secret version ([Create rotation schedules in Secret Manager](https://docs.cloud.google.com/secret-manager/docs/secret-rotation)). The subscriber's service account needs a role that can add versions, such as Secret Manager Secret Version Adder (`roles/secretmanager.secretVersionAdder`) ([Access control with IAM](https://docs.cloud.google.com/secret-manager/docs/access-control)).

   </details>

3. `lab30-key` rotates every 30 days. Can you still decrypt an envelope that you wrote a year ago, and what does that cost?

   <details><summary>Answer</summary>

   Yes, if the key version that wrapped the DEK is still enabled. Rotation creates a new primary version for new encryptions, but it does not disable or delete the previous versions, and it does not re-encrypt data. The previous versions stay active and incur costs until you destroy them ([Key rotation](https://docs.cloud.google.com/kms/docs/key-rotation)). A software key version costs about $0.06 a month ([Cloud KMS pricing](https://cloud.google.com/kms/pricing)), so 12 rotations add about $0.72 a month. Before you destroy an old version, re-encrypt its data with the new primary version ([Re-encrypting data](https://docs.cloud.google.com/kms/docs/re-encrypt-data)). With envelope encryption, the KEK encrypted only the DEKs, so you re-encrypt the small wrapped DEKs, not the data.

   </details>

4. An operator asks for the Cloud KMS Admin role on `lab30-key`, so that they can decrypt data to debug an incident. Does that role let them decrypt?

   <details><summary>Answer</summary>

   No. Cloud KMS Admin (`roles/cloudkms.admin`) gives access to Cloud KMS resources, but not to cryptographic operations. Encrypt and decrypt need a role such as Cloud KMS CryptoKey Encrypter/Decrypter (`roles/cloudkms.cryptoKeyEncrypterDecrypter`). Google recommends this split, and advises against the Owner role, which can both create a key and decrypt with it ([Permissions and roles](https://docs.cloud.google.com/kms/docs/reference/permissions-and-roles), [Separation of duties](https://docs.cloud.google.com/kms/docs/separation-of-duties)).

   </details>

## Clean up

```bash
bash pcd/labs/30-secrets-and-kms/teardown.sh
```

The script deletes, in order:

- The `lab30-app` service, and its image in the `cloud-run-source-deploy` repository. The repository stays, because other labs use it.
- The secret `lab30-db-password`, with all its versions, its IAM policy, and its rotation schedule.
- The subscription `lab30-secret-events-sub` and the topic `lab30-secret-events`, with the publisher binding of the Secret Manager service agent. The service agent stays, because Google manages it.
- The `lab30-crypto` binding on `lab30-key`, and the automatic rotation schedule of `lab30-key`. Each automatic rotation adds a key version, so without the schedule, the cost cannot grow.
- The `lab30-run` and `lab30-crypto` service accounts, with the Token Creator binding for you.
- The local folder `$LAB30_DIR`, with the virtual environment and the test files.

**Cloud KMS resources stay.** The script does not destroy the key versions. Cloud KMS bills each active key version: an enabled, disabled, or scheduled-for-destruction version. A destroyed version is free. The price for a software symmetric key version is $0.000082192 an hour, about $0.06 a month ([Cloud KMS pricing](https://cloud.google.com/kms/pricing)). After this lab, `lab30-key` has one version, so it costs about $0.06 a month. The script prints the number of active versions at the end.

**Optional, permanent: destroy the key versions.** Only do this when you no longer need any data that the key encrypted. After the destruction, that data can never be decrypted again.

```bash
bash pcd/labs/30-secrets-and-kms/teardown.sh --destroy-key-versions
```

The flag schedules the destruction of each enabled or disabled version. Cloud KMS destroys them after 24 hours, the scheduled duration that you set in step 10, and bills them until then. During those 24 hours, you can restore a version ([Destroy and restore key versions](https://docs.cloud.google.com/kms/docs/destroy-restore)).

After the versions are destroyed, you can also delete the key versions, the key, and the key ring. Deletion only removes them from lists; destruction already stopped the cost. A key can be deleted only when all its versions are deleted and it has no automatic rotation schedule. Deletion is irreversible, and you cannot reuse a deleted key name ([Delete Cloud KMS resources](https://docs.cloud.google.com/kms/docs/delete-kms-resources)).

## Docs used

- [Configure secrets for services](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Deploy services from source code](https://docs.cloud.google.com/run/docs/deploying-source-code)
- [Build a Python application](https://docs.cloud.google.com/docs/buildpacks/python)
- [Quickstart: Build and deploy a Python (Flask) web app to Cloud Run](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-python-service)
- [Authenticate developers](https://docs.cloud.google.com/run/docs/authenticating/developers)
- [Create a secret](https://docs.cloud.google.com/secret-manager/docs/creating-and-accessing-secrets)
- [Add a secret version](https://docs.cloud.google.com/secret-manager/docs/add-secret-version)
- [Choose a secret replication policy](https://docs.cloud.google.com/secret-manager/docs/choosing-replication)
- [Access control with IAM (Secret Manager)](https://docs.cloud.google.com/secret-manager/docs/access-control)
- [Secret Manager best practices](https://docs.cloud.google.com/secret-manager/docs/best-practices)
- [Set up notifications on a secret](https://docs.cloud.google.com/secret-manager/docs/event-notifications)
- [Create rotation schedules in Secret Manager](https://docs.cloud.google.com/secret-manager/docs/secret-rotation)
- [About rotation schedules](https://docs.cloud.google.com/secret-manager/docs/rotation-recommendations)
- [Disable a secret version](https://docs.cloud.google.com/secret-manager/docs/disable-secret-version)
- [Destroy a secret version](https://docs.cloud.google.com/secret-manager/docs/destroy-secret-version)
- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)
- [Create a key ring](https://docs.cloud.google.com/kms/docs/create-key-ring)
- [Create a key](https://docs.cloud.google.com/kms/docs/create-key)
- [Rotate a key](https://docs.cloud.google.com/kms/docs/rotate-key)
- [Key rotation](https://docs.cloud.google.com/kms/docs/key-rotation)
- [Re-encrypting data](https://docs.cloud.google.com/kms/docs/re-encrypt-data)
- [Encrypting and decrypting data with a symmetric key](https://docs.cloud.google.com/kms/docs/encrypt-decrypt)
- [Envelope encryption](https://docs.cloud.google.com/kms/docs/envelope-encryption)
- [Including the Pyca cryptography library](https://docs.cloud.google.com/kms/docs/crypto)
- [Python Client for Cloud Key Management Service (KMS)](https://docs.cloud.google.com/python/docs/reference/cloudkms/latest)
- [Permissions and roles (Cloud KMS)](https://docs.cloud.google.com/kms/docs/reference/permissions-and-roles)
- [Separation of duties](https://docs.cloud.google.com/kms/docs/separation-of-duties)
- [Destroy and restore key versions](https://docs.cloud.google.com/kms/docs/destroy-restore)
- [Delete Cloud KMS resources](https://docs.cloud.google.com/kms/docs/delete-kms-resources)
- [Cloud KMS pricing](https://cloud.google.com/kms/pricing)
- [Create short-lived credentials for a service account](https://docs.cloud.google.com/iam/docs/create-short-lived-credentials-direct)
- [Roles for service account authentication](https://docs.cloud.google.com/iam/docs/service-account-permissions)
- [Access change propagation](https://docs.cloud.google.com/iam/docs/access-change-propagation)
- [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)
- [Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Build pricing](https://cloud.google.com/build/pricing)
- [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing)
