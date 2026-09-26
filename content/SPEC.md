# Content spec

This file defines the format and quality rules for all study content in this repo. Every author (human or agent) follows it. The study app (`app/`) reads these files.

## 1. Reader

The reader holds the Google Cloud Professional Cloud Developer certification. The reader has about 10 years of development and cloud experience and knows AWS well. The reader prefers reading and hands-on work to video.

Consequences:

- Skip beginner material (what a VM is, what IAM is). Start at the architect level.
- Focus on decisions: which service, which configuration, which trade-off, and why.
- Give AWS equivalents where they help. Point out where an AWS habit gives the wrong answer on Google Cloud.
- The exam asks for the *Google-recommended* answer. Teach the recommended pattern, not every possible pattern.

## 2. Grounding rules (mandatory)

1. **Every fact comes from official Google Cloud documentation.** Allowed sources: `docs.cloud.google.com/**` (product docs and the Architecture Center), `cloud.google.com/**` (product pages, pricing pages, blog posts from Google), `support.google.com/cloud*`, `services.google.com/fh/files/misc/*` (exam guide and case studies), and `sre.google` (Google SRE books). Do not use third-party blogs, forums, or course material as a source.
2. **Read the page before you cite it.** Use `python3 tools/fetch_doc.py URL` (add `--outline` to see headings, `--grep 'regex'` to find a passage, `--links` to find related pages). The tool prints the final URL. Cite that final URL (`https://docs.cloud.google.com/...`).
3. **Do not cite from memory.** Product behavior, limits, SLAs, and names change. If you cannot find a statement in a fetched page, do not write it.
4. **Use the product names in the exam guide v6.1** and current docs. Put a former name in parentheses the first time it appears, because older exam questions and blog posts use it. Examples: Gemini Enterprise Agent Platform or Agent Platform (formerly Vertex AI); Cloud Run functions (formerly Cloud Functions); Chrome Enterprise Premium (formerly BeyondCorp Enterprise); Google Cloud Observability (formerly Cloud operations suite / Stackdriver); Sensitive Data Protection (includes Cloud DLP). See `content/reference/ai-name-changes.md` for all AI product renames, and `content/reference/other-name-changes.md` for data, storage, and other renames.
5. **Mark preview features.** If a docs page labels a feature Preview, say "(Preview)". Prefer GA features in recommendations.
6. **No invented numbers.** Prices, limits, SLAs, and quotas must come from a fetched page. Prefer relative statements ("Spot VMs cost less than standard VMs") over exact prices, which change often.

## 3. Writing style

Use Simplified Technical English (ASD-STE100) rules:

- Short sentences: 20 words or fewer for an instruction, 25 or fewer for a description.
- One idea per sentence. Active voice. Simple present tense.
- Everyday words. No slang, metaphor, or marketing language ("seamless", "robust", "leverage", "unlock").
- The same word for the same thing every time.
- Noun groups of three words or fewer, except product and feature names.
- Start each paragraph with its main point.
- Use tables for comparisons and decision criteria. Use numbered lists for steps.

Product names, API names, commands, and config keys are exceptions: use their exact names.

## 4. Study notes (`content/notes/<id>.md`)

One file per topic page. Each page belongs to one primary exam objective. An objective can have several pages.

### Frontmatter

```yaml
---
id: 2.1-hybrid-multicloud            # file name without .md; starts with the primary objective
title: Hybrid and multicloud connectivity
objective: "2.1"                     # primary objective (from content/exam.json)
also: ["1.3"]                        # other objectives this page supports (can be empty)
order: 1                             # reading order inside the objective
minutes: 25                          # estimated reading time
labs: ["12-ha-vpn-hybrid"]           # related lab IDs (can be empty)
verified: 2026-09-24                 # date you checked the sources
---
```

### Body structure (use these H2 headings, in this order)

1. `## Why it matters` — 2 to 4 sentences. What decision does an architect make here? What does the exam test?
2. `## Key points` — 6 to 12 bullets. The facts you must know. Each bullet ends with a citation link.
3. Topic sections — as many `##` sections as the topic needs. Use decision tables ("Use X when…", "Do not use X when…"). Compare options side by side.
4. `## AWS mapping` — table: `| AWS | Google Cloud | Difference that matters |`. Skip it only if no mapping helps.
5. `## Exam traps` — bullets. Common wrong answers and how to spot them. Each trap needs a source.
6. `## Read in the docs` — numbered list, most important first: `[Page title](url) — why to read it (about N min)`. 4 to 10 pages.
7. `## Hands-on` — links to labs: `[Lab title](lab:12-ha-vpn-hybrid)`. Omit if no lab applies.

