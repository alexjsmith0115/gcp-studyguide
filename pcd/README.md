# PCD study guide

A study system for the Google Cloud **Professional Cloud Developer** exam. It uses the same study app, checks, and authoring rules as the [PCA guide](../README.md) in the repository root. It has these parts:

| Part | Where | What it gives you |
|---|---|---|
| Notes | `pcd/content/notes/` | 46 pages for the 11 exam guide objectives, written for an experienced developer who knows AWS. Each fact cites the Google Cloud documentation page it comes from. |
| Question bank | `pcd/content/questions/` | 353 exam-style scenario questions. Each answer has an explanation, a reason why each wrong option is wrong, and a verbatim quote from the docs. |
| Flashcards | `pcd/content/flashcards/` | 550 cards for the concepts and terms in the notes pages. Each card links its notes page and shows a verbatim quote from the docs. |
| Labs | `pcd/labs/` | 22 hands-on labs in your own sandbox project, with cost notes and a teardown script. |
| Study app | [PCD Workbook](https://claude.ai/artifact/2CHa4KR5pQHwwsxbC5CjfS) | Reader, practice sessions and flashcards with spaced review, timed mock exams, and a readiness dashboard. Built from this repo. |
| Glossary | `pcd/content/glossary.json` | Short definitions of acronyms and key terms, with AWS equivalents. In the app, point at a term with a dotted underline (or tap it) to see its definition. |
| Services | `pcd/content/services.json` | A profile for each Google Cloud service that the exam guide or the questions name: what it is, the scenario cues that point to it, and the look-alikes it gets confused with. |
| Name changes | `pcd/content/reference/name-changes.md` | Renamed products, exam guide names that differ from the docs, and retired products. |

All content follows `pcd/content/SPEC.md`: official Google sources only, every page read before it is cited, and the current product names. The notes were checked against the docs on 2026-09-30 and 2026-10-01.

## The exam

| Item | Value |
|---|---|
| Length | 2 hours, 50–60 multiple choice and multiple select questions |
| Case studies | None |
| Sections | 1. Designing highly scalable, secure, and reliable cloud-native applications (about 32%)<br>2. Building and testing applications (about 23%)<br>3. Configuring cloud-native applications for deployment (about 24%)<br>4. Integrating applications with Google Cloud services (about 21%) |
| Official pages | [Certification page](https://cloud.google.com/learn/certification/cloud-developer), [exam guide](https://services.google.com/fh/files/misc/professional_cloud_developer_exam_guide_english.pdf) (copy in `pcd/sources/`) |

## How to study

1. **Set up.** Open the app, go to **Progress**, and set your exam date. Then do [lab 00-setup](labs/00-setup/README.md) once.
2. **Work through the objectives.** Go to **Study guide**. For each objective:
   1. Read its notes pages. Mark each page as read.
   2. Do its labs.
   3. Study the flashcards for each page (the **Flashcards** button at the end of the page).
   4. Practice its questions (10 at a time).
   5. Set the objective to **Done** when you can explain the "Exam traps" section without notes.
3. **Use the term definitions.** A dotted underline marks an acronym or key term. Point at it, or tap it on a phone, to see a short definition, the AWS equivalent, and the notes page that explains it.
4. **Learn the look-alike services.** Go to **Services**. Each service page lists its cues, traps, and the services it gets confused with. **Practice** on a service page runs every question that names the service.
5. **Review every day.** **Practice → Due for review** and **Flashcards → Due for review** bring back the items that you missed or have not seen for a while (1, 3, 7, 16, then 35 days).
6. **Take mock exams.** Start after about a third of the objectives. A mock exam has 50 questions and 2 hours, with no feedback until the end.
7. **Book the exam** when the dashboard verdict says **Ready**: predicted score of 80% or more, at least 60% of the bank tried, 90% of objectives done, and a latest mock exam score of 80% or more.

The predicted score works as in the PCA guide (see [How the predicted score works](../README.md#how-the-predicted-score-works)). It weights the sections 32%, 23%, 24%, and 21%.

## Labs

Every lab runs in one dedicated project whose ID starts with `pcd-lab-`. [Lab 00-setup](labs/00-setup/README.md) creates it, adds a budget alert, and creates a separate gcloud configuration named `pcd-lab`. It also gives the Compute Engine default service account the Cloud Run Builder role (`roles/run.builder`), which `gcloud run deploy --source` needs.

- **Start every lab** in a new terminal at the repository root with `source pcd/labs/env.sh`. The script selects the `pcd-lab` configuration for that terminal only, and it refuses any project whose ID does not start with `pcd-lab-`. Your normal gcloud configuration stays unchanged.
- **Client libraries** in that terminal use the lab project, because the script sets `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_QUOTA_PROJECT`. Your Application Default Credentials file stays unchanged.
- **kubectl** in that terminal uses a lab-only file, `~/.kube/pcd-lab-config`. The GKE labs cannot reach the clusters in your normal `~/.kube/config`.
- **Finish every lab** with its `teardown.sh`. The scripts are safe to run more than once. After the last lab, `pcd/labs/00-setup/teardown.sh` deletes the project and the `pcd-lab` configuration.
- A budget alert does not stop spending. Run the teardown scripts.

## Checks and build

Run these from the repository root:

```bash
npm run check:pcd:questions   # schema, style rules, and docs quotes for every question
npm run check:pcd:flashcards  # schema, style limits, notes citation, and docs quote for every card
npm run check:pcd:labs        # every gcloud and bq command and flag exists in the local SDK
npm run check:pcd:links       # every cited link returns HTTP 200
npm run build:pcd             # writes dist/pcd/index.html (the app) and dist/pcd/pcd-workbook.html (a standalone copy)
npm run share:pcd             # strict build, plus dist/pcd/pcd-workbook.zip (standalone copy and lab files)
```

To use the app without Claude, open `dist/pcd/pcd-workbook.html` in a browser. Progress then saves in that browser only, apart from the PCA progress. To share the guide, send that file, or send `dist/pcd/pcd-workbook.zip` to people who also want to do the labs.

## Your progress data

In the published app, progress saves to the app's database in your Claude account. Only you can read or write it. The PCD app has its own database, with the same documents as the PCA app (see [Your progress data](../README.md#your-progress-data)).
