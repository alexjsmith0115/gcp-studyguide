# Content spec: Professional Cloud Developer guide

This file defines the format and quality rules for all study content in `pcd/`. Every author (human or agent) follows it. The study app (`app/`) reads these files with `node app/build.mjs --guide pcd`. The PCA guide in `content/` has its own spec (`content/SPEC.md`). Do not edit PCA files.

All paths in this file are relative to the repository root.

## 1. Reader

The reader is an experienced developer. The reader has about 10 years of development and cloud experience and knows AWS well. The reader prefers reading and hands-on work to video.

Consequences:

- Skip beginner material (what a container is, what HTTP is, what IAM is). Start at the professional developer level.
- Focus on the decisions a developer makes: which service, which API, which configuration, which client library pattern, and why.
- Give AWS equivalents where they help. Point out where an AWS habit gives the wrong answer on Google Cloud.
- The exam asks for the *Google-recommended* answer. Teach the recommended pattern, not every possible pattern.

## 2. Grounding rules (mandatory)

1. **Every fact comes from official documentation.** Allowed sources:
   - `docs.cloud.google.com/**` (product docs and the Architecture Center), `cloud.google.com/**` (product pages, pricing pages, blog posts from Google), `support.google.com/cloud*`, `services.google.com/fh/files/misc/*` (exam guide), and `sre.google` (Google SRE books).
   - `developers.google.com/**` (Google developer docs, for example OAuth 2.0, API Explorer, and Gemini Code Assist), `google.aip.dev/**` (Google's API design guidance, the AIPs; `cloud.google.com/apis/design` redirects there), and `firebase.google.com/docs/**` (Firestore and Firebase Authentication, which Identity Platform builds on).
   - `googleapis.github.io/python-genai/**` (the Google Gen AI SDK reference, which the Agent Platform docs link to), only for SDK behavior that the Google Cloud docs do not state.
   - `googleapis.dev/python/**` (the Python reference for `google-api-core` and `google-auth`, which the Google Cloud docs link to), only for library behavior that the Google Cloud docs do not state.
   - `kubernetes.io/docs/**`, only for core Kubernetes behavior (probes, the Horizontal Pod Autoscaler algorithm, Deployment fields) that the GKE docs do not explain. Prefer a GKE page when one covers the fact.

   Do not use third-party blogs, forums, Stack Overflow, GitHub READMEs, or course material as a source.
2. **Read the page before you cite it.** Use `python3 tools/fetch_doc.py URL` (add `--outline` to see headings, `--grep 'regex'` to find a passage, `--links` to find related pages). The tool prints the final URL. Cite that final URL (`https://docs.cloud.google.com/...`). If a page redirects, cite the page it redirects to.
3. **Do not cite from memory.** Product behavior, limits, defaults, and names change. If you cannot find a statement in a fetched page, do not write it.
4. **Use the product names in the PCD exam guide** (`pcd/content/exam.json`) and current docs. When the exam guide and the docs use different names, use the docs name and give the exam guide name the first time, for example "API Gateway (the exam guide says Cloud API Gateway)". Put a former name in parentheses the first time it appears, because older exam questions and blog posts use it. Examples: Cloud Run functions (formerly Cloud Functions); Artifact Analysis (formerly Container Analysis); Cloud Service Mesh (formerly Anthos Service Mesh and Traffic Director); Gemini Enterprise Agent Platform, or Agent Platform (formerly Vertex AI); Google Cloud Observability (formerly Stackdriver). `pcd/content/reference/name-changes.md` lists the renames that matter for this guide. When you find a rename in the docs that is not in that page, say so in your final report.
5. **Mark preview features.** If a docs page labels a feature Preview, say "(Preview)". Prefer GA features in recommendations.
6. **No invented numbers.** Prices, limits, defaults, SLAs, and quotas must come from a fetched page. Prefer relative statements ("Spot VMs cost less than standard VMs") over exact prices, which change often.
7. **Code comes from the docs.** A code sample in the notes or a lab follows a docs sample or a documented API. Cite the page above or below the code block. Prefer Python for code, unless the docs sample for the feature is only in another language. Keep code samples short (about 30 lines or fewer) and show only the pattern the exam tests.

## 3. Writing style

Use Simplified Technical English (ASD-STE100) rules:

- Short sentences: 20 words or fewer for an instruction, 25 or fewer for a description.
- One idea per sentence. Active voice. Simple present tense.
- Everyday words. No slang, metaphor, or marketing language ("seamless", "robust", "leverage", "unlock").
- The same word for the same thing every time.
- Noun groups of three words or fewer, except product and feature names.
- Start each paragraph with its main point.
- Use tables for comparisons and decision criteria. Use numbered lists for steps.

Product names, API names, commands, code, and config keys are exceptions: use their exact names.

## 4. Study notes (`pcd/content/notes/<id>.md`)

One file per topic page. Each page belongs to one primary exam objective. An objective can have several pages. `pcd/content/PLAN.md` lists every page, its owner, and the exam guide considerations it covers. Cover every consideration that the plan gives the page.

### Frontmatter

```yaml
---
id: 3.1-triggers-and-receivers       # file name without .md; starts with the primary objective
title: Triggering Cloud Run with Eventarc and Pub/Sub, and writing event receivers
objective: "3.1"                     # primary objective (from pcd/content/exam.json)
also: ["1.1", "4.1"]                 # other objectives this page supports (can be empty)
order: 2                             # reading order inside the objective (from the plan)
minutes: 25                          # estimated reading time
labs: ["20-eventarc-storage-events"] # related lab IDs from the plan (can be empty)
verified: 2026-09-30                 # date you checked the sources
---
```

### Body structure (use these H2 headings, in this order)

1. `## Why it matters` — 2 to 4 sentences. What decision does a developer make here? What does the exam test?
2. `## Key points` — 6 to 12 bullets. The facts you must know. Each bullet ends with a citation link.
3. Topic sections — as many `##` sections as the topic needs. Use decision tables ("Use X when…", "Do not use X when…"). Compare options side by side. Show a short code sample where the exam tests a code pattern (rule 2.7).
4. `## AWS mapping` — table: `| AWS | Google Cloud | Difference that matters |`. Skip it only if no mapping helps.
5. `## Exam traps` — bullets. Common wrong answers and how to spot them. Each trap needs a source.
6. `## Read in the docs` — numbered list, most important first: `[Page title](url) — why to read it (about N min)`. 4 to 10 pages.
7. `## Hands-on` — links to labs: `[Lab title](lab:20-eventarc-storage-events)`. Omit if no lab applies.

### Citations

- Cite inline at the end of the sentence or bullet: `… delivers events in the CloudEvents format ([Eventarc overview](https://docs.cloud.google.com/eventarc/docs/overview)).`
- For a table, put one line below it: `Sources: [Page A](url), [Page B](url).`
- For a code block, put one line above or below it: `Source: [Page](url).`
- Every `## Key points` bullet, every table, every code block, and every exam trap needs a citation.

### Internal links

- To another notes page: `[text](note:1.2-secrets-and-keys)`
- To a lab: `[text](lab:30-secrets-and-kms)`

Use only the IDs in `pcd/content/PLAN.md`. The build fails on a link to an ID that does not exist. There are no case studies in this guide.

### Length

1,200 to 3,000 words per page, not counting the inline citations (the linked source titles in parentheses) and code. Prefer depth on decisions, trade-offs, and code patterns over breadth of definitions.

## 5. Questions (`pcd/content/questions/<domain>.json`)

Each file is a JSON array of question objects. Question IDs use the file's prefix and a 3-digit number: `evt-001`, `evt-002`, …

### Schema

```json
{
  "id": "evt-007",
  "objective": "3.1",
  "caseStudy": null,
  "type": "single",
  "difficulty": 2,
  "tags": ["pubsub-push", "oidc"],
  "stem": "Markdown. A scenario of 2-6 sentences, then the question.",
  "options": [
    {"id": "A", "text": "Markdown. One option."},
    {"id": "B", "text": "..."},
    {"id": "C", "text": "..."},
    {"id": "D", "text": "..."}
  ],
  "answer": ["B"],
  "explanation": "Markdown. Why the answer is correct. Name the requirement in the stem that decides it.",
  "whyWrong": {"A": "Why A is wrong.", "C": "...", "D": "..."},
  "sources": [
    {
      "title": "Authentication for push subscriptions",
      "url": "https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions",
      "evidence": "A verbatim quote (8-40 words) from this page that supports the correct answer."
    }
  ]
}
```

Field rules:

- `objective`: one ID from `pcd/content/exam.json` (`"1.1"` … `"4.3"`).
- `caseStudy`: always `null`. This exam has no case studies.
- `type`: `"single"` (4 options, 1 answer) or `"multi"` (5 or 6 options, 2 or 3 answers). A `multi` stem ends with `(Choose two.)` or `(Choose three.)`.
- `difficulty`: 1 = recall a key fact in context. 2 = apply one constraint to a scenario. 3 = weigh several constraints; distractors are close.
- `whyWrong`: one entry for every option that is not in `answer`.
- `sources`: 1 to 3 entries. **At least one `evidence` must be a verbatim quote from the page text** as `tools/fetch_doc.py` prints it. Quote from one paragraph, list item, or table cell. The checker ignores case, whitespace, backticks, and quote style, but nothing else.

### Question style (match the real exam)

- Write a scenario, not a definition question. Give the team and application context and the constraint: latency, cost, operational overhead, security, time, skills, existing code, or a stated error.
- Developer scenarios are welcome: a short code snippet, a config excerpt (YAML, `cloudbuild.yaml`, a Kubernetes manifest), a `gcloud` command, a log line, or an error message in the stem. Keep it under 15 lines and put it in a fenced code block.
- Typical question endings: "What should you do?", "What should you do first?", "Which approach should you take?", "How should you change the code?"
- Use exam qualifiers precisely: "most cost-effective", "least operational overhead", "Google-recommended", "minimize latency", "without code changes". The qualifier must decide the answer.
- All options must be plausible, similar in length, and parallel in form. Good distractors are: a real product used for the wrong job; the right product with a wrong configuration; an approach that works but breaks a stated constraint; an older or deprecated approach (for example a service account key, Container Registry, or a Serverless VPC Access connector where Direct VPC egress fits); an over-engineered approach.
- Options are shuffled in the app. Never write "Both A and B", "All of the above", or "None of the above". Never refer to another option.
- Exactly one defensible best answer (or exactly the required number for `multi`). If an expert can argue for two options, rewrite the question.
- Do not test prices, exact quota numbers, or console click paths.
- Mix: about 20% difficulty 1, 50% difficulty 2, 30% difficulty 3. About 15-20% `multi`.
- Spread the correct answer across A-D (the app shuffles, but keep the source files balanced).
- Each question tests something that a notes page teaches. If no notes page covers the fact, tell the lead in your report instead of writing the question.

### Validate before you finish

```bash
python3 tools/check_questions.py pcd/content/questions/<domain>.json
```

Fix every error. The check fetches each source (cached) and confirms the evidence quote.

## 6. Labs (`pcd/labs/<NN>-<slug>/`)

A lab is hands-on practice in the reader's own sandbox project. Each lab folder has:

- `README.md` (required)
- `teardown.sh` (required when the lab creates billable resources)
- optional source code (a small app, a `cloudbuild.yaml`, Kubernetes manifests, a workflow definition) or Terraform files

### README frontmatter

```yaml
---
id: 20-eventarc-storage-events
title: Event-driven Cloud Run with Eventarc and Cloud Storage events
objectives: ["3.1", "1.1"]
minutes: 45
cost: "Less than $0.10 if you run teardown.sh when done. Cloud Run and Eventarc have free tiers."
requiresOrg: false
---
```

### README structure (H2 headings, in this order)

1. `## Goal` — one or two sentences.
2. `## Exam relevance` — which exam decisions this lab makes real, with links to notes pages (`note:` links).
3. `## Before you start` — APIs to enable (with the command), IAM needs, tools, and time.
4. `## Steps` — numbered steps. Each step: one sentence on *why*, then a fenced `bash` block.
5. `## Check your work` — commands and the output to expect.
6. `## Explore` — 2 to 4 developer questions. Put the answer in `<details><summary>Answer</summary> … </details>`.
7. `## Clean up` — `bash pcd/labs/<NN>-<slug>/teardown.sh`, plus a list of what it deletes.
8. `## Docs used` — links to the pages you used.

### Safety rules (mandatory)

- Run every lab command in the repository root. The first command in every lab is `source pcd/labs/env.sh`. It scopes gcloud to the dedicated PCD lab project (ID starts with `pcd-lab-`). Never hard-code a project ID. Use `$PROJECT_ID`, `$PROJECT_NUMBER`, `$REGION`, `$ZONE`.
- Refer to lab files by their path from the repository root, for example `gcloud run deploy lab20-receiver --source pcd/labs/20-eventarc-storage-events/app`.
- Prefix every resource name with `lab<NN>-` (for example `lab20-receiver`) so teardown is easy and nothing collides.
- Never create service account keys. Use service account impersonation, attached service accounts, or Application Default Credentials.
- Never open SSH (22) or RDP (3389) to `0.0.0.0/0`. Use IAP TCP forwarding (source range `35.235.240.0/20`).
- Never allow unauthenticated access to a service unless the lab teaches public access, and then remove it in teardown.
- Never lock a retention policy, never destroy KMS key versions except as a clearly marked optional step, and never change organization-level settings.
- Use the smallest machine types and shortest run times that still teach the point. State the cost from Google's pricing pages.
- `teardown.sh` must be idempotent: start with `set -uo pipefail`, `cd "$(dirname "$0")/../../.."`, `source pcd/labs/env.sh || exit 1`; delete in dependency order; add `--quiet`; end each delete with `|| true`.
- `requiresOrg: true` when the lab needs an Organization resource (folders, organization policy at org level, VPC Service Controls, Access Context Manager). **The reader's account has no organization.** For these labs, add a `## No organization?` section: what the reader can still do at project level, and how to get an organization (cite the Cloud Identity docs).

### Command and code rules

- Use current GA `gcloud` syntax. Use `gcloud storage` for Cloud Storage (mention `gsutil` only as the legacy tool). Use `beta`/`alpha` only when no GA command exists, and say so.
- Lab code uses the Cloud Client Libraries and Application Default Credentials. Pin library versions in `requirements.txt` (or the language equivalent) only to versions that you see in the docs or the package index page that the docs link.
- Validate every lab:

```bash
python3 tools/check_labs.py pcd/labs/<NN>-<slug>
bash -n pcd/labs/<NN>-<slug>/teardown.sh
python3 -m py_compile pcd/labs/<NN>-<slug>/app/*.py    # for Python files
```

The lab checker confirms that each gcloud command exists and that each flag appears in `gcloud <command> --help` (local SDK 576.0.0). Fix every problem. For Terraform, run `terraform fmt -check` and `terraform init -backend=false && terraform validate` in the lab folder, then delete `.terraform/` and `.terraform.lock.hcl`.
- **Do not run any command that creates, changes, or deletes cloud resources.** Only run `--help`, local syntax checks, `terraform validate`, and docs fetches. Do not install packages globally. The reader runs the labs.

## 7. Flashcards (`pcd/content/flashcards/<domain>.json`)

Flashcards drill the concepts and terms of the notes pages. Each card comes from one notes page, and the facts on it come from that page. Each file is a JSON array of card objects for one owner domain (the owners in `pcd/content/PLAN.md`). Card IDs use the domain, `f`, and a 3-digit number: `evt-f001`, `evt-f002`, …

### Schema

```json
{
  "id": "evt-f007",
  "note": "3.1-triggers-and-receivers",
  "kind": "concept",
  "front": "How does a Pub/Sub push subscription prove its identity to a Cloud Run service?",
  "back": "It adds an OIDC token for the subscription's service account to each request. That service account needs the Cloud Run Invoker role on the service.",
  "aws": null,
  "source": {
    "title": "Authentication for push subscriptions",
    "url": "https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions",
    "evidence": "A verbatim quote (8-40 words) from this page that supports the back of the card."
  }
}
```

Field rules:

- `note`: the ID of the notes page that teaches the fact. The app shows the card with that page's primary objective, and links to the page.
- `kind`: `"term"` or `"concept"`.
  - `term`: `front` is the exact name of a product, feature, API, or term, as the notes page writes it (8 words or fewer, no question mark). `back` says what it is and when a developer uses it.
  - `concept`: `front` is one question of 20 words or fewer that ends with `?`. The question has one clear answer: a decision rule, a requirement, a limit, a default, a difference, or a cause. `back` gives that answer.
- `back`: 1 to 3 sentences, 60 words or fewer. Inline Markdown only (code and bold). No links: the app shows the source below the answer.
- `aws`: optional. For a `term` card, the AWS equivalent from the page's `## AWS mapping` table (12 words or fewer). Otherwise `null` or omit it.
- `source`: one page that the notes page cites for this fact. The `url` must appear in the notes page. `evidence` is a verbatim quote of 8 to 40 words from that page, as `tools/fetch_doc.py` prints it, that supports the back. The same matching rules as for questions apply (section 5).

### Card style

- Test one fact per card. Split a card that needs "and" to join two unrelated facts.
- Pick the facts that decide exam answers: the Google-recommended choice, the qualifier that changes it, the default value that surprises, the required role, the limit, the former product name, the difference from AWS. Skip trivia that the exam does not test (prices, exact quotas, console click paths).
- The front must not give away the back. A `concept` front does not name the answer.
- Use the product names of the exam guide and current docs (rule 2.4). Put a former name in parentheses on the back when older questions use it.
- Write about 8 to 12 cards for each notes page: about half `term` cards and half `concept` cards.
- Do not write two cards with the same front. A term belongs to the domain whose notes page teaches it as a main topic.
- Keep cards in reading order: by notes page (the order in `pcd/content/PLAN.md`), then in the order that the page teaches them.

### Validate before you finish

```bash
python3 tools/check_flashcards.py pcd/content/flashcards/<domain>.json
```

Fix every error. The check confirms the schema, the note, that the note cites the source, and the evidence quote (from the docs cache).

## 8. Glossary (`pcd/content/glossary.json`)

The glossary is a JSON array of terms. The build marks each term in the notes, questions, labs, and exam guide text. The app shows the definition in a box when the reader points at a marked term (or taps it). The **Glossary** page lists all terms.

```json
{
  "term": "ADC",
  "expansion": "Application Default Credentials",
  "def": "A strategy that the client libraries use to find credentials from the environment. On Google Cloud, it uses the attached service account, so code needs no key file.",
  "aws": "The AWS SDK default credential provider chain",
  "match": ["ADC", "Application Default Credentials"],
  "note": "1.2-authenticating-to-google-cloud"
}
```

Field rules:

- `term`: the display name, as the notes write it.
- `expansion`: the spelled-out form of an acronym. Omit it for product names.
- `def`: 1 or 2 sentences, 45 words or fewer, plain text. Say what the term is and the one fact a developer must remember. Do not start with the term.
- `aws`: the AWS equivalent, only when the notes name one. Omit it for concepts.
- `match`: the strings that the build marks. Matching is case-sensitive and whole-word. An ALL-CAPS string also matches with a plural "s". A lowercase string also matches with a capital first letter. Add former product names that the content uses. Do not add generic English words.
- `note`: the ID of the notes page that explains the term. That page must contain the term or a `match` string.

Grounding: every fact in `def` and `aws` comes from the linked notes page, which carries the citations. Skip basic terms (API, VM, VPC, DNS, TLS, HTTP, JSON, and similar).

The build marks only the first use of a term in each section of a page. It skips links, code, headings, AWS product names, and the front of flashcards. `node app/build.mjs --guide pcd` reports a missing note, a note that does not mention the term, a string that two terms claim, and a term that no page uses.

## 9. Services (`pcd/content/services.json`)

The **Services** tab has one profile for each Google Cloud service that the exam guide or the questions name. The file has two arrays: `categories` and `services`.

```json
{
  "id": "cloud-run",
  "name": "Cloud Run",
  "category": "compute",
  "patterns": ["Cloud Run(?! functions)"],
  "guidePatterns": ["(?i)serverless"],
  "what": "Cloud Run is a serverless platform that runs containers as services, jobs, and worker pools.",
  "cues": ["A stateless containerized API has spiky traffic, and a small team has no Kubernetes skills or need."],
  "traps": ["A service request stops at 60 minutes, so multi-hour work belongs in a Cloud Run job."],
  "confused": [{ "with": "gke", "tell": "Pick GKE when the app needs the Kubernetes API, custom resources, or node-level control." }],
  "aws": "AWS Fargate, AWS App Runner",
  "docs": { "title": "What is Cloud Run", "url": "https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run" },
  "sources": ["1.1-platform-choice", "3.1-deploy-from-source"]
}
```

Field rules:

- `category`: a category `id`. `formerly`: optional, the former product name (for example `Container Analysis`).
- `patterns`: JavaScript regular expressions that find the service in the text that the reader sees. A leading `(?i)` makes a pattern case-insensitive. Add former names. Use a negative lookahead to keep a longer name out (`Cloud Run(?! functions)`).
- `guidePatterns`: optional extra patterns, used only to find the exam guide lines that name the service (objective titles and considerations).
- `what`: 1 or 2 sentences. What the service is and what it is for.
- `cues`: 2 to 4 scenario signals that point to the service, written as the situation.
- `traps`: 0 to 2 common wrong uses or exam traps.
- `confused`: 1 to 3 look-alike services (`with` is a service `id`) and one sentence on how to tell them apart.
- `aws`: the AWS equivalent, only when the glossary or a notes page's AWS mapping names one.
- `docs`: one official docs page that a notes page cites.
- `sources`: the notes pages that the profile restates.
- A category has `intro` (1 or 2 sentences) and `decide`: 3 to 7 rows of `{ "if": scenario signal, "then": [service ids], "why": one sentence }`.

Grounding: a profile restates facts from its `sources` pages and from question explanations. Do not add facts that no notes page or question states. Plain text only, and the writing style rules in section 3 apply.

The build counts, for each service, the questions that name it in a correct option, only in wrong options, or only in the stem or explanation. It also finds the exam guide lines, notes pages, and flashcards that name it. `node app/build.mjs --guide pcd` reports an unknown category, service, or source, and a pattern that does not compile.

## 10. Reference pages (`pcd/content/reference/<id>.md`)

A reference page is a table that the reader looks up, for example product renames. The first `#` heading is the page title. Every row cites an allowed source.

## 11. Definition of done (per author)

- [ ] Every notes page has valid frontmatter and the required sections, and covers its considerations from the plan.
- [ ] Every fact has a citation to a page you fetched.
- [ ] `python3 tools/check_questions.py pcd/content/questions/<domain>.json` reports 0 errors.
- [ ] `python3 tools/check_flashcards.py pcd/content/flashcards/<domain>.json` reports 0 errors.
- [ ] `python3 tools/check_labs.py pcd/labs/<NN>-<slug>` reports 0 problems for each of your labs.
- [ ] `node app/build.mjs --guide pcd` reports no problem in your files.
- [ ] No resources were created in any cloud project.
