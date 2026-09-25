// Pure study logic: no DOM, no storage. Unit-tested in app/test/logic.test.mjs.
// The build inlines this file into the page (it strips the `export` keywords).

export const DAY = 86400000;

// Leitner boxes: days until a question is due again after the answer that put it in the box.
export const BOX_DAYS = [0, 1, 3, 7, 16, 35];
export const MAX_BOX = BOX_DAYS.length - 1;

// Readiness model parameters (this app's own heuristic; Google publishes no passing score).
export const READINESS = {
  halfLifeDays: 21,     // a first attempt from 21 days ago counts half as much as one from today
  priorMean: 0.5,       // before evidence, assume 50% on a section
  priorWeight: 5,       // the prior counts like 5 answered questions
  minAnswers: 20,       // show a predicted score only after this many first attempts
  target: 0.8,          // this app's target on unseen questions
};

export function sectionOf(objectiveId) {
  return String(objectiveId).split(".")[0];
}

export function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function isCorrect(question, selected) {
  return sameSet(question.answer, selected || []);
}

/** Update one question's stats after an answer. Returns a new object. */
export function applyAnswer(stat, correct, now) {
  const s = stat ? { ...stat } : {};
  const first = !s.n;
  s.n = (s.n || 0) + 1;
  s.c = (s.c || 0) + (correct ? 1 : 0);
  if (first) {
    s.f = correct ? 1 : 0;
    s.ft = now;
    s.b = correct ? 2 : 0; // a first-time correct answer skips the early boxes
  } else {
    s.b = correct ? Math.min((s.b || 0) + 1, MAX_BOX) : 0;
  }
  s.l = correct ? 1 : 0;
  s.lt = now;
  s.d = now + BOX_DAYS[s.b] * DAY;
  return s;
}

export function isDue(stat, now) {
  return !!(stat && stat.n && (stat.d ?? 0) <= now);
}

/** Predicted score on unseen questions, weighted by the official section weights. */
export function readiness(questions, qstats, sections, now, params = READINESS) {
  const per = {};
  for (const s of sections) per[s.id] = { id: s.id, weight: s.weight, total: 0, seen: 0, firstRight: 0, w: 0, k: 0 };
  let firstAttempts = 0;
  for (const q of questions) {
    const p = per[sectionOf(q.objective)];
    if (!p) continue;
    p.total++;
    const st = qstats[q.id];
    if (!st || !st.n) continue;
    p.seen++;
    firstAttempts++;
    if (st.f) p.firstRight++;
    const ageDays = Math.max(0, (now - (st.ft ?? now)) / DAY);
    const w = Math.pow(0.5, ageDays / params.halfLifeDays);
    p.w += w;
    p.k += w * (st.f ? 1 : 0);
  }
  let predicted = 0, variance = 0, weightSum = 0;
  for (const s of sections) {
    const p = per[s.id];
    const denom = p.w + params.priorWeight;
    p.estimate = (p.k + params.priorMean * params.priorWeight) / denom;
    p.accuracy = p.seen ? p.firstRight / p.seen : null;
    const wt = s.weight / 100;
    weightSum += wt;
    predicted += wt * p.estimate;
    variance += wt * wt * (p.estimate * (1 - p.estimate)) / denom;
  }
  predicted /= weightSum || 1;
  return {
    predicted,
    margin: 1.96 * Math.sqrt(variance) / (weightSum || 1),
    perSection: per,
    firstAttempts,
    enough: firstAttempts >= params.minAnswers,
    coverage: questions.length ? firstAttempts / questions.length : 0,
  };
}

/** Per-objective question stats. */
export function objectiveStats(questions, qstats, now) {
  const out = {};
  for (const q of questions) {
    const o = (out[q.objective] ||= { total: 0, seen: 0, firstRight: 0, lastRight: 0, due: 0, mastered: 0 });
    o.total++;
    const st = qstats[q.id];
    if (!st || !st.n) continue;
    o.seen++;
    if (st.f) o.firstRight++;
    if (st.l) o.lastRight++;
    if (isDue(st, now)) o.due++;
    if ((st.b || 0) >= 3) o.mastered++;
  }
  for (const o of Object.values(out)) {
    o.firstAcc = o.seen ? o.firstRight / o.seen : null;
    o.lastAcc = o.seen ? o.lastRight / o.seen : null;
  }
  return out;
}