### Citations

- Cite inline at the end of the sentence or bullet: `… 99.99% availability SLA ([HA VPN topologies](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies)).`
- For a table, put one line below it: `Sources: [Page A](url), [Page B](url).`
- Every `## Key points` bullet, every table, and every exam trap needs a citation.

### Internal links

- To another notes page: `[text](note:2.1-network-security)`
- To a lab: `[text](lab:12-ha-vpn-hybrid)`
- To a case study: `[text](case:ehr)`

### Length

1,200 to 3,000 words per page, not counting the inline citations (the linked source titles in parentheses). Prefer depth on decisions and trade-offs over breadth of definitions.

## 5. Questions (`content/questions/<domain>.json`)

Each file is a JSON array of question objects. Question IDs use the file's prefix and a 3-digit number: `net-001`, `net-002`, …

### Schema

```json
{
  "id": "net-007",
  "objective": "2.1",
  "caseStudy": null,
  "type": "single",
  "difficulty": 2,
  "tags": ["ha-vpn", "cloud-router"],
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
      "title": "HA VPN topologies",
      "url": "https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies",
      "evidence": "A verbatim quote (8-40 words) from this page that supports the correct answer."
    }
  ]
}
```

Field rules:

- `objective`: one ID from `content/exam.json` (`"1.1"` … `"6.6"`).
- `caseStudy`: `null`, or one of `"altostrat"`, `"cymbal"`, `"ehr"`, `"knightmotives"`.
- `type`: `"single"` (4 options, 1 answer) or `"multi"` (5 or 6 options, 2 or 3 answers). A `multi` stem ends with `(Choose two.)` or `(Choose three.)`.
- `difficulty`: 1 = recall a key fact in context. 2 = apply one constraint to a scenario. 3 = weigh several constraints; distractors are close.
- `whyWrong`: one entry for every option that is not in `answer`.
- `sources`: 1 to 3 entries. **At least one `evidence` must be a verbatim quote from the page text** as `tools/fetch_doc.py` prints it. Quote from one paragraph, list item, or table cell. The checker ignores case, whitespace, backticks, and quote style, but nothing else.

### Question style (match the real exam)

- Write a scenario, not a definition question. Give the company context and the constraint: cost, operational overhead, latency, compliance, time, skills, or existing systems.
- Typical question endings: "What should you do?", "Which approach should you recommend?", "What should you do first?"
- Use exam qualifiers precisely: "most cost-effective", "least operational overhead", "Google-recommended", "minimize downtime", "without code changes". The qualifier must decide the answer.
- All options must be plausible, similar in length, and parallel in form. Good distractors are: a real product used for the wrong job; the right product with a wrong configuration; an approach that works but breaks a stated constraint; an older or deprecated approach; an over-engineered approach.
- Options are shuffled in the app. Never write "Both A and B", "All of the above", or "None of the above". Never refer to another option.
- Exactly one defensible best answer (or exactly the required number for `multi`). If an expert can argue for two options, rewrite the question.
- Do not test prices, exact quota numbers, or console click paths.
- Mix: about 20% difficulty 1, 50% difficulty 2, 30% difficulty 3. About 15-20% `multi`.
- Spread the correct answer across A-D (the app shuffles, but keep the source files balanced).

### Validate before you finish

```bash
python3 tools/check_questions.py content/questions/<domain>.json
```

Fix every error. The check fetches each source (cached) and confirms the evidence quote.

## 6. Labs (`labs/<NN>-<slug>/`)

A lab is hands-on practice in the reader's own sandbox project. Each lab folder has:

- `README.md` (required)
- `teardown.sh` (required when the lab creates billable resources)
- optional Terraform files or small scripts

### README frontmatter

```yaml
---
id: 12-ha-vpn-hybrid
title: Simulate hybrid connectivity with HA VPN and Cloud Router
objectives: ["2.1", "1.3"]
minutes: 60
cost: "About $0.20 per hour while the tunnels run. Run teardown.sh when done."
requiresOrg: false
---
```

### README structure (H2 headings, in this order)

