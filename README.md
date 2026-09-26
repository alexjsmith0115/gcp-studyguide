# PCA study guide

A study system for the Google Cloud **Professional Cloud Architect** exam (exam guide v6.1). It has five parts:

| Part | Where | What it gives you |
|---|---|---|
| Notes | `content/notes/` | 1–3 pages for each of the 22 exam guide objectives, written for a reader who knows AWS and holds the Professional Cloud Developer certification. Each fact cites the Google Cloud documentation page it comes from. |
| Question bank | `content/questions/` | Exam-style scenario questions. Each answer has an explanation, a reason why each wrong option is wrong, and a verbatim quote from the docs. |
| Flashcards | `content/flashcards/` | Concepts and terms from the notes pages. Each card links its notes page and shows a verbatim quote from the docs. |
| Labs | `labs/` | Hands-on practice in your own sandbox project, with cost notes and a teardown script. |
| Study app | [PCA Workbook](https://claude.ai/artifact/TPcb1cyHLyPXTyEkZbcYqz) | Reader, practice sessions and flashcards with spaced review, timed mock exams, and a readiness dashboard. Built from this repo. |

All content follows `content/SPEC.md`: official Google sources only, every page read before it is cited, and product names from the v6.1 exam guide.

## How to study

1. **Set up.** Open the app, go to **Progress**, and set your exam date. Then do [lab 00-setup](labs/00-setup/README.md) once.
2. **Work through the objectives.** Go to **Study guide**. For each objective:
   1. Read its notes pages. Mark each page as read.
   2. Do its lab if it has one.
   3. Study the flashcards for each page (the **Flashcards** button at the end of the page).
   4. Practice its questions (10 at a time).
   5. Set the objective to **Done** when you can explain the "Exam traps" section without notes.
3. **Review every day.** **Practice → Due for review** brings back questions that you missed or have not seen for a while (spaced review: 1, 3, 7, 16, then 35 days). **Flashcards → Due for review** does the same for the cards. The flashcards do not change the predicted score.
4. **Read the case studies early.** Each exam uses two of the four case studies, and case-study questions are 20–30% of the exam. Read each case study and its analysis, then practice its questions.
5. **Take mock exams.** Start after about a third of the objectives. A mock exam has 50 questions, 2 hours, and two case studies, with no feedback until the end. Take one each week after that.
6. **Book the exam** when the dashboard verdict says **Ready**: predicted score of 80% or more, at least 60% of the bank tried, 90% of objectives done, and a latest mock exam score of 80% or more.

Google does not publish a passing score. The 80% target is this guide's choice, and it is high on purpose.

### How the predicted score works

The score estimates your result on questions you have not seen. It uses only your **first** answer to each question, because a repeat answer tests memory of that question.

- For each exam section, the app takes the share of first answers that you got right. An answer from 21 days ago counts half as much as an answer from today.
- Each section starts at 50% with the weight of 5 answers, so a few lucky answers cannot move it far.
- The overall score weights the sections as the exam guide does: 25%, 17.5%, 17.5%, 15%, 12.5%, 12.5%.
- The ± value is a 95% interval. The app shows a score after 20 first answers.

## Labs

Every lab runs in one dedicated project whose ID starts with `pca-lab-`. [Lab 00-setup](labs/00-setup/README.md) creates it, adds a budget alert, and creates a separate gcloud configuration named `pca-lab`.

- **Start every lab** in a new terminal at the repository root with `source labs/env.sh`. The script selects the `pca-lab` configuration for that terminal only, and it refuses any project whose ID does not start with `pca-lab-`. Your normal gcloud configuration stays unchanged.
- **Finish every lab** with its `teardown.sh`. The scripts are safe to run more than once.
- Labs marked **Needs an organization** use features that need an organization resource (for example Shared VPC or VPC Service Controls). Each one has a "No organization?" section with the parts that you can do in a project.
- A budget alert does not stop spending. Run the teardown scripts.

## Repository layout

| Path | Contents |
|---|---|
| `content/exam.json` | The exam guide v6.1 structure: sections, weights, objectives, and their considerations (verbatim). |
| `content/notes/<id>.md` | Notes pages. The ID starts with the objective, for example `2.1-hybrid-multicloud`. |
| `content/questions/<domain>.json` | The question bank, one file for each author domain. |
| `content/flashcards/<domain>.json` | The flashcards, one file for each author domain. |
| `content/case-studies/` | The four official case studies (verbatim) and an analysis for each. |
| `content/reference/` | Reference tables, for example the AI product name changes. |
| `content/SPEC.md`, `content/PLAN.md` | Authoring rules and the content plan. |
| `labs/` | Labs, `labs/env.sh`, and the teardown scripts. |
| `app/` | The study app: `src/` (UI, storage, scoring logic), `build.mjs`, and tests. |
| `tools/` | The docs fetcher and the content validators. |
| `sources/` | The official exam guide and case study PDFs. |

## Checks and build

```bash
npm install                  # once
npm test                     # scoring and scheduling logic
npm run check:questions      # schema, style rules, and docs quotes for every question
npm run check:flashcards     # schema, style limits, notes citation, and docs quote for every card
npm run check:labs           # every gcloud and bq command and flag exists in the local SDK
npm run check:links          # every cited link returns HTTP 200
npm run build                # writes dist/index.html (the app) and dist/pca-workbook.html (a standalone copy)
npm run share                # strict build, plus dist/pca-workbook.zip (standalone copy and lab files)
node app/build.mjs --strict  # also fails on broken internal links
```

`tools/fetch_doc.py URL` prints a docs page as plain text (`--outline`, `--grep REGEX`, `--links`). It caches pages in `.cache/docs/`. `check:questions` uses the same cache to confirm that each evidence quote appears on its source page.

To use the app without Claude, open `dist/pca-workbook.html` in a browser. Progress then saves in that browser only. To share the guide, send that file, or send `dist/pca-workbook.zip` to people who also want to do the labs. The zip has the page, the `labs/` folder, and a short README.

## Your progress data

In the published app, progress saves to the app's database in your Claude account. Only you can read or write it. Claude can read it to find your weak areas. The documents are:

| Document | Contents |
|---|---|
| `progress/state` | Objective status (0 not started, 1 studying, 2 done) and confidence (1–5), notes pages read, labs done, settings. |
| `progress/qstats` | For each question: tries, right answers, first-try result, latest result, spaced-review box, due time, flag. |
| `progress/cards` | For each flashcard: the same fields as for a question ("Got it" counts as right), without the flag. |
| `progress/activity` | For each day: questions answered and right, pages read, labs done, flashcards reviewed. |
| `mocks/<id>` | One document for each mock exam: questions, answers, time, score by section and objective. |

**Progress → Copy progress as JSON** exports the same data. **Import progress** restores it.
