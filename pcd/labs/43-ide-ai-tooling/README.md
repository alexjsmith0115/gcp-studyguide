---
id: 43-ide-ai-tooling
title: Set up Cloud Code, Gemini Code Assist, and an MCP server in your IDE
objectives: ["2.1", "2.3"]
minutes: 45
cost: "No cost. The lab creates no Google Cloud resources. The MCP tool list needs no authentication, and the Gemini Cloud Assist panel has no cost while it is in Preview. Steps 6 to 9 need a Gemini Code Assist Standard or Enterprise license, which this lab does not buy."
requiresOrg: false
---

## Goal

Set up VS Code for Google Cloud development with AI help. You install Cloud Code, add a Google Cloud remote MCP server to the agent settings, and ask Gemini Cloud Assist a question about your project. With a Gemini Code Assist license, you also use agent mode (Preview) and a context file to write pytest tests for the lab 42 app. Then you run the tests against the emulators.

## Exam relevance

- **Tools and credentials.** Cloud Code signs in through the gcloud CLI and also updates your Application Default Credentials (ADC). The ADC file belongs to your user account, not to a gcloud configuration. See [Developer tools](note:2.1-developer-tools).
- **Gemini Code Assist setup and context.** A developer needs a Standard or Enterprise license. The developer also needs a project with the Gemini for Google Cloud API (`cloudaicompanion.googleapis.com`), and the Gemini for Google Cloud User role (`roles/cloudaicompanion.user`) on it. A `GEMINI.md` file gives agent mode your rules. See [AI coding assistants, context, and MCP servers](note:2.1-ai-assisted-development).
- **MCP servers and IAM.** A Google Cloud remote MCP server is available when you enable the API of its product. Each tool call needs the `mcp.tools.call` permission and the permissions for the resource. See [AI coding assistants, context, and MCP servers](note:2.1-ai-assisted-development).
- **Review AI-generated tests.** Run them against the emulators, and make sure that they never call Google Cloud. See [Writing unit tests with AI coding assistants](note:2.3-unit-tests-with-ai).

## Before you start

- Complete [the setup lab](lab:00-setup). For steps 6 to 9, also complete [the emulator lab](lab:42-emulators). This lab uses its virtual environment and its emulators.
- **IAM:** you are the Owner of the lab project. The Owner role includes the permissions that this lab needs, so the lab grants no roles.
- **Tools:** VS Code, the gcloud CLI, Python 3.12 or later, and `curl`.
- **Time:** about 30 minutes for steps 1 to 5, and 15 more minutes for steps 6 to 9.
- **Cost:** none.
- Run the commands from the repository root.