1. `## Goal` — one or two sentences.
2. `## Exam relevance` — which exam decisions this lab makes real, with links to notes pages (`note:` links).
3. `## Before you start` — APIs to enable (with the command), IAM needs, tools, and time.
4. `## Steps` — numbered steps. Each step: one sentence on *why*, then a fenced `bash` block.
5. `## Check your work` — commands and the output to expect.
6. `## Explore` — 2 to 4 architect questions. Put the answer in `<details><summary>Answer</summary> … </details>`.
7. `## Clean up` — `bash labs/<NN>-<slug>/teardown.sh`, plus a list of what it deletes.
8. `## Docs used` — links to the pages you used.

### Safety rules (mandatory)

- The first command in every lab is `source labs/env.sh` (run from the repo root). It scopes gcloud to the dedicated lab project (ID starts with `pca-lab-`). Never hard-code a project ID. Use `$PROJECT_ID`, `$PROJECT_NUMBER`, `$REGION`, `$ZONE`.
- Prefix every resource name with `lab<NN>-` (for example `lab12-vpc`) so teardown is easy and nothing collides.
- Never create service account keys. Use service account impersonation or Application Default Credentials.
- Never open SSH (22) or RDP (3389) to `0.0.0.0/0`. Use IAP TCP forwarding (source range `35.235.240.0/20`).
- Never lock a retention policy, never destroy KMS key versions except as a clearly marked optional step, and never change organization-level settings.
- Use the smallest machine types and shortest run times that still teach the point. State the cost from Google's pricing pages.
- `teardown.sh` must be idempotent: start with `set -uo pipefail`, `cd "$(dirname "$0")/../.."`, `source labs/env.sh || exit 1`; delete in dependency order; add `--quiet`; end each delete with `|| true`.
- `requiresOrg: true` when the lab needs an Organization resource (Shared VPC, folders, hierarchical firewall policies, VPC Service Controls, Access Context Manager, organization-level policy). **The reader's account has no organization.** For these labs, add a `## No organization?` section: what the reader can still do at project level, and how to get an organization (cite the Cloud Identity docs).

### Command rules

- Use current GA `gcloud` syntax. Use `gcloud storage` for Cloud Storage (mention `gsutil` only as the legacy tool). Use `beta`/`alpha` only when no GA command exists, and say so.
- Validate every lab:

```bash
python3 tools/check_labs.py labs/<NN>-<slug>
```

The checker confirms that each gcloud command exists and that each flag appears in `gcloud <command> --help` (local SDK 576.0.0). Fix every problem. For Terraform, run `terraform fmt -check` and `terraform init -backend=false && terraform validate` in the lab folder, then delete `.terraform/` and `.terraform.lock.hcl`.
- **Do not run any command that creates, changes, or deletes cloud resources.** Only run `--help`, `terraform validate`, and docs fetches. The reader runs the labs.

## 7. Case studies (`content/case-studies/`)

For each case study `<id>` (`altostrat`, `cymbal`, `ehr`, `knightmotives`):

- `<id>.md` — the official case study text, transcribed faithfully from the PDF in `sources/`. Frontmatter: `id`, `name`, `pdf` (official URL). Keep the original headings and bullet lists. Do not add commentary. The app shows this text next to case-study questions, as the exam does.
- `<id>.analysis.md` — the analysis. Frontmatter: `id: <id>-analysis`, `caseStudy: <id>`, `minutes`. Sections: `## Summary`, `## Requirements map` (table: requirement → Google Cloud solution → why → source), `## Key design decisions`, `## Likely exam angles`, `## Read in the docs`.

## 8. Flashcards (`content/flashcards/<domain>.json`)

Flashcards drill the concepts and terms of the notes pages. Each card comes from one notes page, and the facts on it come from that page. Each file is a JSON array of card objects for one author domain (the owners in `content/PLAN.md`). Card IDs use the domain, `f`, and a 3-digit number: `net-f001`, `net-f002`, …

### Schema

```json
{
  "id": "net-f007",
  "note": "2.1-hybrid-multicloud",
  "kind": "concept",
  "front": "What does HA VPN need to get the 99.99% availability SLA?",
  "back": "A tunnel on each of the two interfaces of the HA VPN gateway. A gateway with only one active interface has no SLA.",
  "aws": null,
  "source": {
    "title": "HA VPN topologies",
    "url": "https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/topologies",
    "evidence": "A verbatim quote (8-40 words) from this page that supports the back of the card."
  }
}
```

