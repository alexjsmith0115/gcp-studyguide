import { test } from "node:test";
import assert from "node:assert/strict";
import { compilePattern, plainText, checkServices, buildServices } from "../services.mjs";

test("compilePattern: (?i) prefix makes a case-insensitive pattern", () => {
  assert.ok(compilePattern("(?i)spot VMs?").test("preemptible or spot VM"));
  assert.ok(!compilePattern("Spot VMs?").test("spot VM"));
  assert.ok(compilePattern("Cloud Run(?! functions)").test("Cloud Run jobs"));
  assert.ok(!compilePattern("Cloud Run(?! functions)").test("Cloud Run functions"));
});

test("plainText: strips tags and decodes entities", () => {
  assert.equal(plainText('<p>Cymbal&#39;s <span class="gl">Cloud&nbsp;SQL</span> &amp; <b>Spanner</b></p>').trim(), "Cymbal's Cloud SQL & Spanner");
});

const exam = { sections: [{ id: "1", objectives: [{ id: "1.3", title: "Designing compute", considerations: ["Mapping compute needs (e.g., GKE, Cloud Run)"] }] }] };
const spec = {
  categories: [{ id: "containers", name: "Containers", intro: "", decide: [{ if: "x", then: ["cloud-run"], why: "y" }] }],
  services: [
    { id: "cloud-run", name: "Cloud Run", category: "containers", patterns: ["Cloud Run(?! functions)"], what: "w", cues: ["c"], confused: [{ with: "gke", tell: "t" }], sources: ["n1"] },
    { id: "gke", name: "GKE", category: "containers", patterns: ["\\bGKE\\b"], what: "w", cues: ["c"], sources: [] },
  ],
};
const q = (id, stem, opts, answer, explanation = "", caseStudy = null) => ({
  id, objective: "1.3", caseStudy, stem: `<p>${stem}</p>`, answer, explanation, whyWrong: {},
  options: Object.entries(opts).map(([k, v]) => ({ id: k, html: v })),
});

test("buildServices: sorts each question into right answer, distractor, or context", () => {
  const questions = [
    q("q1", "Pick a platform.", { A: "Cloud Run", B: "GKE" }, ["A"], "", "ehr"),
    q("q2", "Pick a platform.", { A: "Compute Engine", B: "Cloud Run" }, ["A"]),
    q("q3", "The app runs on Cloud Run today.", { A: "Add a cache", B: "Add a queue" }, ["A"]),
    q("q4", "Pick one.", { A: "Cloud Run functions", B: "Batch" }, ["A"]),
  ];
  const notes = [{ id: "n1", html: "<p>Cloud Run and Cloud Run</p>" }, { id: "n2", html: "<p>GKE</p>" }];
  const out = buildServices(spec, { exam, notes, questions, cases: [{ id: "ehr", textHtml: "", analysisHtml: "<p>GKE</p>" }], cards: [], glossary: [{ id: "cloud-run", term: "Cloud Run" }] });
  const run = out.services.find((s) => s.id === "cloud-run");
  assert.deepEqual(run.q, { a: ["q1"], d: ["q2"], c: ["q3"] });
  assert.deepEqual(run.cases, { ehr: 1 });
  assert.deepEqual(run.guide, [["1.3", ["Mapping compute needs (e.g., GKE, Cloud Run)"]]]);
  assert.deepEqual(run.notes, ["n1"]);
  const gke = out.services.find((s) => s.id === "gke");
  assert.deepEqual(gke.q, { a: [], d: ["q1"], c: [] });
  assert.deepEqual(gke.caseNamed, ["ehr"]);
  assert.deepEqual(out.serviceGloss, { "cloud-run": "cloud-run" });
});

test("checkServices: reports unknown references", () => {
  const bad = structuredClone(spec);
  bad.services[0].confused = [{ with: "nope", tell: "t" }];
  bad.services[0].sources = ["n9", "case:zzz"];
  bad.services[1].patterns = ["("];
  const p = checkServices(bad, { noteIds: new Set(["n1"]), caseIds: new Set(["ehr"]) });
  assert.ok(p.some((x) => x.includes("unknown service nope")));
  assert.ok(p.some((x) => x.includes("unknown source n9")));
  assert.ok(p.some((x) => x.includes("unknown source case:zzz")));
  assert.ok(p.some((x) => x.includes("bad pattern (")));
  assert.deepEqual(checkServices(spec, { noteIds: new Set(["n1"]), caseIds: new Set() }), []);
});
