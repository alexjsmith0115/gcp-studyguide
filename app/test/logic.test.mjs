import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY, applyAnswer, isDue, readiness, allocate, buildMock, scoreMock, pickPractice,
  mulberry32, deepMerge, streak, dayKey, daysUntil, readinessVerdict, objectiveStats, weakObjectives,
} from "../src/logic.js";

const sections = [
  { id: "1", weight: 25 }, { id: "2", weight: 17.5 }, { id: "3", weight: 17.5 },
  { id: "4", weight: 15 }, { id: "5", weight: 12.5 }, { id: "6", weight: 12.5 },
];
const objs = { 1: ["1.1", "1.2", "1.3"], 2: ["2.1", "2.2"], 3: ["3.1", "3.2"], 4: ["4.1", "4.2"], 5: ["5.1", "5.2"], 6: ["6.1", "6.2"] };

function bank() {
  const qs = [];
  let n = 0;
  for (const [s, list] of Object.entries(objs)) {
    for (let i = 0; i < 30; i++) qs.push({ id: `q${n++}`, objective: list[i % list.length], caseStudy: null, answer: ["A"] });
  }
  for (const cs of ["altostrat", "cymbal", "ehr", "knightmotives"]) {
    for (let i = 0; i < 15; i++) qs.push({ id: `c-${cs}-${i}`, objective: ["1.3", "3.1", "2.2", "4.1"][i % 4], caseStudy: cs, answer: ["B", "C"] });
  }
  return qs;
}

test("applyAnswer: first attempt sets first-result fields and box", () => {
  const now = 1_000 * DAY;
  const right = applyAnswer(undefined, true, now);
  assert.equal(right.n, 1); assert.equal(right.f, 1); assert.equal(right.b, 2);
  assert.equal(right.d, now + 3 * DAY);
  const wrong = applyAnswer(undefined, false, now);
  assert.equal(wrong.f, 0); assert.equal(wrong.b, 0); assert.equal(wrong.d, now);
  assert.ok(isDue(wrong, now));
});

test("applyAnswer: later answers move boxes and keep the first result", () => {
  const t0 = 1_000 * DAY;
  let s = applyAnswer(undefined, false, t0);
  s = applyAnswer(s, true, t0 + DAY);
  assert.equal(s.f, 0); assert.equal(s.b, 1); assert.equal(s.n, 2); assert.equal(s.c, 1);
  s = applyAnswer(s, true, t0 + 2 * DAY);
  s = applyAnswer(s, true, t0 + 3 * DAY);
  s = applyAnswer(s, true, t0 + 4 * DAY);
  s = applyAnswer(s, true, t0 + 5 * DAY);
  assert.equal(s.b, 5, "box is capped");
  s = applyAnswer(s, false, t0 + 6 * DAY);
  assert.equal(s.b, 0); assert.equal(s.l, 0);
});

test("readiness: no data gives the prior and 'not enough'", () => {
  const r = readiness(bank(), {}, sections, Date.now());
  assert.equal(r.enough, false);
  assert.ok(Math.abs(r.predicted - 0.5) < 1e-9);
});

test("readiness: all first attempts right moves toward 100% and weights sections", () => {
  const qs = bank();
  const now = 2_000 * DAY;
  const st = {};
  for (const q of qs) st[q.id] = applyAnswer(undefined, true, now);
  const r = readiness(qs, st, sections, now);
  assert.ok(r.enough);
  assert.ok(r.predicted > 0.9, `predicted ${r.predicted}`);
  // Section 1 all wrong, others right: prediction drops by roughly the section 1 weight.
  const st2 = {};
  for (const q of qs) st2[q.id] = applyAnswer(undefined, !q.objective.startsWith("1."), now);
  const r2 = readiness(qs, st2, sections, now);
  assert.ok(r2.perSection["1"].estimate < 0.1);
  assert.ok(r2.predicted > 0.65 && r2.predicted < 0.8, `predicted ${r2.predicted}`);
});

test("readiness: old first attempts count less than recent ones", () => {
  const qs = bank().filter((q) => q.objective.startsWith("1.")).slice(0, 20);
  const now = 3_000 * DAY;
  const st = {};
  qs.forEach((q, i) => { st[q.id] = applyAnswer(undefined, i < 10, i < 10 ? now - 60 * DAY : now); });
  // 10 old right answers, 10 recent wrong answers: the estimate leans wrong.
  const r = readiness(qs, st, [{ id: "1", weight: 100 }], now);
  assert.ok(r.perSection["1"].estimate < 0.35, `estimate ${r.perSection["1"].estimate}`);
});