/** Objectives with enough answers, weakest first. */
export function weakObjectives(objStats, minSeen = 3, limit = 5) {
  return Object.entries(objStats)
    .filter(([, o]) => o.seen >= minSeen)
    .map(([id, o]) => ({ id, ...o, score: 0.6 * o.lastAcc + 0.4 * o.firstAcc }))
    .filter((o) => o.score < 0.8)
    .sort((a, b) => a.score - b.score || b.total - a.total)
    .slice(0, limit);
}

export function readinessVerdict({ ready, objectivesDone, objectivesTotal, mocks }) {
  const lastMock = mocks.length ? mocks[mocks.length - 1] : null;
  const lastMockScore = lastMock ? lastMock.score : null;
  const doneShare = objectivesTotal ? objectivesDone / objectivesTotal : 0;
  const t = READINESS.target;
  const gaps = [];
  if (!ready.enough) gaps.push(`answer ${READINESS.minAnswers - ready.firstAttempts} more new questions to get a predicted score`);
  else if (ready.predicted < t) gaps.push(`raise the predicted score from ${pct(ready.predicted)} to ${pct(t)}`);
  if (ready.coverage < 0.6) gaps.push(`try at least 60% of the question bank (now ${pct(ready.coverage)})`);
  if (doneShare < 0.9) gaps.push(`finish ${Math.ceil(0.9 * objectivesTotal) - objectivesDone} more objectives in the study guide`);
  if (lastMockScore == null) gaps.push("take a full mock exam");
  else if (lastMockScore < t) gaps.push(`score ${pct(t)} or more on a mock exam (last: ${pct(lastMockScore)})`);
  let level;
  if (ready.enough && ready.predicted >= t && ready.coverage >= 0.6 && doneShare >= 0.9 && lastMockScore != null && lastMockScore >= t) level = "ready";
  else if (ready.enough && ready.predicted >= 0.72 && ready.coverage >= 0.4) level = "close";
  else if (ready.firstAttempts >= 10 || doneShare >= 0.25) level = "building";
  else level = "starting";
  return { level, gaps };
}

export function pct(x, digits = 0) {
  return x == null || Number.isNaN(x) ? "–" : `${(x * 100).toFixed(digits)}%`;
}

// ---------- randomness ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Split n into integer parts proportional to weights (largest remainder method). */
export function allocate(weights, n) {
  const keys = Object.keys(weights);
  const total = keys.reduce((s, k) => s + weights[k], 0) || 1;
  const raw = keys.map((k) => ({ k, v: (weights[k] / total) * n }));
  const out = Object.fromEntries(raw.map((r) => [r.k, Math.floor(r.v)]));
  let left = n - Object.values(out).reduce((s, v) => s + v, 0);
  raw.sort((a, b) => (b.v - Math.floor(b.v)) - (a.v - Math.floor(a.v)));
  for (let i = 0; left > 0; i = (i + 1) % raw.length, left--) out[raw[i].k]++;
  return out;
}

/** Order candidates: never-seen first (random), then oldest last attempt. */
export function freshFirst(qs, qstats, rng) {
  const unseen = shuffle(qs.filter((q) => !qstats[q.id]?.n), rng);
  const seen = qs.filter((q) => qstats[q.id]?.n).sort((a, b) => (qstats[a.id].lt || 0) - (qstats[b.id].lt || 0));
  return unseen.concat(seen);
}

/**
 * Assemble a mock exam like the real one: two case studies supply about a
 * quarter of the questions; the rest follow the official section weights.
 */
export function buildMock(questions, qstats, sections, { size = 50, caseShare = 0.25, rng = Math.random } = {}) {
  const caseIds = [...new Set(questions.filter((q) => q.caseStudy).map((q) => q.caseStudy))];
  const unseenCount = (id) => questions.filter((q) => q.caseStudy === id && !qstats[q.id]?.n).length;
  // Prefer case studies with more unseen questions; break ties at random.
  const chosen = shuffle(caseIds, rng).sort((a, b) => unseenCount(b) - unseenCount(a)).slice(0, 2);
  const nCase = chosen.length ? Math.round(size * caseShare) : 0;
  const perCase = allocate(Object.fromEntries(chosen.map((c) => [c, 1])), nCase);
  const picked = [];
  for (const c of chosen) picked.push(...freshFirst(questions.filter((q) => q.caseStudy === c), qstats, rng).slice(0, perCase[c]));

  // Section targets for the whole exam; case questions count toward their own sections.
  const targets = allocate(Object.fromEntries(sections.map((s) => [s.id, s.weight])), size);
  for (const q of picked) targets[sectionOf(q.objective)] = Math.max(0, (targets[sectionOf(q.objective)] || 0) - 1);
  const pool = questions.filter((q) => !q.caseStudy);
  const used = new Set(picked.map((q) => q.id));
  for (const s of sections) {
    const cand = freshFirst(pool.filter((q) => sectionOf(q.objective) === s.id && !used.has(q.id)), qstats, rng);
    for (const q of cand.slice(0, targets[s.id])) { picked.push(q); used.add(q.id); }
  }
  // If a section ran short, fill from the rest of the pool.
  if (picked.length < size) {
    for (const q of freshFirst(pool.filter((q) => !used.has(q.id)), qstats, rng)) {
      if (picked.length >= size) break;
      picked.push(q); used.add(q.id);
    }
  }
  const order = shuffle(picked, rng);
  return {
    qids: order.map((q) => q.id),
    caseStudies: chosen,
    freshIds: order.filter((q) => !qstats[q.id]?.n).map((q) => q.id),
  };
}