Field rules:

- `note`: the ID of the notes page that teaches the fact. The app shows the card with that page's primary objective, and links to the page.
- `kind`: `"term"` or `"concept"`.
  - `term`: `front` is the exact name of a product, feature, or term, as the notes page writes it (8 words or fewer, no question mark). `back` says what it is and when an architect uses it.
  - `concept`: `front` is one question of 20 words or fewer that ends with `?`. The question has one clear answer: a decision rule, a requirement, a limit, a difference, or a cause. `back` gives that answer.
- `back`: 1 to 3 sentences, 60 words or fewer. Inline Markdown only (code and bold). No links: the app shows the source below the answer.
- `aws`: optional. For a `term` card, the AWS equivalent from the page's `## AWS mapping` table (12 words or fewer). Otherwise `null` or omit it.
- `source`: one page that the notes page cites for this fact. The `url` must appear in the notes page. `evidence` is a verbatim quote of 8 to 40 words from that page, as `tools/fetch_doc.py` prints it, that supports the back. The same matching rules as for questions apply (section 5).

### Card style

- Test one fact per card. Split a card that needs "and" to join two unrelated facts.
- Pick the facts that decide exam answers: the Google-recommended choice, the qualifier that changes it, the SLA topology, the limit, the former product name, the difference from AWS. Skip trivia that the exam does not test (prices, exact quotas, console click paths).
- The front must not give away the back. A `concept` front does not name the answer.
- Use the product names of the exam guide v6.1. Put a former name in parentheses on the back when older questions use it.
- Write about 8 to 12 cards for each notes page: about half `term` cards and half `concept` cards.
- Do not write two cards with the same front. A term belongs to the domain whose notes page teaches it as a main topic.
- Keep cards in reading order: by notes page (the order in `content/PLAN.md`), then in the order that the page teaches them.

### Validate before you finish

```bash
python3 tools/check_flashcards.py content/flashcards/<domain>.json
```

Fix every error. The check confirms the schema, the note, that the note cites the source, and the evidence quote (from the docs cache).

## 9. Glossary (`content/glossary.json`)

The glossary is a JSON array of terms. The build marks each term in the notes, questions, labs, case studies, and exam guide text. The app shows the definition in a box when the reader points at a marked term (or taps it). The **Glossary** page lists all terms.

```json
{
  "term": "CMEK",
  "expansion": "Customer-managed encryption keys",
  "def": "Encryption keys that you create and control in Cloud KMS. Supported Google Cloud services use them to protect your data at rest.",
  "aws": "AWS KMS customer managed keys",
  "match": ["CMEK", "customer-managed encryption keys"],
  "note": "3.1-data-protection-kms"
}
```

Field rules:

- `term`: the display name, as the notes write it.
- `expansion`: the spelled-out form of an acronym. Omit it for product names.
- `def`: 1 or 2 sentences, 45 words or fewer, plain text. Say what the term is and the one fact an architect must remember. Do not start with the term.
- `aws`: the AWS equivalent, only when the notes name one. Omit it for concepts.
- `match`: the strings that the build marks. Matching is case-sensitive and whole-word. An ALL-CAPS string also matches with a plural "s". A lowercase string also matches with a capital first letter. Add former product names that the content uses. Do not add generic English words.
- `note`: the ID of the notes page that explains the term. That page must contain the term or a `match` string.

Grounding: every fact in `def` and `aws` comes from the linked notes page, which carries the citations. Skip basic terms (API, VM, VPC, DNS, TLS, and similar).

The build marks only the first use of a term in each section of a page. It skips links, code, headings, AWS product names, and the front of flashcards. `node app/build.mjs` reports a missing note, a note that does not mention the term, a string that two terms claim, and a term that no page uses.

## 10. Definition of done (per author)

- [ ] Every notes page has valid frontmatter and the required sections.
- [ ] Every fact has a citation to a page you fetched.
- [ ] `python3 tools/check_questions.py content/questions/<domain>.json` reports 0 errors.
- [ ] `python3 tools/check_flashcards.py content/flashcards/<domain>.json` reports 0 errors.
- [ ] `python3 tools/check_labs.py labs/<NN>-<slug>` reports 0 problems for each of your labs.
- [ ] No resources were created in any cloud project.