test("allocate: parts sum to n and follow the weights", () => {
  const w = { 1: 25, 2: 17.5, 3: 17.5, 4: 15, 5: 12.5, 6: 12.5 };
  const a = allocate(w, 50);
  assert.equal(Object.values(a).reduce((s, v) => s + v, 0), 50);
  assert.equal(a[1], 13); // 12.5 rounds up by largest remainder
  const b = allocate(w, 37);
  assert.equal(Object.values(b).reduce((s, v) => s + v, 0), 37);
});

test("buildMock: size, two case studies, about a quarter case questions, no duplicates", () => {
  const qs = bank();
  const m = buildMock(qs, {}, sections, { size: 50, rng: mulberry32(7) });
  assert.equal(m.qids.length, 50);
  assert.equal(new Set(m.qids).size, 50);
  assert.equal(m.caseStudies.length, 2);
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const caseQs = m.qids.filter((id) => byId[id].caseStudy);
  assert.ok(caseQs.length >= 12 && caseQs.length <= 13, `case questions ${caseQs.length}`);
  assert.ok(caseQs.every((id) => m.caseStudies.includes(byId[id].caseStudy)));
  assert.equal(m.freshIds.length, 50);
});

test("buildMock: prefers unseen questions", () => {
  const qs = bank();
  const now = 5_000 * DAY;
  const st = {};
  // Mark every section-2 question except 3 as seen.
  qs.filter((q) => q.objective.startsWith("2.") && !q.caseStudy).slice(3).forEach((q) => { st[q.id] = applyAnswer(undefined, true, now); });
  const m = buildMock(qs, st, sections, { size: 50, rng: mulberry32(1) });
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const s2 = m.qids.filter((id) => byId[id].objective.startsWith("2.") && !byId[id].caseStudy);
  const unseenS2 = s2.filter((id) => !st[id]);
  assert.equal(unseenS2.length, 3, "all 3 unseen section-2 questions are used");
});

test("scoreMock: multi-select needs the exact set", () => {
  const qs = bank();
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const ids = ["q0", "q1", "c-ehr-0", "c-ehr-1"];
  const res = scoreMock(byId, ids, { q0: ["A"], q1: ["B"], "c-ehr-0": ["C", "B"], "c-ehr-1": ["B"] }, ["q0", "c-ehr-0"]);
  assert.equal(res.correct, 2);
  assert.equal(res.total, 4);
  assert.deepEqual(res.fresh, { right: 2, total: 2 });
  assert.equal(res.bySection["1"].total, 3);
});

test("pickPractice: due scope returns only due questions", () => {
  const qs = bank();
  const now = 6_000 * DAY;
  const st = { q0: applyAnswer(undefined, false, now - DAY), q1: applyAnswer(undefined, true, now) };
  const due = pickPractice(qs, st, { kind: "due" }, 10, now, mulberry32(3));
  assert.deepEqual(due.map((q) => q.id), ["q0"]);
  const obj = pickPractice(qs, st, { kind: "objective", id: "1.1" }, 5, now, mulberry32(3));
  assert.equal(obj.length, 5);
  assert.ok(obj.every((q) => q.objective === "1.1"));
});

test("deepMerge merges nested objects and replaces arrays", () => {
  const a = { q: { x: { n: 1, b: 2 }, y: { n: 3 } }, arr: [1, 2] };
  const b = { q: { x: { b: 3 } }, arr: [9] };
  assert.deepEqual(deepMerge(a, b), { q: { x: { n: 1, b: 3 }, y: { n: 3 } }, arr: [9] });
});

test("streak and dates", () => {
  const now = new Date(2026, 8, 24, 15, 0).getTime();
  const days = { [dayKey(now - DAY)]: { a: 3 }, [dayKey(now - 2 * DAY)]: { a: 1 } };
  assert.equal(streak(days, now), 2);
  days[dayKey(now)] = { a: 5 };
  assert.equal(streak(days, now), 3);
  assert.equal(daysUntil("2026-10-01", now), 7);
});

test("objectiveStats, weakObjectives, and verdict", () => {
  const qs = bank();
  const now = 7_000 * DAY;
  const st = {};
  qs.filter((q) => q.objective === "2.1").slice(0, 6).forEach((q) => { st[q.id] = applyAnswer(undefined, false, now); });
  qs.filter((q) => q.objective === "3.1").slice(0, 6).forEach((q) => { st[q.id] = applyAnswer(undefined, true, now); });
  const os = objectiveStats(qs, st, now);
  assert.equal(os["2.1"].seen, 6);
  const weak = weakObjectives(os);
  assert.equal(weak[0].id, "2.1");
  assert.ok(!weak.find((w) => w.id === "3.1"));
  const r = readiness(qs, st, sections, now);
  const v = readinessVerdict({ ready: r, objectivesDone: 2, objectivesTotal: 22, mocks: [] });
  assert.equal(v.level, "building");
  assert.ok(v.gaps.some((g) => g.includes("mock")));
});