/** Pick practice questions for a scope. */
export function pickPractice(questions, qstats, scope, count, now, rng = Math.random) {
  let qs = questions;
  switch (scope.kind) {
    case "objective": qs = qs.filter((q) => q.objective === scope.id); break;
    case "section": qs = qs.filter((q) => sectionOf(q.objective) === scope.id); break;
    case "case": qs = qs.filter((q) => q.caseStudy === scope.id); break;
    case "due": qs = qs.filter((q) => isDue(qstats[q.id], now)).sort((a, b) => (qstats[a.id].b - qstats[b.id].b) || (qstats[a.id].d - qstats[b.id].d)); return qs.slice(0, count);
    case "missed": qs = qs.filter((q) => qstats[q.id]?.n && !qstats[q.id].l); return shuffle(qs, rng).slice(0, count);
    case "flagged": qs = qs.filter((q) => qstats[q.id]?.fl); return shuffle(qs, rng).slice(0, count);
    case "unseen": qs = qs.filter((q) => !qstats[q.id]?.n); return shuffle(qs, rng).slice(0, count);
    case "ids": { const set = new Set(scope.ids); qs = qs.filter((q) => set.has(q.id)); return shuffle(qs, rng).slice(0, count); }
    case "mixed": default: break;
  }
  // Within a scope: unseen first, then due, then weakest box, then oldest.
  const unseen = shuffle(qs.filter((q) => !qstats[q.id]?.n), rng);
  const seen = qs.filter((q) => qstats[q.id]?.n).sort((a, b) => {
    const A = qstats[a.id], B = qstats[b.id];
    const dueA = isDue(A, now) ? 0 : 1, dueB = isDue(B, now) ? 0 : 1;
    return dueA - dueB || (A.b || 0) - (B.b || 0) || (A.lt || 0) - (B.lt || 0);
  });
  return unseen.concat(seen).slice(0, count);
}

/** Score a finished mock exam. Multi-select questions score only when every choice is right. */
export function scoreMock(qById, qids, answers, freshIds = []) {
  const bySection = {}, byObjective = {};
  const fresh = new Set(freshIds);
  let correct = 0, freshRight = 0;
  for (const id of qids) {
    const q = qById[id];
    if (!q) continue;
    const ok = isCorrect(q, answers[id]);
    if (ok) correct++;
    if (ok && fresh.has(id)) freshRight++;
    const s = (bySection[sectionOf(q.objective)] ||= { right: 0, total: 0 });
    s.total++; if (ok) s.right++;
    const o = (byObjective[q.objective] ||= { right: 0, total: 0 });
    o.total++; if (ok) o.right++;
  }
  const total = qids.length;
  return {
    correct, total, score: total ? correct / total : 0,
    fresh: { right: freshRight, total: freshIds.length },
    bySection, byObjective,
  };
}

// ---------- dates & activity ----------
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function streak(days, now) {
  let n = 0;
  let t = now;
  // Today counts if active; otherwise the streak can still continue from yesterday.
  if (!(days[dayKey(t)]?.a > 0)) t -= DAY;
  while (days[dayKey(t)]?.a > 0) { n++; t -= DAY; }
  return n;
}

export function daysUntil(dateStr, now) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(dayKey(now) + "T00:00:00").getTime();
  return Math.round((target - today) / DAY);
}

// ---------- objects ----------
export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Merge b into a like the store's update(): nested objects merge; everything else replaces. */
export function deepMerge(a, b) {
  const out = isPlainObject(a) ? { ...a } : {};
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}