Load the lab environment, and enable the APIs. The Pub/Sub remote MCP server is enabled when you enable the Pub/Sub API ([Use the Pub/Sub remote MCP server](https://docs.cloud.google.com/pubsub/docs/use-pubsub-mcp)). The other five APIs are the APIs that Gemini Cloud Assist needs. `geminicloudassist.googleapis.com` also enables the Gemini for Google Cloud API ([Set up Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/set-up-gemini)).

```bash
source pcd/labs/env.sh
gcloud services enable pubsub.googleapis.com geminicloudassist.googleapis.com \
  cloudasset.googleapis.com designcenter.googleapis.com appoptimize.googleapis.com \
  apphub.googleapis.com
```

### Gemini Code Assist editions and cost

Steps 6 to 9 need a Gemini Code Assist license. Since June 18, 2026, the IDE extensions and the Gemini CLI do not serve the consumer tiers. These tiers are Gemini Code Assist for individuals, Google AI Pro, and Google AI Ultra ([Gemini Code Assist consumer accounts](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)). Two editions remain:

| Edition | What it gives | Fee, monthly commitment | Fee, 12-month commitment |
|---|---|---|---|
| Standard | Code completion, generation, chat, agent mode, and the Gemini CLI | $0.031232877 per hour ($22.80 for 730 hours) | $0.026027397 per hour ($19.00 for 730 hours) |
| Enterprise | All of Standard, plus code customization from your private repositories and higher daily limits for agent mode and the Gemini CLI | $0.073972603 per hour ($54.00 for 730 hours) | $0.061643836 per hour ($45.00 for 730 hours) |

Source: [Gemini for Google Cloud pricing](https://cloud.google.com/products/gemini/pricing). The fee is for each license.

You cannot buy a license for yourself in the console now:

- Since September 4, 2026, a billing account without an active Gemini Code Assist subscription cannot buy one in the Google Cloud console. To get a new subscription, contact Google Cloud sales ([Gemini Code Assist release notes](https://docs.cloud.google.com/gemini/docs/codeassist/release-notes), [Set up Gemini Code Assist Standard and Enterprise](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini)). The pricing page still says that you can buy licenses in the Gemini Admin console, and it still links to the free version for individuals. Both statements are out of date.
- Since August 20, 2026, new customers do not get credits for the first month ([Gemini Code Assist release notes](https://docs.cloud.google.com/gemini/docs/codeassist/release-notes)).

If your employer gives you a license, use it for steps 6 to 9. If you have no license, do steps 1 to 5, and read steps 6 to 9.

## Steps

1. Install Cloud Code for VS Code. Cloud Code adds Google Cloud features to VS Code, and it installs the Gemini Code Assist extension by default ([Install the Cloud Code for VS Code extension](https://docs.cloud.google.com/code/docs/vscode/install)).

   1. In VS Code, open the Extensions view: press Ctrl+Shift+X, or Cmd+Shift+X on macOS.
   2. Search for `Google Cloud Code`, and click **Install**. If VS Code asks, restart it.
   3. Click **File > Open Folder**, and open the repository root.

   The activity bar shows the Cloud Code icon and the Gemini Code Assist icon (a spark). Gemini Code Assist is a separate extension from Cloud Code. Its Standard and Enterprise editions are not on by default ([Cloud Code overview](https://docs.cloud.google.com/code/docs/vscode/overview)).

2. Sign in with Cloud Code, and select the lab project. Cloud Code uses the gcloud CLI for sign-in ([Cloud Code overview](https://docs.cloud.google.com/code/docs/vscode/overview), [Install the Cloud Code for VS Code extension](https://docs.cloud.google.com/code/docs/vscode/install)). So first record your gcloud configurations:

   ```bash
   gcloud config configurations list
   ```

   1. In the Cloud Code status bar, click **Cloud Code - Sign in**. If Cloud Code already shows your account, go to item 4.
   2. If VS Code asks you to trust `https://accounts.google.com`, click **Configure Trusted Domains**.
   3. Sign in in your browser with the Google account of the lab project, and click **Allow**. If Cloud Code asks about the gcloud CLI, select your existing installation.
   4. In the Cloud Code status bar, click the active project name. Select **Switch Project**, and select your lab project. Its ID is in `$PROJECT_ID`.

   The install page says that the sign-in also updates your ADC. Compare your configurations with the first list, and check ADC:

   ```bash
   gcloud config configurations list
   gcloud auth application-default print-access-token > /dev/null && echo "ADC works"
   ```

   If the account or the project of one of your configurations changed, set it back before you use that configuration again.

3. List the tools of the Pub/Sub remote MCP server. A Google Cloud remote MCP server runs on Google infrastructure and has an HTTP endpoint. The `tools/list` method needs no authentication. The request uses the format of MCP version 2026-07-28. In this version, each request carries the protocol version, and there is no `initialize` handshake ([Use the Pub/Sub remote MCP server](https://docs.cloud.google.com/pubsub/docs/use-pubsub-mcp), [Manage MCP servers](https://docs.cloud.google.com/mcp/manage-mcp-servers)).

   ```bash
   curl -s -X POST https://pubsub.googleapis.com/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json' \
     -H 'MCP-Protocol-Version: 2026-07-28' \
     -H 'Mcp-Method: tools/list' \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "tools/list",
       "params": {
         "_meta": {
           "io.modelcontextprotocol/protocolVersion": "2026-07-28",
           "io.modelcontextprotocol/clientCapabilities": {
             "extensions": {
               "io.modelcontextprotocol/ui": {
                 "mimeTypes": ["text/html;profile=mcp-app"]
               }
             }
           }
         }
       }
     }' | python3 -c 'import json, sys; print(*sorted(t["name"] for t in json.load(sys.stdin)["result"]["tools"]), sep="\n")'
   ```

   Expect the tools that the [Pub/Sub MCP reference](https://docs.cloud.google.com/pubsub/docs/reference/mcp) lists:

   ```text
   create_snapshot
   create_subscription
   create_topic
   delete_snapshot
   delete_subscription
   delete_topic
   get_snapshot
   get_subscription
   get_topic
   list_snapshots
   list_subscriptions
   list_topics
   publish
   update_subscription
   update_topic
   ```

   Some tools only read, for example `list_topics`. Other tools change or delete resources, for example `delete_topic`. The lab uses the global endpoint, which is GA. The regional endpoints are in Preview.

4. Add the server to the Gemini settings file. In VS Code, agent mode is powered by the Gemini CLI ([Gemini CLI](https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli)). It reads its MCP servers from `mcpServers` in `~/.gemini/settings.json`, and you cannot add them from the command palette ([Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)). The script adds one entry, `lab43-pubsub`, and keeps your other settings.

   ```bash
   cat pcd/labs/43-ide-ai-tooling/mcp_settings.py
   python3 pcd/labs/43-ide-ai-tooling/mcp_settings.py add "$PROJECT_ID"
   ```

   The entry uses the fields of the Gemini CLI sample in [Configure MCP in an AI application](https://docs.cloud.google.com/mcp/configure-mcp-ai-application):

   | Field | Value | Why |
   |---|---|---|
   | `httpUrl` | `https://pubsub.googleapis.com/mcp` | The endpoint of the server. The transport is streamable HTTP |
   | `authProviderType` | `google_credentials` | The client authenticates with your ADC. Pub/Sub does not support API keys as an authentication method |
   | `oauth.scopes` | `https://www.googleapis.com/auth/pubsub` | The OAuth scope of the Pub/Sub MCP tools |
   | `headers` | `x-goog-user-project` with your project ID | The quota project of each request ([Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)) |

   Each tool call needs two permissions: `mcp.tools.call` on the project, and the Pub/Sub permission for the tool ([Control MCP use with Identity and Access Management](https://docs.cloud.google.com/mcp/control-mcp-use-iam)). The MCP Tool User role (`roles/mcp.toolUser`) gives `mcp.tools.call`:

   ```bash
   gcloud iam roles describe roles/mcp.toolUser --format="value(includedPermissions)"
   ```

   The output is `mcp.tools.call;resourcemanager.projects.get;resourcemanager.projects.list`. The Owner role also includes `mcp.tools.call` ([Google Cloud MCP servers roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/mcp)), so you need no new role.

   The agent uses your identity, with all your permissions. For production workloads, Google recommends a separate agent or workload identity ([Configure MCP in an AI application](https://docs.cloud.google.com/mcp/configure-mcp-ai-application)). Add only MCP servers that you trust: an MCP server can run code with the permissions of your user account ([Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)).

5. Ask Gemini Cloud Assist (Preview) one question in the console. Gemini Cloud Assist answers questions about your project, and its panel has no cost while it is in Preview ([Use Gemini Cloud Assist in the Google Cloud console](https://docs.cloud.google.com/cloud-assist/chat-panel)). Print the console address of the lab project:

   ```bash
   echo "https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID"
   ```

   1. Open the address. In the console toolbar, click **Open or close Gemini Cloud Assist chat** (the spark icon).
   2. In the **Enter a prompt** field, enter this prompt, and click **Send prompt**:

      ```text
      List all users granted roles/owner and include the attached resources.
      ```

   Expect your account and the lab project in the answer. Gemini Cloud Assist also gives a query that you can run to check the result. The first prompt can take several minutes, because Gemini Cloud Assist sets up a query environment. If it fails, wait a few minutes and try again.

   Gemini output can be wrong, so check it with gcloud:

   ```bash
   gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
     --filter="bindings.role=roles/owner" --format="value(bindings.members)"
   ```

   Gemini Cloud Assist can store data in any Google Cloud data center. Do not enable it in a project with data residency or customer-managed encryption key (CMEK) requirements ([Set up Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/set-up-gemini)). Your Owner role includes the chat permissions, for example `geminicloudassist.agents.invoke`. Other developers need the Gemini Cloud Assist User role (`roles/geminicloudassist.user`) and the Cloud Asset Viewer role (`roles/cloudasset.viewer`) ([Gemini Cloud Assist roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/geminicloudassist)).

**Steps 6 to 9 need a Gemini Code Assist license.** If you have no license, read them, and then go to Check your work.

6. Sign in to Gemini Code Assist, and select its project. Gemini Code Assist uses a Google Cloud project to manage API access, quota, and billing ([Set up Gemini Code Assist Standard and Enterprise](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini)).

   1. In the activity bar, click **Gemini Code Assist**. In the chat pane, click **Login to Google Cloud**. Sign in with the Google account that has your license.
   2. In the status bar, click **Gemini Code Assist**, and select **Select Gemini Code project**.
   3. Select the project that your administrator set up for Gemini Code Assist. That project has the Gemini for Google Cloud API, and your account has `roles/cloudaicompanion.user` or the same permissions there.

   The `lab43-pubsub` entry does not use this sign-in. It gets its tokens from your ADC, and it sends the lab project as the quota project.

7. Add a context file for the lab 42 app. Agent mode includes the content of `GEMINI.md` files with your prompts. A file in a subfolder of your working folder applies to that part of the project ([Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)).

   ```bash
   cp pcd/labs/43-ide-ai-tooling/lab42-context.md pcd/labs/42-emulators/app/GEMINI.md
   cat pcd/labs/42-emulators/app/GEMINI.md
   ```

   | Scope | Where you put `GEMINI.md` |
   |---|---|
   | All your projects | `~/.gemini/GEMINI.md` |
   | One project | Your working folder, or a parent folder up to the project root (the folder with `.git`) or your home folder |
   | One part of a project | A subfolder of your working folder |

   A more specific file overrides or adds to a more general file. The rules tell the agent where to write the tests, how to keep them away from Google Cloud, and how to run them. The run command sets the emulator variables itself, because the variables that you export in a terminal do not reach VS Code.

8. Ask agent mode (Preview) to write tests, and run them against the emulators. Agent mode reads files, writes files, and runs terminal commands. It asks you before it changes files ([Agent mode overview](https://docs.cloud.google.com/gemini/docs/codeassist/agent-mode)). First start the emulators, as in steps 5 and 6 of [the emulator lab](lab:42-emulators). In terminal 1:

   ```bash
   gcloud emulators firestore start --host-port=127.0.0.1:8080
   ```

   In terminal 2:

   ```bash
   export EMU_PROJECT=lab42-local
   gcloud beta emulators pubsub start --project="$EMU_PROJECT" --host-port=127.0.0.1:8085
   ```

   Then use agent mode in VS Code:

   1. In the activity bar, click **Gemini Code Assist**. Click the **Agent** toggle.
   2. Enter this prompt:

      ```text
      Add pytest tests for pcd/labs/42-emulators/app/orders.py. Follow the GEMINI.md file in
      that folder. Test that new_orders_by_qty leaves out orders whose status is not "new", that
      place_order accepts qty 1, and that a second place_order with the same order ID replaces
      the first document. Then run the tests with the command in GEMINI.md.
      ```

   3. Read the plan and each change before you allow it. Allow the new file `test_orders_ai.py` and the pytest command. Deny other commands.

   Then check the new tests yourself, in a third terminal in the repository root:

   ```bash
   source pcd/labs/42-emulators/.venv/bin/activate
   env -u FIRESTORE_EMULATOR_HOST -u PUBSUB_EMULATOR_HOST \
     python -m pytest -v pcd/labs/42-emulators/app/test_orders_ai.py
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 PUBSUB_EMULATOR_HOST=127.0.0.1:8085 \
     python -m pytest -v pcd/labs/42-emulators/app
   ```

   - Without the variables, each test that needs an emulator shows `SKIPPED`, and no test fails. A Google Cloud error, for example `PermissionDenied`, means that a test called Google Cloud. Fix that test.
   - With the variables, all tests pass: the 3 tests of lab 42 and the new tests.
   - Read `test_orders_ai.py`. Each test asserts a specific value, cleans up its data, and uses only functions that exist. Agent mode does not cite sources, so also look for long blocks of copied code ([Agent mode overview](https://docs.cloud.google.com/gemini/docs/codeassist/agent-mode)).

   The agent writes different code each time. If a test fails, give the error to the agent, or fix the test yourself. You are responsible for the security, testing, and effectiveness of your code. This includes the code that Gemini writes ([How Gemini products in Google Cloud use your data](https://docs.cloud.google.com/gemini/docs/discover/data-governance)).

9. Use the MCP server from agent mode. If you did not reload VS Code after step 4, open the command palette and run **Developer: Reload Window**. In the agent mode chat, enter `/mcp`. The list shows `lab43-pubsub`, its connection status, and its tools ([Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)). Print your project ID:

   ```bash
   echo "$PROJECT_ID"
   ```

   Enter this prompt, with your project ID in place of `PROJECT_ID`:

   ```text
   Use the lab43-pubsub MCP server to list the Pub/Sub topics in project PROJECT_ID.
   Do not create, change, or delete anything.
   ```

   The agent calls `list_topics`. A read-only tool might run without a prompt. A tool that changes resources asks first, unless you allowed it always or turned on yolo mode ([Agent mode overview](https://docs.cloud.google.com/gemini/docs/codeassist/agent-mode), [Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)). The call has no Pub/Sub cost, because Pub/Sub charges for published, delivered, and stored bytes ([Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)). Compare the answer with gcloud:

   ```bash
   gcloud pubsub topics list --format="value(name)"
   ```

   The two lists have the same topics. They are empty if no other lab left a topic.

## Check your work

```bash
gcloud services list --enabled --format="value(config.name)" \
  --filter="config.name=(pubsub.googleapis.com geminicloudassist.googleapis.com cloudaicompanion.googleapis.com)" | sort
python3 -m json.tool ~/.gemini/settings.json | grep -A2 '"lab43-pubsub"'
gcloud auth application-default print-access-token > /dev/null && echo "ADC works"
```

Expected output:

```text
cloudaicompanion.googleapis.com
geminicloudassist.googleapis.com
pubsub.googleapis.com
        "lab43-pubsub": {
            "httpUrl": "https://pubsub.googleapis.com/mcp",
            "authProviderType": "google_credentials",
ADC works
```

If you did steps 6 to 9, the emulators are still running, and the tests pass:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 PUBSUB_EMULATOR_HOST=127.0.0.1:8085 \
  pcd/labs/42-emulators/.venv/bin/python -m pytest -q pcd/labs/42-emulators/app
```

## Explore

1. A teammate has only the Pub/Sub Viewer role in a project. Their agent calls `list_topics` through the Pub/Sub MCP server, and the call fails. Why, and what is the smallest fix?

   <details><summary>Answer</summary>

   A tool call needs `mcp.tools.call` on the project and the permission for the resource. Pub/Sub Viewer gives `pubsub.topics.list`, but not `mcp.tools.call` ([Pub/Sub roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/pubsub), [Control MCP use with Identity and Access Management](https://docs.cloud.google.com/mcp/control-mcp-use-iam)). Grant the MCP Tool User role. An allow policy condition on `resource.service` limits the grant to the Pub/Sub MCP server:

   ```bash
   gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="user:TEAMMATE_EMAIL" \
     --role=roles/mcp.toolUser \
     --condition="expression=resource.service == 'pubsub.googleapis.com',title=Pub/Sub MCP tools only"
   ```

   The opposite also fails: `mcp.tools.call` without `pubsub.topics.list`.

   </details>

2. You want an agent to read Pub/Sub resources through MCP, but never delete them. What can you do?

   <details><summary>Answer</summary>

   - Give the identity of the agent only read permissions for Pub/Sub, for example the Pub/Sub Viewer role.
   - Add an IAM deny policy that denies `mcp.googleapis.com/tools.call` with the condition `api.getAttribute('mcp.googleapis.com/tool.isReadOnly', false) == false`. Calls to tools that are not read-only then fail. `tools/list` still returns all tools ([Control MCP use with Identity and Access Management](https://docs.cloud.google.com/mcp/control-mcp-use-iam)).
   - In agent mode, keep the permission prompts, and do not turn on yolo mode. A prompt depends on the person who answers it. IAM applies to every call.

   </details>

3. Why did the lab put the emulator rules in `GEMINI.md`, and not in the prompt?

   <details><summary>Answer</summary>

   Agent mode includes the context file with every prompt, so the rules apply to each request without a change to the prompt. The file is in `pcd/labs/42-emulators/app`, so it applies only to that part of the project. A file in `~/.gemini/GEMINI.md` applies to all your projects ([Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)). A rule does not make the output correct. That is why step 8 also runs the tests without the emulator variables.

   </details>

4. What does an administrator set up so that a developer can use Gemini Code Assist Standard?

   <details><summary>Answer</summary>

   1. Get a subscription. Since September 4, 2026, a billing account without one must contact Google Cloud sales.
   2. Assign licenses. With automatic assignment, a user gets a license at first use. The selected project must be linked to the billing account of the subscription, and the user must have `cloudaicompanion.licenses.selfAssign`. A license that is inactive for 30 days goes to another user.
   3. In the Gemini Code Assist project, enable the API, and grant two roles to the developer:

      ```bash
      gcloud services enable cloudaicompanion.googleapis.com
      gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="user:DEVELOPER_EMAIL" \
        --role=roles/cloudaicompanion.user
      gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="user:DEVELOPER_EMAIL" \
        --role=roles/serviceusage.serviceUsageConsumer
      ```

   4. The developer installs the extension, signs in, and selects the project.

   Sources: [Set up Gemini Code Assist Standard and Enterprise](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini), [Gemini Code Assist release notes](https://docs.cloud.google.com/gemini/docs/codeassist/release-notes).

   </details>

## Clean up

The lab created no Google Cloud resources, so it has no `teardown.sh`. Remove the local changes:

```bash
python3 pcd/labs/43-ide-ai-tooling/mcp_settings.py remove
rm -f pcd/labs/42-emulators/app/GEMINI.md pcd/labs/42-emulators/app/test_orders_ai.py
```

- The script removes only the `lab43-pubsub` entry from `~/.gemini/settings.json`. In VS Code, run **Developer: Reload Window**.
- If you did step 8, press Ctrl+C in terminals 1 and 2 to stop the emulators.
- The APIs stay enabled. Other labs use Pub/Sub and Gemini Cloud Assist.
- The Cloud Code sign-in updated your ADC file. If you used ADC with another account before this lab, run the ADC step of [the setup lab](lab:00-setup) again.

## Docs used

- [Install the Cloud Code for VS Code extension](https://docs.cloud.google.com/code/docs/vscode/install)
- [Cloud Code overview](https://docs.cloud.google.com/code/docs/vscode/overview)
- [Set up Gemini Code Assist Standard and Enterprise](https://docs.cloud.google.com/gemini/docs/codeassist/set-up-gemini)
- [Gemini for Google Cloud pricing](https://cloud.google.com/products/gemini/pricing)
- [Gemini Code Assist release notes](https://docs.cloud.google.com/gemini/docs/codeassist/release-notes)
- [Gemini Code Assist consumer accounts](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
- [Gemini CLI](https://docs.cloud.google.com/gemini/docs/codeassist/gemini-cli)
- [Agent mode overview](https://docs.cloud.google.com/gemini/docs/codeassist/agent-mode)
- [Use the Gemini Code Assist agent mode](https://docs.cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer)
- [How Gemini products in Google Cloud use your data](https://docs.cloud.google.com/gemini/docs/discover/data-governance)
- [Use the Pub/Sub remote MCP server to manage Pub/Sub resources and publish messages](https://docs.cloud.google.com/pubsub/docs/use-pubsub-mcp)
- [MCP Reference: pubsub.googleapis.com](https://docs.cloud.google.com/pubsub/docs/reference/mcp)
- [Manage MCP servers](https://docs.cloud.google.com/mcp/manage-mcp-servers)
- [Configure MCP in an AI application](https://docs.cloud.google.com/mcp/configure-mcp-ai-application)
- [Control MCP use with Identity and Access Management](https://docs.cloud.google.com/mcp/control-mcp-use-iam)
- [Google Cloud MCP servers roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/mcp)
- [Gemini Cloud Assist roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/geminicloudassist)
- [Pub/Sub roles and permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/pubsub)
- [Set up Gemini Cloud Assist](https://docs.cloud.google.com/cloud-assist/set-up-gemini)
- [Use Gemini Cloud Assist in the Google Cloud console](https://docs.cloud.google.com/cloud-assist/chat-panel)
- [Set the quota project](https://docs.cloud.google.com/docs/quotas/set-quota-project)
- [Set up ADC for a local development environment](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
- [Pub/Sub pricing](https://cloud.google.com/pubsub/pricing)
