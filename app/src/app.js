// PCA Workbook UI. Plain JS; renders views into #main from DATA + Store.
// Uses logic.js and store.js globals (the build concatenates the files).

const DATA = JSON.parse(document.getElementById("pca-data").textContent);
const EXAM = DATA.exam;
const SECTIONS = EXAM.sections.map((s) => ({ id: s.id, weight: s.weight, title: s.title }));
const SEC = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
const SHORT = { 1: "Design and planning", 2: "Managing and provisioning", 3: "Security and compliance", 4: "Technical and business processes", 5: "Managing implementation", 6: "Operations excellence" };
const OBJECTIVES = EXAM.sections.flatMap((s) => s.objectives.map((o) => ({ ...o, section: s.id })));
const OBJ = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));
const NOTES = DATA.notes;
const NOTE = Object.fromEntries(NOTES.map((n) => [n.id, n]));
const LABS = DATA.labs;
const LAB = Object.fromEntries(LABS.map((l) => [l.id, l]));
const CASES = DATA.cases;
const CASE = Object.fromEntries(CASES.map((c) => [c.id, c]));
const REFS = DATA.refs || [];
const REF = Object.fromEntries(REFS.map((r) => [r.id, r]));
const QS = DATA.questions;
const Q = Object.fromEntries(QS.map((q) => [q.id, q]));
const groupBy = (arr, fn) => arr.reduce((m, x) => { for (const k of [].concat(fn(x))) (m[k] ||= []).push(x); return m; }, {});
const NOTES_BY_OBJ = groupBy(NOTES, (n) => n.objective);
const NOTES_ALSO = groupBy(NOTES.filter((n) => n.also.length), (n) => n.also);
const LABS_BY_OBJ = groupBy(LABS, (l) => l.objectives);
const QS_BY_OBJ = groupBy(QS, (q) => q.objective);
const QS_BY_CASE = groupBy(QS.filter((q) => q.caseStudy), (q) => q.caseStudy);
const CARDS = DATA.cards || [];
const CARD = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const CARDS_BY_OBJ = groupBy(CARDS, (c) => c.objective);
const CARDS_BY_NOTE = groupBy(CARDS, (c) => c.note);

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtDateLong = (ts) => new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
const LETTERS = "ABCDEF";
const lsGetStr = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSetStr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };

const ICON = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9.5 2.5h5"/>',
  case: '<rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8.5 7V4.5h7V7"/><path d="M3 12.5h18"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6.5L4.8 18.2A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.8L14 9.5V3"/><path d="M7.5 15h9"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  s0: '<circle cx="12" cy="12" r="8"/>',
  s1: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/>',
  s2: '<circle cx="12" cy="12" r="8" fill="currentColor"/><path d="m8 12.3 2.8 2.7L16.2 9.5" stroke="var(--surface)"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  warn: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  doc: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h5"/>',
  cards: '<rect x="3" y="7" width="13" height="14" rx="1.5"/><path d="M8 7V4.5A1.5 1.5 0 0 1 9.5 3h10A1.5 1.5 0 0 1 21 4.5v11a1.5 1.5 0 0 1-1.5 1.5H16"/><path d="M6.5 12h6M6.5 15.5h4"/>',
};
const icon = (name, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ""}</svg>`;

const STATUS = [
  { label: "Not started", icon: "s0", chip: "" },
  { label: "Studying", icon: "s1", chip: "warn" },
  { label: "Done", icon: "s2", chip: "good" },
];
const statusChip = (s) => `<span class="chip ${STATUS[s].chip}">${icon(STATUS[s].icon, "smark")}${STATUS[s].label}</span>`;
const objStatus = (id) => Store.data.state.objectives?.[id]?.s || 0;
const objConf = (id) => Store.data.state.objectives?.[id]?.c || 0;
const noteRead = (id) => !!Store.data.state.notes?.[id];
const labDone = (id) => !!Store.data.state.labs?.[id];
const qstats = () => Store.data.qstats.q || {};
const cstats = () => Store.data.cards?.c || {};

// ---------- derived data ----------
let dataVersion = 0;
let memo = null;
function derived() {
  const now = Date.now();
  if (memo && memo.version === dataVersion && now - memo.at < 30000) return memo;
  const qs = qstats();
  const cs = cstats();
  const st = Store.data.state;
  const ready = readiness(QS, qs, SECTIONS, now);
  const objStats = objectiveStats(QS, qs, now);
  const allMocks = Object.entries(Store.data.mocks || {}).map(([id, m]) => ({ id, ...m }));
  const mocks = allMocks.filter((m) => m.status === "done").sort((a, b) => a.finishedAt - b.finishedAt);
  const activeMock = allMocks.filter((m) => m.status === "active").sort((a, b) => b.startedAt - a.startedAt)[0] || null;
  const objDone = OBJECTIVES.filter((o) => objStatus(o.id) === 2).length;
  memo = {
    version: dataVersion, at: now, now, ready, objStats, mocks, activeMock,
    dueCount: QS.filter((q) => isDue(qs[q.id], now)).length,
    missedCount: QS.filter((q) => qs[q.id]?.n && !qs[q.id].l).length,
    flaggedCount: QS.filter((q) => qs[q.id]?.fl).length,
    unseenCount: QS.filter((q) => !qs[q.id]?.n).length,
    objDone,
    cardObjStats: objectiveStats(CARDS, cs, now),
    cardsDue: CARDS.filter((c) => isDue(cs[c.id], now)).length,
    cardsNew: CARDS.filter((c) => !cs[c.id]?.n).length,
    cardsNewRead: CARDS.filter((c) => !cs[c.id]?.n && st.notes?.[c.note]).length,
    cardsMissed: CARDS.filter((c) => cs[c.id]?.n && !cs[c.id].l).length,
    cardsLearned: CARDS.filter((c) => (cs[c.id]?.b || 0) >= 3).length,
    notesRead: NOTES.filter((n) => st.notes?.[n.id]).length,
    labsDone: LABS.filter((l) => st.labs?.[l.id]).length,
    verdict: readinessVerdict({ ready, objectivesDone: objDone, objectivesTotal: OBJECTIVES.length, mocks }),
    streak: streak(Store.data.activity.days || {}, now),
  };
  return memo;
}

// ---------- routing ----------
const ui = {
  routeStr: "home", route: { name: "home", id: null }, stack: [],
  quiz: null, exam: null, flash: null, caseTab: {}, practiceCount: 10, cardCount: 20, browseQ: "", labNoOrg: false, resetStep: 0, importMsg: "",
};
const VIEWS = {};
function parseRoute(str) {
  const [name, ...rest] = String(str || "home").replace(/^#?\/?/, "").split("/");
  return { name: name || "home", id: rest.length ? decodeURIComponent(rest.join("/")) : null };
}
function go(path, { replace = false, keepScroll = false } = {}) {
  if (!replace && ui.routeStr && ui.routeStr !== path) ui.stack.push(ui.routeStr);
  if (ui.stack.length > 50) ui.stack.shift();
  ui.routeStr = path;
  ui.route = parseRoute(path);
  lsSetStr("pca-route", path);
  render();
  if (!keepScroll) window.scrollTo(0, 0);
}
function back(fallback = "home") {
  const prev = ui.stack.pop();
  ui.routeStr = null;
  go(prev || fallback, { replace: true });
}

// ---------- shell ----------
const NAV = [
  ["home", "Dashboard", "home"], ["study", "Study guide", "book"], ["practice", "Practice", "target"], ["cards", "Flashcards", "cards"],
  ["mock", "Mock exam", "timer"], ["cases", "Case studies", "case"], ["labs", "Labs", "flask"], ["progress", "Progress", "chart"],
];
const NAV_OF = { objective: "study", note: "study", ref: "study", quiz: "practice", flash: "cards", browse: "cards", exam: "mock", result: "mock", case: "cases", lab: "labs" };
const NAV_COUNT_TITLE = { practice: "Questions due for review", cards: "Flashcards due for review", mock: "Mock exam in progress" };
function renderNav() {
  const d = derived();
  const current = NAV_OF[ui.route.name] || ui.route.name;
  const counts = { practice: d.dueCount ? String(d.dueCount) : "", cards: d.cardsDue ? String(d.cardsDue) : "", mock: d.activeMock ? "•" : "" };
  $("#nav").innerHTML = NAV.map(([r, label, ic]) =>
    `<a href="#/${r}" data-route="${r}"${current === r ? ' aria-current="page"' : ""}>${icon(ic)}<span>${label}</span>${counts[r] ? `<span class="count" title="${NAV_COUNT_TITLE[r]}">${counts[r]}</span>` : ""}</a>`).join("");
}
function renderSaveState() {
  const el = $("#save-state");
  el.dataset.mode = Store.mode;
  el.dataset.pending = Store.pendingWrites > 0 ? "true" : "false";
  const text = Store.mode === "loading" ? "Connecting…" : Store.mode === "cloud" ? (Store.pendingWrites ? "Saving…" : "Saved to your Claude account") : "Saved in this browser only";
  $("#save-text").textContent = text;
  el.title = Store.note || "";
}

let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function render() {
  const view = VIEWS[ui.route.name] || VIEWS.home;
  stopExamTimer();
  $("#main").innerHTML = view(ui.route) || "";
  renderNav();
  renderSaveState();
  if (ui.route.name === "exam") startExamTimer();
  saveSession();
}

// ---------- small components ----------
function titleBlock({ sheet, title, cells }) {
  return `<div class="titleblock" style="--tb-cols:${cells.length}">
    <div class="tb-sheet"><span class="tb-label">Sheet</span><span class="tb-value">${esc(sheet)}</span></div>
    <div class="tb-title"><span class="tb-label">Title</span><span class="tb-value">${esc(title)}</span></div>
    ${cells.map(([k, v]) => `<div><span class="tb-label">${esc(k)}</span><span class="tb-value">${v}</span></div>`).join("")}
  </div>`;
}
function crumbs(parts) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.map(([label, route], i) => (route ? `<a href="#/${route}" data-route="${route}">${esc(label)}</a>` : `<span>${esc(label)}</span>`) + (i < parts.length - 1 ? '<span aria-hidden="true">/</span>' : "")).join("")}</nav>`;
}
function meter(frac) { return `<div class="meter" role="img" aria-label="${Math.round(frac * 100)} percent"><i style="width:${Math.max(0, Math.min(1, frac)) * 100}%"></i></div>`; }
function objMinutes(id) { return (NOTES_BY_OBJ[id] || []).reduce((s, n) => s + n.minutes, 0); }
function examDateInfo() {
  const date = Store.data.state.settings?.examDate;
  if (!date) return null;
  const days = daysUntil(date, Date.now());
  return { date, days };
}

// ---------- dashboard ----------
VIEWS.home = function () {
  const d = derived();
  const r = d.ready;
  const ed = examDateInfo();
  const vIcon = { ready: "check", close: "target", building: "spark", starting: "doc" }[d.verdict.level];
  const vLabel = { ready: "Ready to book the exam", close: "Close", building: "Building", starting: "Getting started" }[d.verdict.level];
  const left = OBJECTIVES.length - d.objDone;
  const pace = ed && ed.days > 0 && left > 0 ? `${left} objectives left · ${ed.days} days · about ${Math.ceil(left / Math.max(1, ed.days / 7))} per week` : "";
  return `<div class="page">
    <div class="page-head">
      <div><h1>Dashboard</h1><p>Predicted score, what to study next, and how far you are through the official exam guide.</p></div>
      <div class="row">
        ${ed ? `<span class="chip ${ed.days <= 7 ? "warn" : "accent"}">${icon("timer")}${ed.days > 0 ? `Exam in ${plural(ed.days, "day")}` : ed.days === 0 ? "Exam today" : "Exam date passed"} · ${esc(fmtDate(new Date(ed.date + "T12:00:00")))}</span>` : `<a class="btn small" href="#/progress" data-route="progress">Set your exam date</a>`}
        ${d.streak ? `<span class="chip">${plural(d.streak, "day")} in a row</span>` : ""}
      </div>
    </div>
    ${Store.mode === "local" && !Store.expectLocal ? `<div class="banner">${icon("warn")}<span>${esc(Store.note)}</span></div>` : ""}
    <div class="grid-hero">
      <section class="panel" aria-labelledby="h-ready">
        <div class="eyebrow" id="h-ready">Predicted score on new questions</div>
        <div class="hero-fig">
          ${r.enough ? `<div class="hero-num">${Math.round(r.predicted * 100)}%<small>± ${Math.max(1, Math.round(r.margin * 100))}</small></div>` : `<div class="hero-num empty-val">No score yet<small>${r.firstAttempts} of ${READINESS.minAnswers} first answers</small></div>`}
          <span class="verdict ${d.verdict.level}">${icon(vIcon)}${vLabel}</span>
        </div>
        ${d.verdict.gaps.length ? `<div class="stack"><div class="muted" style="font-size:13.5px">To reach “Ready”:</div><ul class="gap-list">${d.verdict.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></div>` : `<p class="muted">You meet every target this app sets. Book the exam while the material is fresh.</p>`}
        <p class="hint">Google does not publish a passing score. This app targets 80% on questions you have not seen before. <a href="#/progress" data-route="progress">How the score works</a></p>
      </section>
      <section class="panel" aria-labelledby="h-sections">
        <div class="panel-head"><h2 id="h-sections">By exam section</h2><span class="hint">Bar: predicted score · line: 80% target</span></div>
        ${sectionBars(r)}
      </section>
    </div>
    <div class="tiles">
      ${tile("Objectives done", d.objDone, OBJECTIVES.length, "study")}
      ${tile("Notes pages read", d.notesRead, NOTES.length, "study")}
      ${tile("Questions tried", r.firstAttempts, QS.length, "practice")}
      ${tile("Flashcards learned", d.cardsLearned, CARDS.length, "cards")}
      ${tile("Labs done", d.labsDone, LABS.length, "labs")}
    </div>
    <div class="grid-2">
      <section class="panel" aria-labelledby="h-next">
        <div class="panel-head"><h2 id="h-next">Next up</h2>${pace ? `<span class="hint">${esc(pace)}</span>` : ""}</div>
        <div class="actions">${nextActions(d).map(actionCard).join("")}</div>
      </section>
      <section class="panel" aria-labelledby="h-weak">
        <div class="panel-head"><h2 id="h-weak">Weak spots</h2><span class="hint">First-try and latest accuracy</span></div>
        ${weakList(d)}
      </section>
    </div>
    <div class="grid-2">
      <section class="panel" aria-labelledby="h-mocks">
        <div class="panel-head"><h2 id="h-mocks">Mock exam scores</h2><a href="#/mock" data-route="mock" class="btn small">${d.activeMock ? "Resume mock" : "Take a mock"}</a></div>
        ${mockChart(d.mocks)}
      </section>
      <section class="panel" aria-labelledby="h-activity">
        <div class="panel-head"><h2 id="h-activity">Study activity</h2><span class="hint">Last 12 weeks</span></div>
        ${heatmap(Store.data.activity.days || {})}
      </section>
    </div>
  </div>`;
};

function tile(label, value, total, route) {
  return `<a class="tile" href="#/${route}" data-route="${route}"><span class="tile-label">${esc(label)}</span><span class="tile-value">${value}<small> / ${total}</small></span>${meter(total ? value / total : 0)}</a>`;
}

function sectionBars(r) {
  const rows = SECTIONS.map((s) => {
    const p = r.perSection[s.id];
    const has = p.seen > 0;
    const v = has ? p.estimate : 0;
    const tip = has
      ? `<b>${Math.round(p.estimate * 100)}% predicted</b>Section ${s.id} · ${esc(SHORT[s.id])}<br>${p.firstRight} of ${p.seen} right on the first try; recent answers count more.`
      : `<b>No answers yet</b>Section ${s.id} · ${esc(SHORT[s.id])}`;
    return `<div class="bar-row">
      <div class="bar-label"><b>${s.id} · ${esc(SHORT[s.id])}</b><span>${s.weight}% of exam · ${p.seen}/${p.total} tried</span></div>
      <div class="bar-track" tabindex="0" data-tip="${esc(tip)}" aria-label="Section ${s.id}: ${has ? Math.round(v * 100) + "% predicted" : "no answers yet"}">
        ${has ? `<div class="bar-fill" style="width:${(v * 100).toFixed(1)}%"></div>` : ""}
        <div class="bar-target" style="left:calc(${READINESS.target * 100}% - 1px)"></div>
      </div>
      <div class="bar-val">${has ? Math.round(v * 100) + "%" : "–"}</div>
    </div>`;
  }).join("");
  return `<div class="bars">${rows}
    <div class="bar-axis" aria-hidden="true"><span></span><div class="scale"><span style="left:0">0%</span><span style="left:50%">50%</span><span style="left:80%">80%</span><span style="left:100%">100%</span></div><span></span></div>
  </div>`;
}

function nextActions(d) {
  const acts = [];
  const st = Store.data.state;
  if (d.activeMock) {
    const m = d.activeMock;
    const answered = Object.keys(m.answers || {}).length;
    acts.push({ icon: "timer", title: "Resume your mock exam", sub: `${answered} of ${m.qids.length} answered${m.minutes ? ` · ${fmtDur(m.minutes * 60 - (m.elapsedSec || 0))} left` : ""}`, attrs: `data-action="resume-mock" data-id="${m.id}"` });
  }
  const last = st.last && NOTE[st.last.note];
  if (last && !noteRead(last.id)) acts.push({ icon: "book", title: `Continue reading: ${last.title}`, sub: `Objective ${last.objective} · ${last.minutes} min`, attrs: `href="#/note/${last.id}" data-route="note/${last.id}"` });
  if (d.dueCount >= 3) acts.push({ icon: "target", title: `Review ${plural(d.dueCount, "due question")}`, sub: "Spaced review brings back questions you missed", attrs: `data-action="start-practice" data-kind="due" data-count="20"` });
  if (d.cardsDue >= 5) acts.push({ icon: "cards", title: `Review ${plural(d.cardsDue, "due flashcard")}`, sub: "Concepts and terms you missed or have not reviewed for a while", attrs: `data-action="start-cards" data-kind="due" data-count="20"` });
  const studying = OBJECTIVES.find((o) => objStatus(o.id) === 1);
  const nextObj = studying || OBJECTIVES.find((o) => objStatus(o.id) === 0);
  if (nextObj) {
    const pages = (NOTES_BY_OBJ[nextObj.id] || []).length;
    acts.push({ icon: "book", title: `${studying ? "Keep studying" : "Start"} ${nextObj.id}: ${nextObj.title}`, sub: `${plural(pages, "page")} · ${objMinutes(nextObj.id)} min · ${plural((QS_BY_OBJ[nextObj.id] || []).length, "question")}`, attrs: `href="#/objective/${nextObj.id}" data-route="objective/${nextObj.id}"` });
  }
  const setup = LAB["00-setup"];
  if (setup && !labDone(setup.id)) acts.push({ icon: "flask", title: "Set up your lab project", sub: `Lab 00 · ${setup.minutes} min · all labs use it`, attrs: `href="#/lab/${setup.id}" data-route="lab/${setup.id}"` });
  const lastMock = d.mocks[d.mocks.length - 1];
  if (!d.activeMock && d.ready.coverage >= 0.3 && (!lastMock || d.now - lastMock.finishedAt > 7 * DAY)) acts.push({ icon: "timer", title: "Take a mock exam", sub: "50 questions · 2 hours · 2 case studies", attrs: `href="#/mock" data-route="mock"` });
  const weak = weakObjectives(d.objStats)[0];
  if (weak) acts.push({ icon: "target", title: `Practice your weakest objective: ${weak.id}`, sub: `${OBJ[weak.id].title} · latest ${pct(weak.lastAcc)}`, attrs: `data-action="start-practice" data-kind="objective" data-id="${weak.id}" data-count="10"` });
  if (d.cardsNewRead >= 5) acts.push({ icon: "cards", title: "Learn the flashcards for pages you read", sub: `${plural(d.cardsNewRead, "new card")} from notes pages you marked as read`, attrs: `data-action="start-cards" data-kind="read" data-count="20"` });
  if (d.unseenCount) acts.push({ icon: "spark", title: "Practice 10 new questions", sub: `${d.unseenCount} questions you have not tried yet`, attrs: `data-action="start-practice" data-kind="mixed" data-count="10"` });
  return acts.slice(0, 4);
}
function actionCard(a) {
  const tag = a.attrs.includes("href=") ? "a" : "button";
  return `<${tag} class="action" ${a.attrs}${tag === "button" ? ' type="button"' : ""}><span class="ico">${icon(a.icon)}</span><span><b>${esc(a.title)}</b><span>${esc(a.sub)}</span></span><span class="go">${icon("arrow")}</span></${tag}>`;
}
function shortTitle(t) { return t.length > 64 ? t.slice(0, 61).replace(/\s+\S*$/, "") + "…" : t; }

function weakList(d) {
  const weak = weakObjectives(d.objStats, 3, 5);
  if (!weak.length) {
    const tried = Object.values(d.objStats).filter((o) => o.seen).length;
    return `<p class="empty">${tried ? "No weak objectives yet. An objective shows here when you answer 3 or more of its questions and score under 80%." : "Answer a few questions per objective. Weak objectives show here."}</p>`;
  }
  return `<div class="weak">${weak.map((w) => `<div class="weak-row">
    <span class="objid">${w.id}</span>
    <div><div class="t" title="${esc(OBJ[w.id].title)}">${esc(OBJ[w.id].title)}</div><div class="hint">First try ${pct(w.firstAcc)} · latest ${pct(w.lastAcc)} · ${w.seen}/${w.total} tried</div></div>
    <button type="button" class="btn small" data-action="start-practice" data-kind="objective" data-id="${w.id}" data-count="10">Practice</button>
  </div>`).join("")}</div>`;
}

function mockChart(mocks) {
  if (!mocks.length) return `<p class="empty">No mock exams yet. A mock exam has 50 questions in 2 hours, like the real exam. Take one after you finish about a third of the guide.</p>`;
  if (mocks.length === 1) {
    const m = mocks[0];
    return `<div class="stack"><div class="tile-value">${pct(m.score)}<small> on ${esc(fmtDateLong(m.finishedAt))}</small></div><p class="hint">Target: 80%. The trend line appears after your second mock exam.</p><a href="#/result/${m.id}" data-route="result/${m.id}">Review that exam</a></div>`;
  }
  // Narrow screens get a narrower drawing so the text keeps its size.
  const W = window.innerWidth < 640 ? Math.max(280, window.innerWidth - 90) : 520, H = 200, L = 40, R = 16, T = 14, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const x = (i) => L + (mocks.length === 1 ? pw / 2 : (i / (mocks.length - 1)) * pw);
  const y = (v) => T + (1 - v) * ph;
  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v * 100}%</text>`).join("");
  const target = `<line class="target-line" x1="${L}" x2="${W - R}" y1="${y(READINESS.target)}" y2="${y(READINESS.target)}"/><text class="axis-text" x="${L + 6}" y="${y(READINESS.target) - 5}">80% target</text>`;
  const pts = mocks.map((m, i) => [x(i), y(m.score)]);
  const line = `<path class="series" d="${pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")}"/>`;
  const area = `<path class="area" d="M${pts[0][0]} ${y(0)} ${pts.map((p) => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")} L${pts[pts.length - 1][0]} ${y(0)} Z"/>`;
  const xlabels = mocks.map((m, i) => (i === 0 || i === mocks.length - 1 || mocks.length <= 6) ? `<text class="axis-text" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(fmtDate(m.finishedAt))}</text>` : "").join("");
  const dots = mocks.map((m, i) => {
    const tip = `<b>${pct(m.score)}</b>${esc(fmtDateLong(m.finishedAt))}<br>${m.correct} of ${m.total} right${m.fresh && m.fresh.total ? ` · new questions ${pct(m.fresh.right / m.fresh.total)}` : ""}`;
    return `<g><circle class="pt" cx="${pts[i][0]}" cy="${pts[i][1]}" r="4.5"/><circle class="pt-hit" cx="${pts[i][0]}" cy="${pts[i][1]}" r="13" tabindex="0" data-tip="${esc(tip)}" data-route-click="result/${m.id}" aria-label="Mock exam ${esc(fmtDate(m.finishedAt))}: ${pct(m.score)}"/></g>`;
  }).join("");
  const lastP = pts[pts.length - 1];
  const lastLabel = `<text class="val-text" x="${lastP[0] - 8}" y="${lastP[1] - 10}" text-anchor="end">${pct(mocks[mocks.length - 1].score)}</text>`;
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mock exam scores over time">${grid}${target}<line class="base-line" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>${area}${line}${dots}${lastLabel}${xlabels}</svg></div>
    <p class="hint">Select a point to review that exam. <a href="#/progress" data-route="progress">Table view</a></p>`;
}

function heatmap(days) {
  const now = Date.now();
  const today = new Date(dayKey(now) + "T12:00:00");
  const end = new Date(today); end.setDate(end.getDate() + (6 - end.getDay())); // Saturday of this week
  const start = new Date(end); start.setDate(start.getDate() - 7 * 12 + 1); // a Sunday, 12 weeks back
  const parts = [];
  // Month labels: on the first week column that starts in a new month.
  const months = [];
  for (let c = 0; c < 12; c++) {
    const wk = new Date(start); wk.setDate(wk.getDate() + c * 7);
    const prev = new Date(wk); prev.setDate(prev.getDate() - 7);
    if (c === 0 || wk.getMonth() !== prev.getMonth()) months.push([c, wk]);
  }
  if (months.length > 1 && months[1][0] < 3) months.shift(); // no crowded first label
  for (const [c, wk] of months) parts.push(`<span class="m" style="grid-area:1/${c + 2}">${esc(wk.toLocaleDateString(undefined, { month: "short" }))}</span>`);
  for (const [label, row] of [["Mon", 1], ["Wed", 3], ["Fri", 5]]) parts.push(`<span class="d" style="grid-area:${row + 2}/1">${label}</span>`);
  let active = 0, i = 0;
  for (let t = new Date(start); t <= end; t.setDate(t.getDate() + 1), i++) {
    const area = `grid-area:${(i % 7) + 2}/${Math.floor(i / 7) + 2}`;
    if (t > today) { parts.push(`<i class="future" style="${area}"></i>`); continue; }
    const v = days[dayKey(t.getTime())] || {};
    const pts = (v.a || 0) + 5 * (v.r || 0) + 10 * (v.l || 0) + 0.5 * (v.f || 0);
    const lvl = pts <= 0 ? 0 : pts < 5 ? 1 : pts < 12 ? 2 : pts < 25 ? 3 : pts < 45 ? 4 : 5;
    if (pts > 0) active++;
    const tip = `<b>${esc(fmtDateLong(t.getTime()))}</b>${plural(v.a || 0, "question")} answered${v.a ? ` (${v.k || 0} right)` : ""}${v.f ? `<br>${plural(v.f, "flashcard")} reviewed` : ""}${v.r ? `<br>${plural(v.r, "notes page")} read` : ""}${v.l ? `<br>${plural(v.l, "lab")} done` : ""}`;
    parts.push(`<i data-l="${lvl}" style="${area}" data-tip="${esc(tip)}"></i>`);
  }
  return `<div class="stack"><div class="heat" role="img" aria-label="Study activity: ${active} active days in the last 12 weeks">${parts.join("")}</div>
    <div class="row"><span class="hint">${plural(active, "active day")} in 12 weeks</span><span class="spacer"></span><span class="heat-legend">Less <i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i><i style="background:var(--heat-5)"></i> More</span></div></div>`;
}

function logActivity(delta) {
  const k = dayKey(Date.now());
  const cur = (Store.data.activity.days || {})[k] || {};
  const next = { ...cur };
  for (const [f, v] of Object.entries(delta)) next[f] = (cur[f] || 0) + v;
  Store.patch("activity", { days: { [k]: next } });
}

// ---------- study guide ----------
VIEWS.study = function () {
  const d = derived();
  return `<div class="page narrow">
    <div class="page-head"><div><h1>Study guide</h1><p>Organized by the official exam guide v6.1: 6 sections, 22 objectives. Each objective has notes pages grounded in Google Cloud documentation, labs, and practice questions.</p></div></div>
    ${SECTIONS.map((s) => {
      const objs = EXAM.sections.find((x) => x.id === s.id).objectives;
      const done = objs.filter((o) => objStatus(o.id) === 2).length;
      return `<section class="section-block" aria-labelledby="sec-${s.id}">
        <div class="section-head"><span class="n">${s.id}</span><h2 id="sec-${s.id}">${esc(s.title)}</h2><span class="w">~${s.weight}% · ${done}/${objs.length} done</span></div>
        <div class="obj-list">${objs.map((o) => {
          const notes = NOTES_BY_OBJ[o.id] || [];
          const read = notes.filter((n) => noteRead(n.id)).length;
          const os = d.objStats[o.id];
          return `<a class="obj-row" href="#/objective/${o.id}" data-route="objective/${o.id}">
            <span class="id">${o.id}</span>
            <span><span class="title">${esc(o.title)}</span><span class="meta"><span>${read}/${notes.length} pages read</span><span>${objMinutes(o.id)} min</span><span>${os ? `${os.seen}/${os.total} questions tried` : "no questions yet"}</span>${(LABS_BY_OBJ[o.id] || []).length ? `<span>${plural(LABS_BY_OBJ[o.id].length, "lab")}</span>` : ""}</span></span>
            <span class="end">${statusChip(objStatus(o.id))}</span>
          </a>`;
        }).join("")}</div>
      </section>`;
    }).join("")}
    ${REFS.length ? `<section class="section-block" aria-labelledby="sec-ref">
      <div class="section-head"><span class="n">${icon("book")}</span><h2 id="sec-ref">Reference</h2><span class="w">${plural(REFS.length, "page")}</span></div>
      <p class="hint">Product names change often, and exam questions can use the old names.</p>
      <div class="obj-list">${REFS.map((r) => `<a class="obj-row" href="#/ref/${r.id}" data-route="ref/${r.id}">
        <span class="id">Ref</span>
        <span><span class="title">${esc(r.title)}</span><span class="meta"><span>${Math.max(2, Math.round(r.words / 200))} min</span></span></span>
        <span class="end">${icon("arrow")}</span>
      </a>`).join("")}</div>
    </section>` : ""}
  </div>`;
};

VIEWS.ref = function ({ id }) {
  const r = REF[id];
  if (!r) return notFound("page");
  return `<div class="page">
    ${crumbs([["Study guide", "study"], ["Reference", null]])}
    ${titleBlock({ sheet: "Ref", title: r.title, cells: [["Reading", `${Math.max(2, Math.round(r.words / 200))} min`], ["Type", "Reference table"]] })}
    <div class="reader${r.toc.length > 1 ? "" : " solo"}">
      <article class="prose" id="article">${r.html}</article>
      ${r.toc.length > 1 ? `<nav class="toc" aria-label="On this page"><span class="eyebrow">On this page</span>${r.toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.text)}</a>`).join("")}</nav>` : ""}
    </div>
    <div class="reader-foot panel"><a class="btn ghost" href="#/study" data-route="study">Back to the study guide</a></div>
  </div>`;
};

VIEWS.objective = function ({ id }) {
  const o = OBJ[id];
  if (!o) return notFound("objective");
  const s = SEC[o.section];
  const d = derived();
  const notes = NOTES_BY_OBJ[id] || [];
  const also = (NOTES_ALSO[id] || []).filter((n) => n.objective !== id);
  const labs = LABS_BY_OBJ[id] || [];
  const os = d.objStats[id] || { total: 0, seen: 0, due: 0, firstAcc: null, lastAcc: null };
  const cos = d.cardObjStats[id] || { total: 0, seen: 0, due: 0, mastered: 0 };
  const caseQs = (QS_BY_OBJ[id] || []).filter((q) => q.caseStudy).length;
  const status = objStatus(id), conf = objConf(id);
  const pageItem = (n) => `<a class="page-item" href="#/note/${n.id}" data-route="note/${n.id}">
      <span class="${noteRead(n.id) ? "read" : "unread"}">${icon(noteRead(n.id) ? "s2" : "s0")}</span>
      <span><span class="t">${esc(n.title)}</span><span class="s"> · ${n.minutes} min</span></span>
      <span class="objid">${n.objective}</span></a>`;
  return `<div class="page narrow">
    ${crumbs([["Study guide", "study"], [`Section ${s.id}`, null], [o.id, null]])}
    ${titleBlock({ sheet: o.id, title: o.title, cells: [["Section", `${s.id} · ${s.weight}%`], ["Reading", `${objMinutes(id)} min`], ["Questions", String(os.total)]] })}
    <section class="panel">
      <div class="panel-head"><h2>Your status</h2>
        <div class="seg" role="group" aria-label="Objective status">${STATUS.map((st, i) => `<button type="button" data-action="obj-status" data-id="${id}" data-s="${i}" aria-pressed="${status === i}">${icon(st.icon)}${st.label}</button>`).join("")}</div>
      </div>
      <div class="row"><span class="muted">Confidence</span><div class="conf" role="group" aria-label="Confidence from 1 to 5">${[1, 2, 3, 4, 5].map((c) => `<button type="button" data-action="obj-conf" data-id="${id}" data-c="${c}" aria-pressed="${conf === c}" title="${["", "Lost", "Shaky", "OK", "Solid", "Could teach it"][c]}">${c}</button>`).join("")}</div><span class="hint">1 = lost, 5 = could teach it</span></div>
    </section>
    <section class="panel">
      <h2>What the exam guide lists</h2>
      ${o.considerations.length ? `<ul class="guide-list">${o.considerations.map((c) => `<li><span>${esc(c)}</span></li>`).join("")}</ul>` : `<p class="muted">The exam guide lists this objective without sub-bullets.</p>`}
      <p class="hint">Verbatim from the <a class="ext" href="${esc(EXAM.guideUrl)}" target="_blank" rel="noopener">official exam guide</a>.</p>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Read</h2><span class="hint">${notes.filter((n) => noteRead(n.id)).length}/${notes.length} read</span></div>
      ${notes.length ? `<div class="page-list">${notes.map(pageItem).join("")}</div>` : `<p class="empty">Notes for this objective are not written yet.</p>`}
      ${also.length ? `<div class="eyebrow">Also relevant</div><div class="page-list">${also.map(pageItem).join("")}</div>` : ""}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Practice</h2><span class="hint">${os.seen}/${os.total} tried${os.seen ? ` · first try ${pct(os.firstAcc)} · latest ${pct(os.lastAcc)}` : ""}${os.due ? ` · ${os.due} due` : ""}</span></div>
      <div class="row">
        <button type="button" class="btn primary" data-action="start-practice" data-kind="objective" data-id="${id}" data-count="10"${os.total ? "" : " disabled"}>Practice 10 questions</button>
        ${os.due ? `<button type="button" class="btn" data-action="start-practice" data-kind="objective-due" data-id="${id}" data-count="20">Review ${os.due} due</button>` : ""}
        ${caseQs ? `<span class="hint">${plural(caseQs, "case-study question")} included</span>` : ""}
      </div>
    </section>
    ${cos.total ? `<section class="panel">
      <div class="panel-head"><h2>Flashcards</h2><span class="hint">${cos.seen}/${cos.total} seen · ${cos.mastered} learned${cos.due ? ` · ${cos.due} due` : ""}</span></div>
      <div class="row">
        <button type="button" class="btn" data-action="start-cards" data-kind="objective" data-id="${id}" data-count="20">${icon("cards")}Study ${Math.min(20, cos.total)} cards</button>
        ${cos.due ? `<button type="button" class="btn" data-action="start-cards" data-kind="objective-due" data-id="${id}" data-count="${cos.due}">Review ${cos.due} due</button>` : ""}
        <a class="btn ghost" href="#/browse/${id}" data-route="browse/${id}">Browse all ${cos.total}</a>
      </div>
    </section>` : ""}
    ${labs.length ? `<section class="panel"><h2>Hands-on</h2><div class="card-list">${labs.map(labRow).join("")}</div></section>` : ""}
  </div>`;
};

VIEWS.note = function ({ id }) {
  const n = NOTE[id];
  if (!n) return notFound("page");
  const o = OBJ[n.objective];
  const siblings = NOTES_BY_OBJ[n.objective] || [];
  const idx = siblings.findIndex((x) => x.id === id);
  const next = siblings[idx + 1] || NOTES[NOTES.indexOf(n) + 1];
  const read = noteRead(id);
  const nCards = (CARDS_BY_NOTE[id] || []).length;
  if (Store.data.state.last?.note !== id) queueMicrotask(() => Store.patch("state", { last: { note: id, t: Date.now() } }));
  return `<div class="page">
    ${crumbs([["Study guide", "study"], [`${o.id} ${shortTitle(o.title)}`, `objective/${o.id}`], [`Page ${idx + 1} of ${siblings.length}`, null]])}
    ${titleBlock({ sheet: `${o.id}.${idx + 1}`, title: n.title, cells: [["Reading", `${n.minutes} min`], ["Revised", esc(n.verified || "–")], ["Also for", n.also.length ? n.also.map((a) => `<a href="#/objective/${a}" data-route="objective/${a}">${a}</a>`).join(" ") : "–"]] })}
    <div class="reader${n.toc.length ? "" : " solo"}">
      <article class="prose" id="article">${n.html}</article>
      ${n.toc.length ? `<nav class="toc" aria-label="On this page"><span class="eyebrow">On this page</span>${n.toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.text)}</a>`).join("")}</nav>` : ""}
    </div>
    <div class="reader-foot panel">
      <div class="row">
        <button type="button" class="btn ${read ? "" : "primary"}" data-action="note-read" data-id="${id}" aria-pressed="${read}">${icon(read ? "s2" : "check")}${read ? "Read" : "Mark as read"}</button>
        <button type="button" class="btn" data-action="start-practice" data-kind="objective" data-id="${o.id}" data-count="10">Practice ${o.id}</button>
        ${nCards ? `<button type="button" class="btn" data-action="start-cards" data-kind="note" data-id="${id}" data-count="${nCards}">${icon("cards")}${plural(nCards, "flashcard")}</button>` : ""}
      </div>
      ${next ? `<a class="btn ghost" href="#/note/${next.id}" data-route="note/${next.id}">Next: ${esc(shortTitle(next.title))} ${icon("arrow")}</a>` : `<a class="btn ghost" href="#/study" data-route="study">Back to the study guide</a>`}
    </div>
  </div>`;
};

function notFound(what) {
  return `<div class="page narrow"><div class="panel"><h2>This ${esc(what)} is not in the guide yet</h2><p class="muted">The content may not be written yet, or the link is out of date.</p><a class="btn" href="#/home" data-route="home">Go to the dashboard</a></div></div>`;
}

// ---------- practice ----------
VIEWS.practice = function () {
  const d = derived();
  const c = ui.practiceCount;
  const quick = [
    ["due", "Due for review", d.dueCount, "Questions you missed or have not reviewed for a while."],
    ["mixed", "New questions", d.unseenCount, "Questions you have not tried, across all sections."],
    ["missed", "Missed last time", d.missedCount, "Your latest answer was wrong."],
    ["flagged", "Flagged", d.flaggedCount, "Questions you flagged for later."],
  ];
  return `<div class="page narrow">
    <div class="page-head"><div><h1>Practice</h1><p>Answer, then see the explanation and the documentation that supports it. Missed questions come back for spaced review.</p></div>
      <div class="seg" role="group" aria-label="Questions per session">${[10, 20, 30].map((n) => `<button type="button" data-action="set-count" data-n="${n}" aria-pressed="${c === n}">${n} questions</button>`).join("")}</div>
    </div>
    <div class="grid-2">${quick.map(([k, label, n, sub]) => `<button type="button" class="action" data-action="start-practice" data-kind="${k}" data-count="${c}"${n ? "" : " disabled"}><span class="ico">${icon(k === "due" ? "target" : k === "flagged" ? "flag" : k === "missed" ? "x" : "spark")}</span><span><b>${esc(label)} · ${n}</b><span>${esc(sub)}</span></span><span class="go">${icon("arrow")}</span></button>`).join("")}</div>
    <section class="panel">
      <h2>By exam section</h2>
      <div class="scroll-x"><table class="data-table"><thead><tr><th>Section</th><th class="n">Weight</th><th class="n">Tried</th><th class="n">First try</th><th></th></tr></thead><tbody>
      ${SECTIONS.map((s) => { const p = d.ready.perSection[s.id]; return `<tr><td><b>${s.id}</b> · ${esc(SHORT[s.id])}</td><td class="n">${s.weight}%</td><td class="n">${p.seen}/${p.total}</td><td class="n">${p.seen ? pct(p.accuracy) : "–"}</td><td class="n"><button type="button" class="btn small" data-action="start-practice" data-kind="section" data-id="${s.id}" data-count="${c}"${p.total ? "" : " disabled"}>Start</button></td></tr>`; }).join("")}
      </tbody></table></div>
    </section>
    <section class="panel">
      <h2>By objective</h2>
      <div class="scroll-x"><table class="data-table"><thead><tr><th>Objective</th><th class="n">Tried</th><th class="n">First try</th><th class="n">Latest</th><th class="n">Due</th><th></th></tr></thead><tbody>
      ${OBJECTIVES.map((o) => { const os = d.objStats[o.id] || { total: 0, seen: 0, due: 0 }; return `<tr><td><span class="objid">${o.id}</span> ${esc(o.title)}</td><td class="n">${os.seen}/${os.total}</td><td class="n">${os.seen ? pct(os.firstAcc) : "–"}</td><td class="n">${os.seen ? pct(os.lastAcc) : "–"}</td><td class="n">${os.due || ""}</td><td class="n"><button type="button" class="btn small" data-action="start-practice" data-kind="objective" data-id="${o.id}" data-count="${c}"${os.total ? "" : " disabled"}>Start</button></td></tr>`; }).join("")}
      </tbody></table></div>
    </section>
    <section class="panel">
      <h2>By case study</h2>
      <div class="row">${CASES.map((cs) => `<button type="button" class="btn" data-action="start-practice" data-kind="case" data-id="${cs.id}" data-count="${c}"${(QS_BY_CASE[cs.id] || []).length ? "" : " disabled"}>${esc(cs.name)} · ${(QS_BY_CASE[cs.id] || []).length}</button>`).join("")}</div>
    </section>
  </div>`;
};

function startPractice({ kind, id, ids, count }) {
  const now = Date.now();
  const qs = qstats();
  let scope = { kind, id, ids };
  if (kind === "objective-due") scope = { kind: "ids", ids: (QS_BY_OBJ[id] || []).filter((q) => isDue(qs[q.id], now)).map((q) => q.id) };
  const picked = pickPractice(QS, qs, scope, Number(count) || 10, now);
  if (!picked.length) { toast("No questions match this choice yet."); return; }
  const label = { due: "Spaced review", mixed: "New questions", missed: "Missed last time", flagged: "Flagged", objective: `Objective ${id}`, "objective-due": `Objective ${id} · due`, section: `Section ${id} · ${SHORT[id] || ""}`, case: CASE[id]?.name || "Case study" }[kind] || "Practice";
  const seed = (now % 2147483647) >>> 0;
  const rng = mulberry32(seed);
  ui.quiz = {
    label, qids: picked.map((q) => q.id), i: 0, sel: {}, done: {}, right: {},
    orders: Object.fromEntries(picked.map((q) => [q.id, shuffle(q.options.map((o) => o.id), rng)])),
    showCase: true, finished: false, startedAt: now,
  };
  go("quiz");
}

function optionList(q, order, sel, { reveal = false, disabled = false } = {}) {
  const multi = q.type === "multi";
  return `<div class="opts" role="group" aria-label="Answer options">${order.map((oid, i) => {
    const o = q.options.find((x) => x.id === oid);
    const picked = sel.includes(oid);
    const right = q.answer.includes(oid);
    let cls = "opt" + (multi ? " multi" : "");
    let mark = "";
    if (reveal) {
      if (right) { cls += " is-right"; mark = `<span class="mark">${icon("check")}${picked ? "Your answer · correct" : "Correct answer"}</span>`; }
      else if (picked) { cls += " is-wrong"; mark = `<span class="mark">${icon("x")}Your answer</span>`; }
    }
    return `<button type="button" class="${cls}" data-action="pick" data-opt="${oid}" aria-pressed="${picked}"${disabled || reveal ? " disabled" : ""}><span class="letter">${LETTERS[i]}</span><span>${o ? o.html : ""}</span>${mark}</button>`;
  }).join("")}</div>`;
}

function explanationBlock(q, order) {
  const letterOf = (oid) => LETTERS[order.indexOf(oid)] || oid;
  const wrong = order.filter((oid) => !q.answer.includes(oid));
  const notes = (NOTES_BY_OBJ[q.objective] || []);
  return `<div class="explain">${q.explanation}</div>
    ${wrong.length ? `<div class="stack"><div class="eyebrow">Why the other options are wrong</div><ul class="why">${wrong.map((oid) => `<li><span class="letter">${letterOf(oid)}</span><span>${q.whyWrong[oid] || ""}</span></li>`).join("")}</ul></div>` : ""}
    ${q.sources.length ? `<div class="stack"><div class="eyebrow">Grounded in the docs</div><div class="sources">${q.sources.map((s) => `<div class="source">${s.evidence ? `<q>${esc(s.evidence)}</q>` : ""}<a class="ext" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></div>`).join("")}</div></div>` : ""}
    ${notes.length ? `<div class="row"><span class="hint">Study:</span>${notes.map((n) => `<a href="#/note/${n.id}" data-route="note/${n.id}">${esc(n.title)}</a>`).join('<span class="faint">·</span>')}</div>` : ""}`;
}

function qMeta(q, extra = "") {
  const o = OBJ[q.objective];
  return `<div class="qmeta">
    <a class="chip plain" href="#/objective/${o.id}" data-route="objective/${o.id}" title="${esc(o.title)}"><span class="objid">${o.id}</span> ${esc(shortTitle(o.title).slice(0, 44))}${o.title.length > 44 ? "…" : ""}</a>
    ${q.caseStudy ? `<span class="chip accent">${icon("case")}${esc(CASE[q.caseStudy]?.name || q.caseStudy)}</span>` : ""}
    ${q.type === "multi" ? `<span class="chip warn">Choose ${q.answer.length === 3 ? "three" : "two"}</span>` : ""}
    <span class="chip" title="Difficulty">${"●".repeat(q.difficulty)}${"○".repeat(3 - q.difficulty)}</span>
    ${extra}
  </div>`;
}

function casePane(q, show) {
  if (!q.caseStudy || !show) return "";
  const c = CASE[q.caseStudy];
  return `<aside class="case-pane" aria-label="Case study"><div class="case-pane-head eyebrow">Case study · ${esc(c?.name || q.caseStudy)}</div>${c?.textHtml || `<p>Case study text is not available.</p>`}</aside>`;
}

VIEWS.quiz = function () {
  const z = ui.quiz;
  if (!z) return VIEWS.practice();
  if (z.finished) return quizSummary(z);
  const qid = z.qids[z.i];
  const q = Q[qid];
  const sel = z.sel[qid] || [];
  const done = !!z.done[qid];
  const need = q.type === "multi" ? q.answer.length : 1;
  const answered = Object.keys(z.done).length;
  const rightCount = Object.values(z.right).filter(Boolean).length;
  const flagged = !!qstats()[qid]?.fl;
  const showCase = q.caseStudy && z.showCase;
  return `<div class="page quiz${showCase ? "" : " narrow"}">
    <div class="quiz-bar">
      <span class="pos">${z.i + 1} / ${z.qids.length}</span>
      <div class="progress-line" aria-hidden="true"><i style="width:${(answered / z.qids.length) * 100}%"></i></div>
      <span class="muted">${esc(z.label)} · ${rightCount}/${answered} right</span>
      <button type="button" class="btn small" data-action="end-quiz">End session</button>
    </div>
    <div class="qlayout${showCase ? " with-case" : ""}">
      <div class="qcard">
        ${qMeta(q, `<span class="spacer"></span>${q.caseStudy ? `<button type="button" class="btn small" data-action="toggle-case">${z.showCase ? "Hide" : "Show"} case study</button>` : ""}<button type="button" class="btn small" data-action="toggle-flag" data-id="${qid}" aria-pressed="${flagged}">${icon("flag")}${flagged ? "Flagged" : "Flag"}</button>`)}
        <div class="stem">${q.stem}</div>
        ${optionList(q, z.orders[qid], sel, { reveal: done })}
        ${done ? `<div class="feedback">
            <div class="result-banner ${z.right[qid] ? "right" : "wrong"}">${icon(z.right[qid] ? "check" : "x")}${z.right[qid] ? "Correct" : "Not quite"}</div>
            ${explanationBlock(q, z.orders[qid])}
          </div>` : ""}
        <div class="q-actions">
          ${done
            ? `<button type="button" class="btn primary" data-action="next-q">${z.i + 1 < z.qids.length ? "Next question" : "See results"} ${icon("arrow")}</button>`
            : `<button type="button" class="btn primary" data-action="submit-answer"${sel.length === need ? "" : " disabled"}>Check answer</button><span class="kbd-hint">${need > 1 ? `Select ${need} options. ` : ""}Keys: <kbd>A</kbd>–<kbd>${LETTERS[q.options.length - 1]}</kbd> select, <kbd>Enter</kbd> check</span>`}
        </div>
      </div>
      ${casePane(q, showCase)}
    </div>
  </div>`;
};

function quizSummary(z) {
  const ids = z.qids.filter((id) => z.done[id]);
  const right = ids.filter((id) => z.right[id]);
  const wrong = ids.filter((id) => !z.right[id]);
  const byObj = {};
  for (const id of ids) { const o = Q[id].objective; (byObj[o] ||= { r: 0, t: 0 }); byObj[o].t++; if (z.right[id]) byObj[o].r++; }
  return `<div class="page narrow">
    <div class="page-head"><div><div class="eyebrow">${esc(z.label)}</div><h1>${ids.length ? `${right.length} of ${ids.length} right` : "No questions answered"}</h1><p>${ids.length ? `${pct(right.length / ids.length)} in this session. Missed questions come back in spaced review.` : ""}</p></div></div>
    ${ids.length ? `<section class="panel"><h2>By objective</h2><div class="scroll-x"><table class="data-table"><thead><tr><th>Objective</th><th class="n">Right</th><th></th></tr></thead><tbody>${Object.entries(byObj).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([o, v]) => `<tr><td><span class="objid">${o}</span> ${esc(OBJ[o].title)}</td><td class="n">${v.r}/${v.t}</td><td class="n"><a href="#/objective/${o}" data-route="objective/${o}">Study</a></td></tr>`).join("")}</tbody></table></div></section>` : ""}
    ${wrong.length ? `<section class="panel"><h2>Missed</h2><div class="page-list">${wrong.map((id) => `<div class="page-item"><span class="unread">${icon("x")}</span><span class="t">${esc(stemText(Q[id]))}</span><span class="objid">${Q[id].objective}</span></div>`).join("")}</div>
      <div class="row"><button type="button" class="btn primary" data-action="retry-missed">Try the missed questions again</button></div></section>` : ""}
    <div class="row"><a class="btn" href="#/practice" data-route="practice">Back to practice</a><a class="btn ghost" href="#/home" data-route="home">Dashboard</a></div>
  </div>`;
}
function stemText(q) {
  const t = q.stem.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 137).replace(/\s+\S*$/, "") + "…" : t;
}

function recordAnswer(qid, ok) {
  const now = Date.now();
  const prev = qstats()[qid];
  Store.patch("qstats", { q: { [qid]: applyAnswer(prev, ok, now) } });
  logActivity({ a: 1, k: ok ? 1 : 0 });
}

// ---------- flashcards ----------
VIEWS.cards = function () {
  const d = derived();
  const n = ui.cardCount;
  const quick = [
    ["due", "Due for review", d.cardsDue, "Cards you missed or have not reviewed for a while.", "target"],
    ["read", "New from pages you read", d.cardsNewRead, "Cards you have not seen, from notes pages you marked as read.", "book"],
    ["new", "All new cards", d.cardsNew, "Cards you have not seen, from every notes page.", "spark"],
    ["missed", "Missed last time", d.cardsMissed, "Your latest grade was “Again”.", "x"],
  ];
  return `<div class="page narrow">
    <div class="page-head"><div><h1>Flashcards</h1><p>Concepts and terms from the notes pages. Answer in your head, show the answer, then grade yourself. Cards you miss come back for spaced review.</p></div>
      <div class="seg" role="group" aria-label="Cards per session">${[10, 20, 30].map((c) => `<button type="button" data-action="set-card-count" data-n="${c}" aria-pressed="${n === c}">${c} cards</button>`).join("")}</div>
    </div>
    <div class="tiles two">
      ${tile("Cards seen", CARDS.length - d.cardsNew, CARDS.length, "browse")}
      ${tile("Cards learned", d.cardsLearned, CARDS.length, "browse")}
    </div>
    <div class="grid-2">${quick.map(([k, label, count, sub, ic]) => `<button type="button" class="action" data-action="start-cards" data-kind="${k}" data-count="${n}"${count ? "" : " disabled"}><span class="ico">${icon(ic)}</span><span><b>${esc(label)} · ${count}</b><span>${esc(sub)}</span></span><span class="go">${icon("arrow")}</span></button>`).join("")}</div>
    <section class="panel">
      <div class="panel-head"><h2>By objective</h2><a class="btn small" href="#/browse" data-route="browse">Browse all ${CARDS.length} cards</a></div>
      <div class="scroll-x"><table class="data-table"><thead><tr><th>Objective</th><th class="n">Cards</th><th class="n">Seen</th><th class="n">Learned</th><th class="n">Due</th><th></th></tr></thead><tbody>
      ${OBJECTIVES.map((o) => { const cs = d.cardObjStats[o.id] || { total: 0, seen: 0, mastered: 0, due: 0 }; return `<tr><td><a href="#/browse/${o.id}" data-route="browse/${o.id}"><span class="objid">${o.id}</span></a> ${esc(o.title)}</td><td class="n">${cs.total}</td><td class="n">${cs.seen}</td><td class="n">${cs.mastered}</td><td class="n">${cs.due || ""}</td><td class="n"><button type="button" class="btn small" data-action="start-cards" data-kind="objective" data-id="${o.id}" data-count="${n}"${cs.total ? "" : " disabled"}>Study</button></td></tr>`; }).join("")}
      </tbody></table></div>
      <p class="hint">A card is learned when it reaches the ${BOX_DAYS[3]}-day review interval. Flashcards do not change the predicted score.</p>
    </section>
  </div>`;
};

function startCards({ kind, id, ids, count }) {
  const now = Date.now();
  const cs = cstats();
  let scope = { kind, id, ids };
  if (kind === "new") scope = { kind: "unseen" };
  if (kind === "read") scope = { kind: "ids", ids: CARDS.filter((c) => !cs[c.id]?.n && noteRead(c.note)).map((c) => c.id) };
  if (kind === "note") scope = { kind: "ids", ids: (CARDS_BY_NOTE[id] || []).map((c) => c.id) };
  if (kind === "objective-due") scope = { kind: "ids", ids: (CARDS_BY_OBJ[id] || []).filter((c) => isDue(cs[c.id], now)).map((c) => c.id) };
  const picked = pickPractice(CARDS, cs, scope, Number(count) || 20, now);
  if (!picked.length) { toast("No cards match this choice yet."); return; }
  const label = { due: "Spaced review", read: "New from pages you read", new: "New cards", missed: "Missed last time", objective: `Objective ${id}`, "objective-due": `Objective ${id} · due`, note: NOTE[id]?.title || "Notes page", ids: "Missed cards" }[kind] || "Flashcards";
  ui.flash = { label, ids: picked.map((c) => c.id), i: 0, shown: false, grades: {}, finished: false };
  go("flash");
}

VIEWS.flash = function () {
  const f = ui.flash;
  if (!f) return VIEWS.cards();
  const c = CARD[f.ids[f.i]];
  if (f.finished || !c) return flashSummary(f);
  const graded = Object.keys(f.grades).length;
  const known = Object.values(f.grades).filter(Boolean).length;
  const o = OBJ[c.objective], n = NOTE[c.note];
  const st = cstats()[c.id];
  const now = Date.now();
  const nextIn = (ok) => { const days = Math.round((applyAnswer(st, ok, now).d - now) / DAY); return days ? `Next in ${plural(days, "day")}` : "Due again now"; };
  return `<div class="page narrow quiz">
    <div class="quiz-bar">
      <span class="pos">${f.i + 1} / ${f.ids.length}</span>
      <div class="progress-line" aria-hidden="true"><i style="width:${(graded / f.ids.length) * 100}%"></i></div>
      <span class="muted">${esc(f.label)} · ${known}/${graded} known</span>
      <button type="button" class="btn small" data-action="end-flash">End session</button>
    </div>
    <article class="fcard${f.shown ? " shown" : ""}" aria-label="Flashcard ${f.i + 1} of ${f.ids.length}">
      <header class="fcard-head">
        <span class="fcard-kind">${c.kind === "term" ? "Term" : "Concept"}</span>
        <a class="objid" href="#/objective/${o.id}" data-route="objective/${o.id}" title="${esc(o.title)}">${o.id}</a>
        <span class="spacer"></span>
        ${st?.n ? `<span class="hint">Seen ${plural(st.n, "time")}${st.l ? "" : " · missed last time"}</span>` : `<span class="chip accent">New</span>`}
      </header>
      <div class="fcard-face">
        <div class="fcard-front ${c.kind}">${c.front}</div>
        ${f.shown ? "" : `<p class="fcard-cue">${c.kind === "term" ? "What is it, and when do you use it?" : "Answer in your head, then show the answer."}</p>`}
      </div>
      ${f.shown ? `<div class="fcard-back">
          <p class="fcard-answer">${c.back}</p>
          ${c.aws ? `<p class="fcard-aws"><span class="eyebrow">AWS</span><span>${c.aws}</span></p>` : ""}
          ${c.source ? `<div class="source">${c.source.evidence ? `<q>${esc(c.source.evidence)}</q>` : ""}<a class="ext" href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.title)}</a></div>` : ""}
          <div class="row"><span class="hint">Study:</span><a href="#/note/${n.id}" data-route="note/${n.id}">${esc(n.title)}</a></div>
        </div>
        <div class="fcard-grade" role="group" aria-label="Grade yourself">
          <button type="button" class="grade again" data-action="grade-card" data-ok="0"><span class="g-top"><kbd>1</kbd><b>Again</b></span><span class="g-sub">${nextIn(false)}</span></button>
          <button type="button" class="grade good" data-action="grade-card" data-ok="1"><span class="g-top"><kbd>2</kbd><b>Got it</b></span><span class="g-sub">${nextIn(true)}</span></button>
        </div>`
      : `<div class="fcard-actions"><button type="button" class="btn primary" data-action="flip-card">Show answer</button><span class="kbd-hint">Keys: <kbd>Space</kbd> show the answer, then <kbd>1</kbd> again or <kbd>2</kbd> got it</span></div>`}
    </article>
  </div>`;
};

function flashSummary(f) {
  const ids = f.ids.filter((id) => f.grades[id] != null && CARD[id]);
  const missed = ids.filter((id) => !f.grades[id]);
  const known = ids.length - missed.length;
  return `<div class="page narrow">
    <div class="page-head"><div><div class="eyebrow">${esc(f.label)}</div><h1>${ids.length ? `${known} of ${plural(ids.length, "card")} known` : "No cards graded"}</h1><p>${!ids.length ? "" : missed.length ? "The cards you missed are due again now. They stay in spaced review until you know them." : "You knew every card. Each one comes back after a longer interval."}</p></div></div>
    ${missed.length ? `<section class="panel"><h2>Missed</h2><div class="fc-list">${missed.map((id) => cardItem(CARD[id])).join("")}</div>
      <div class="row"><button type="button" class="btn primary" data-action="retry-cards">Review the missed cards again</button></div></section>` : ""}
    <div class="row"><a class="btn" href="#/cards" data-route="cards">Back to flashcards</a><a class="btn ghost" href="#/home" data-route="home">Dashboard</a></div>
  </div>`;
}

function recordCard(id, ok) {
  Store.patch("cards", { c: { [id]: applyAnswer(cstats()[id], ok, Date.now()) } });
  logActivity({ f: 1 });
}

// Card state marks in the card list: the shape carries the state, not only the color.
const CARD_MARK = { new: ["s0", "New"], seen: ["s1", "Seen"], due: ["timer", "Due"], learned: ["s2", "Learned"] };
function cardItem(c, { status = false } = {}) {
  let mark = "";
  if (status) {
    const st = cstats()[c.id];
    const k = !st?.n ? "new" : (st.b || 0) >= 3 ? "learned" : isDue(st, Date.now()) ? "due" : "seen";
    mark = `<span class="fc-mark ${k}" title="${CARD_MARK[k][1]}">${icon(CARD_MARK[k][0])}<span class="sr-only">${CARD_MARK[k][1]}</span></span>`;
  }
  return `<div class="fc-item">
    <div class="fc-item-front">${mark}<span>${c.front}</span></div>
    <div class="fc-item-back"><span>${c.back}</span>${c.aws ? `<span class="fc-item-aws"><span class="eyebrow">AWS</span> ${c.aws}</span>` : ""}</div>
  </div>`;
}

// Plain text of each card for search, built on first use.
const CARD_TEXT = {};
const textBox = document.createElement("div");
function cardText(c) {
  if (!(c.id in CARD_TEXT)) { textBox.innerHTML = `${c.front} ${c.back} ${c.aws || ""}`; CARD_TEXT[c.id] = textBox.textContent.toLowerCase(); }
  return CARD_TEXT[c.id];
}

VIEWS.browse = function ({ id }) {
  const o = id ? OBJ[id] : null;
  if (id && !o) return notFound("objective");
  return `<div class="page narrow">
    ${crumbs([["Flashcards", "cards"], [o ? `Objective ${o.id}` : "All cards", null]])}
    <div class="page-head"><div><h1>${o ? `${esc(o.id)} · ${esc(o.title)}` : "All cards"}</h1><p>Each card with its answer, grouped by notes page. The search looks at both sides of each card.</p></div></div>
    <div class="browse-bar">
      <div class="field"><label for="card-search">Search</label><input type="search" id="card-search" data-input="card-search" value="${esc(ui.browseQ)}" placeholder="For example: Private Service Connect" autocomplete="off" spellcheck="false"></div>
      <div class="field"><label for="card-obj">Objective</label><select id="card-obj" data-change="browse-obj"><option value="">All objectives</option>${OBJECTIVES.map((x) => `<option value="${x.id}"${x.id === id ? " selected" : ""}>${x.id} · ${esc(shortTitle(x.title))}</option>`).join("")}</select></div>
    </div>
    <div id="card-results">${browseResults(id, ui.browseQ)}</div>
  </div>`;
};

function browseResults(objId, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const list = (objId ? CARDS_BY_OBJ[objId] || [] : CARDS).filter((c) => words.every((w) => cardText(c).includes(w)));
  if (!list.length) return `<p class="empty">${words.length ? "No cards match this search." : "No flashcards for this objective yet."}</p>`;
  const legend = Object.entries(CARD_MARK).map(([k, [ic, label]]) => `<span class="fc-mark ${k}">${icon(ic)}</span>${label}`).join("");
  return `<div class="row fc-legend"><span class="hint" role="status">${plural(list.length, "card")}${words.length ? " match" + (list.length === 1 ? "es" : "") : ""}</span><span class="spacer"></span><span class="hint fc-key">${legend}</span></div>` + Object.entries(groupBy(list, (c) => c.note)).map(([nid, cs]) => {
    const n = NOTE[nid];
    const all = (CARDS_BY_NOTE[nid] || []).length;
    return `<section class="fc-group" aria-label="${esc(n.title)}">
      <div class="fc-group-head"><span class="objid">${n.objective}</span><a href="#/note/${n.id}" data-route="note/${n.id}">${esc(n.title)}</a><span class="spacer"></span><button type="button" class="btn small" data-action="start-cards" data-kind="note" data-id="${n.id}" data-count="${all}">Study ${plural(all, "card")}</button></div>
      <div class="fc-list">${cs.map((c) => cardItem(c, { status: true })).join("")}</div>
    </section>`;
  }).join("");
}

// ---------- mock exam ----------
VIEWS.mock = function () {
  const d = derived();
  const set = Store.data.state.settings || {};
  const size = set.mockSize || 50, minutes = set.mockMinutes ?? 120;
  const caseReady = CASES.filter((c) => (QS_BY_CASE[c.id] || []).length).length;
  return `<div class="page narrow">
    <div class="page-head"><div><h1>Mock exam</h1><p>Like the real exam: ${size} questions, ${minutes ? `${minutes} minutes` : "no time limit"}, two case studies (about a quarter of the questions), and no feedback until you finish. New questions come first.</p></div></div>
    ${d.activeMock ? `<div class="callout"><b>You have a mock exam in progress.</b><span class="muted">Started ${esc(fmtDateLong(d.activeMock.startedAt))} · ${Object.keys(d.activeMock.answers || {}).length} of ${d.activeMock.qids.length} answered.</span><div class="row"><button type="button" class="btn primary" data-action="resume-mock" data-id="${d.activeMock.id}">Resume</button><button type="button" class="btn danger" data-action="abandon-mock" data-id="${d.activeMock.id}">Discard it</button></div></div>` : ""}
    <section class="panel">
      <h2>Settings</h2>
      <div class="row">
        <div class="seg" role="group" aria-label="Number of questions">${[50, 60].map((n) => `<button type="button" data-action="mock-size" data-n="${n}" aria-pressed="${size === n}">${n} questions</button>`).join("")}</div>
        <div class="seg" role="group" aria-label="Time limit">${[[120, "2 hours"], [0, "Untimed"]].map(([m, l]) => `<button type="button" data-action="mock-time" data-n="${m}" aria-pressed="${minutes === m}">${l}</button>`).join("")}</div>
      </div>
      <p class="hint">The question bank has ${QS.length} questions (${QS.filter((q) => q.caseStudy).length} case-study questions across ${caseReady} case studies). You have not seen ${d.unseenCount} of them.</p>
      <div class="row"><button type="button" class="btn primary" data-action="start-mock"${d.activeMock || QS.length < 10 ? " disabled" : ""}>${icon("timer")}Start the mock exam</button>${d.activeMock ? `<span class="hint">Finish or discard the exam in progress first.</span>` : ""}</div>
    </section>
    <section class="panel">
      <h2>History</h2>
      ${d.mocks.length ? `<div class="scroll-x"><table class="data-table"><thead><tr><th>Date</th><th class="n">Score</th><th class="n">New questions</th><th class="n">Time</th>${SECTIONS.map((s) => `<th class="n" title="${esc(SHORT[s.id])}">S${s.id}</th>`).join("")}<th></th></tr></thead><tbody>
        ${d.mocks.slice().reverse().map((m) => `<tr><td>${esc(fmtDateLong(m.finishedAt))}</td><td class="n"><b>${pct(m.score)}</b></td><td class="n">${m.fresh && m.fresh.total ? pct(m.fresh.right / m.fresh.total) : "–"}</td><td class="n">${fmtDur(m.elapsedSec || 0)}</td>${SECTIONS.map((s) => { const b = m.bySection?.[s.id]; return `<td class="n">${b ? `${b.right}/${b.total}` : "–"}</td>`; }).join("")}<td class="n"><a href="#/result/${m.id}" data-route="result/${m.id}">Review</a></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">No finished mock exams yet.</p>`}
    </section>
  </div>`;
};

function startMock() {
  const now = Date.now();
  const set = Store.data.state.settings || {};
  const size = set.mockSize || 50;
  const minutes = set.mockMinutes ?? 120;
  const rng = mulberry32((now % 2147483647) >>> 0);
  const m = buildMock(QS, qstats(), SECTIONS, { size: Math.min(size, QS.length), rng });
  const id = "m" + now.toString(36);
  const doc = {
    v: 1, status: "active", startedAt: now, size: m.qids.length, minutes,
    caseStudies: m.caseStudies, qids: m.qids, freshIds: m.freshIds,
    orders: Object.fromEntries(m.qids.map((qid) => [qid, shuffle(Q[qid].options.map((o) => o.id), rng)])),
    answers: {}, flags: [], elapsedSec: 0, current: 0,
  };
  Store.saveMock(id, doc, { now: true });
  ui.exam = { id, showNav: false, confirmEnd: false, showCase: true, elapsed: 0 };
  go("exam");
}

function examDoc() { return ui.exam && Store.data.mocks[ui.exam.id]; }

VIEWS.exam = function () {
  const m = examDoc();
  if (!m && ui.exam && Store.mode === "loading") return `<div class="page narrow" data-waiting><p class="empty">Loading your mock exam…</p></div>`;
  if (!m || m.status !== "active") { ui.exam = null; return VIEWS.mock(); }
  ui.exam.elapsed = Math.max(ui.exam.elapsed || 0, m.elapsedSec || 0);
  const i = Math.min(m.current || 0, m.qids.length - 1);
  const qid = m.qids[i];
  const q = Q[qid];
  if (!q) return VIEWS.mock();
  const sel = m.answers[qid] || [];
  const flagged = (m.flags || []).includes(qid);
  const answered = Object.keys(m.answers).filter((k) => (m.answers[k] || []).length).length;
  const showCase = q.caseStudy && ui.exam.showCase;
  const remaining = m.minutes ? m.minutes * 60 - ui.exam.elapsed : null;
  const unanswered = m.qids.length - answered;
  return `<div class="page quiz${showCase ? "" : " narrow"}">
    <div class="quiz-bar">
      <span class="pos">${i + 1} / ${m.qids.length}</span>
      <span class="timer${remaining != null && remaining < 600 ? " low" : ""}" id="timer" aria-label="Time">${remaining != null ? fmtDur(remaining) : fmtDur(ui.exam.elapsed)}</span>
      <div class="progress-line" aria-hidden="true"><i style="width:${(answered / m.qids.length) * 100}%"></i></div>
      <button type="button" class="btn small" data-action="exam-nav" aria-pressed="${ui.exam.showNav}">All questions</button>
      <button type="button" class="btn small" data-action="end-exam">End exam</button>
    </div>
    ${ui.exam.confirmEnd ? `<div class="callout warn"><b>End the exam now?</b><span>${unanswered ? `${plural(unanswered, "question")} unanswered (they score as wrong). ` : "All questions answered. "}${(m.flags || []).length ? `${plural(m.flags.length, "question")} flagged.` : ""}</span><div class="row"><button type="button" class="btn primary" data-action="confirm-end-exam">End and score</button><button type="button" class="btn" data-action="cancel-end-exam">Keep going</button></div></div>` : ""}
    ${ui.exam.showNav ? `<section class="panel"><div class="panel-head"><h2>All questions</h2><span class="hint">Shaded: answered · corner: flagged</span></div><div class="navgrid">${m.qids.map((id, k) => `<button type="button" data-action="exam-goto" data-i="${k}" class="${(m.answers[id] || []).length ? "answered" : ""}${(m.flags || []).includes(id) ? " flagged" : ""}${k === i ? " current" : ""}" aria-label="Question ${k + 1}${(m.answers[id] || []).length ? ", answered" : ""}${(m.flags || []).includes(id) ? ", flagged" : ""}">${k + 1}</button>`).join("")}</div></section>` : ""}
    <div class="qlayout${showCase ? " with-case" : ""}">
      <div class="qcard">
        <div class="qmeta">
          ${q.caseStudy ? `<span class="chip accent">${icon("case")}${esc(CASE[q.caseStudy]?.name || "")}</span><button type="button" class="btn small" data-action="toggle-case">${ui.exam.showCase ? "Hide" : "Show"} case study</button>` : ""}
          ${q.type === "multi" ? `<span class="chip warn">Choose ${q.answer.length === 3 ? "three" : "two"}</span>` : ""}
          <span class="spacer"></span>
          <button type="button" class="btn small" data-action="exam-flag" aria-pressed="${flagged}">${icon("flag")}${flagged ? "Flagged" : "Flag for review"}</button>
        </div>
        <div class="stem">${q.stem}</div>
        ${optionList(q, m.orders[qid], sel)}
        <div class="q-actions">
          <button type="button" class="btn" data-action="exam-prev"${i === 0 ? " disabled" : ""}>${icon("back")}Previous</button>
          ${i + 1 < m.qids.length ? `<button type="button" class="btn primary" data-action="exam-next">Next ${icon("arrow")}</button>` : `<button type="button" class="btn primary" data-action="end-exam">Finish exam</button>`}
          <span class="kbd-hint">${q.type === "multi" ? `Select ${q.answer.length}. ` : ""}Keys: <kbd>A</kbd>–<kbd>${LETTERS[q.options.length - 1]}</kbd>, <kbd>←</kbd> <kbd>→</kbd></span>
        </div>
      </div>
      ${casePane(q, showCase)}
    </div>
  </div>`;
};

let examTimer = null, examTick = 0;
function startExamTimer() {
  stopExamTimer();
  examTimer = setInterval(() => {
    const m = examDoc();
    if (!m || m.status !== "active" || ui.route.name !== "exam") { stopExamTimer(); return; }
    if (document.hidden) return; // time counts only while the exam is on screen
    const t = ++ui.exam.elapsed;
    const el = document.getElementById("timer");
    const remaining = m.minutes ? m.minutes * 60 - t : null;
    if (el) { el.textContent = remaining != null ? fmtDur(remaining) : fmtDur(t); el.classList.toggle("low", remaining != null && remaining < 600); }
    if (++examTick % 20 === 0) { Store.saveMock(ui.exam.id, { ...m, elapsedSec: t }); saveSession(); }
    if (remaining != null && remaining <= 0) { toast("Time is up. Your exam is scored."); finishExam(); }
  }, 1000);
}
function stopExamTimer() { if (examTimer) { clearInterval(examTimer); examTimer = null; } }

function updateExam(patch) {
  const m = examDoc();
  if (!m) return;
  Store.saveMock(ui.exam.id, { ...m, ...patch, elapsedSec: ui.exam.elapsed || 0 });
  render();
}

function finishExam() {
  const m = examDoc();
  if (!m) return;
  stopExamTimer();
  const now = Date.now();
  const res = scoreMock(Q, m.qids, m.answers, m.freshIds);
  // Record answered questions in the question stats (one write).
  const qs = qstats();
  const patch = {};
  let answered = 0, right = 0;
  for (const qid of m.qids) {
    const sel = m.answers[qid];
    if (!sel || !sel.length) continue;
    const ok = isCorrect(Q[qid], sel);
    patch[qid] = applyAnswer(qs[qid], ok, now);
    if ((m.flags || []).includes(qid)) patch[qid].fl = true;
    answered++; if (ok) right++;
  }
  if (answered) { Store.patch("qstats", { q: patch }); logActivity({ a: answered, k: right }); }
  const id = ui.exam.id;
  Store.saveMock(id, { ...m, elapsedSec: ui.exam.elapsed || m.elapsedSec || 0, status: "done", finishedAt: now, score: res.score, correct: res.correct, total: res.total, fresh: res.fresh, bySection: res.bySection, byObjective: res.byObjective }, { now: true });
  ui.exam = null;
  go("result/" + id, { replace: true });
}

VIEWS.result = function ({ id }) {
  const m = Store.data.mocks[id];
  if (!m && Store.mode === "loading") return `<div class="page narrow" data-waiting><p class="empty">Loading…</p></div>`;
  if (!m || m.status !== "done") return notFound("mock exam");
  const filter = ui.resultFilter || "wrong";
  const items = m.qids.map((qid, k) => ({ qid, k, q: Q[qid], sel: m.answers[qid] || [] })).filter((x) => x.q);
  const shown = items.filter((x) => filter === "all" ? true : filter === "flagged" ? (m.flags || []).includes(x.qid) : !isCorrect(x.q, x.sel));
  const pass = m.score >= READINESS.target;
  return `<div class="page narrow">
    ${crumbs([["Mock exam", "mock"], [fmtDateLong(m.finishedAt), null]])}
    <div class="grid-2">
      <section class="panel">
        <div class="eyebrow">Mock exam score</div>
        <div class="hero-num">${Math.round(m.score * 100)}%</div>
        <span class="verdict ${pass ? "ready" : "building"}">${icon(pass ? "check" : "spark")}${pass ? "At or above the 80% target" : "Below the 80% target"}</span>
        <p class="muted">${m.correct} of ${m.total} right · ${fmtDur(m.elapsedSec || 0)} used${m.minutes ? ` of ${m.minutes} min` : ""}${m.fresh && m.fresh.total ? ` · new questions: ${m.fresh.right}/${m.fresh.total} (${pct(m.fresh.right / m.fresh.total)})` : ""}</p>
        <p class="hint">Case studies: ${(m.caseStudies || []).map((c) => esc(CASE[c]?.name || c)).join(", ") || "none"}</p>
      </section>
      <section class="panel">
        <h2>By section</h2>
        <div class="bars">${SECTIONS.map((s) => { const b = m.bySection?.[s.id]; const v = b && b.total ? b.right / b.total : 0; return `<div class="bar-row"><div class="bar-label"><b>${s.id} · ${esc(SHORT[s.id])}</b><span>${b ? `${b.right}/${b.total} right` : "no questions"}</span></div><div class="bar-track" tabindex="0" data-tip="${esc(`<b>${b ? pct(v) : "–"}</b>Section ${s.id} · ${SHORT[s.id]}`)}">${b ? `<div class="bar-fill" style="width:${v * 100}%"></div>` : ""}<div class="bar-target" style="left:calc(80% - 1px)"></div></div><div class="bar-val">${b ? pct(v) : "–"}</div></div>`; }).join("")}</div>
      </section>
    </div>
    <section class="panel">
      <div class="panel-head"><h2>Review</h2>
        <div class="seg" role="group" aria-label="Filter">${[["wrong", "Wrong or blank"], ["flagged", "Flagged"], ["all", "All"]].map(([k, l]) => `<button type="button" data-action="result-filter" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join("")}</div>
      </div>
      ${shown.length ? shown.map((x) => {
        const ok = isCorrect(x.q, x.sel);
        return `<details class="panel" style="padding:14px 16px"><summary style="cursor:pointer;display:flex;gap:10px;align-items:baseline"><span class="objid">Q${x.k + 1}</span><span class="chip ${ok ? "good" : "bad"}">${icon(ok ? "check" : "x")}${ok ? "Right" : x.sel.length ? "Wrong" : "Blank"}</span><span class="stem-preview" style="flex:1">${esc(stemText(x.q))}</span></summary>
          <div class="stack" style="margin-top:12px">${qMeta(x.q)}<div class="stem">${x.q.stem}</div>${optionList(x.q, m.orders?.[x.qid] || x.q.options.map((o) => o.id), x.sel, { reveal: true })}<div class="feedback">${explanationBlock(x.q, m.orders?.[x.qid] || x.q.options.map((o) => o.id))}</div></div>
        </details>`;
      }).join("") : `<p class="empty">Nothing to show for this filter.</p>`}
      ${items.some((x) => !isCorrect(x.q, x.sel)) ? `<div class="row"><button type="button" class="btn primary" data-action="practice-mock-missed" data-id="${id}">Practice the questions you missed</button></div>` : ""}
    </section>
  </div>`;
};

// ---------- case studies ----------
VIEWS.cases = function () {
  const d = derived();
  return `<div class="page narrow">
    <div class="page-head"><div><h1>Case studies</h1><p>Each exam shows two of these four case studies on a split screen. Case-study questions are 20–30% of the exam. Read each one closely: the requirement wording decides the answer.</p></div></div>
    <div class="card-list">${CASES.map((c) => {
      const qs = QS_BY_CASE[c.id] || [];
      const seen = qs.filter((q) => qstats()[q.id]?.n);
      const first = seen.filter((q) => qstats()[q.id].f).length;
      return `<article class="case-card">
        <div class="row"><h2>${esc(c.name)}</h2><span class="spacer"></span>${c.minutes ? `<span class="hint">Analysis ${c.minutes} min</span>` : ""}</div>
        <p class="muted" style="margin:0">${summaryOf(c)}</p>
        <div class="row">
          <a class="btn primary" href="#/case/${c.id}" data-route="case/${c.id}">Read</a>
          <button type="button" class="btn" data-action="start-practice" data-kind="case" data-id="${c.id}" data-count="15"${qs.length ? "" : " disabled"}>Practice ${qs.length} questions</button>
          <span class="hint">${seen.length ? `${seen.length}/${qs.length} tried · first try ${pct(first / seen.length)}` : ""}</span>
          <span class="spacer"></span><a class="ext" href="${esc(c.pdf)}" target="_blank" rel="noopener">Official PDF</a>
        </div>
      </article>`;
    }).join("")}</div>
  </div>`;
};
function summaryOf(c) {
  const src = c.analysisHtml || c.textHtml || "";
  const m = /<p>([\s\S]*?)<\/p>/.exec(src);
  const t = m ? m[1].replace(/<[^>]+>/g, "") : "Not written yet.";
  return esc(t.length > 260 ? t.slice(0, 257).replace(/\s+\S*$/, "") + "…" : t);
}

VIEWS.case = function ({ id }) {
  const c = CASE[id];
  if (!c) return notFound("case study");
  const tab = ui.caseTab[id] || "text";
  const html = tab === "text" ? c.textHtml : c.analysisHtml;
  return `<div class="page">
    ${crumbs([["Case studies", "cases"], [c.name, null]])}
    ${titleBlock({ sheet: "CS", title: c.name, cells: [["Questions", String((QS_BY_CASE[id] || []).length)], ["Analysis", c.minutes ? `${c.minutes} min` : "–"], ["Source", `<a class="ext" href="${esc(c.pdf)}" target="_blank" rel="noopener">PDF</a>`]] })}
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${tab === "text"}" data-action="case-tab" data-id="${id}" data-tab="text">Case study</button>
      <button type="button" role="tab" aria-selected="${tab === "analysis"}" data-action="case-tab" data-id="${id}" data-tab="analysis">Analysis</button>
    </div>
    <div class="reader">
      <article class="prose">${html || `<p>Not written yet.</p>`}</article>
      ${tab === "analysis" && c.toc.length ? `<nav class="toc" aria-label="On this page"><span class="eyebrow">On this page</span>${c.toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.text)}</a>`).join("")}</nav>` : ""}
    </div>
    <div class="row"><button type="button" class="btn primary" data-action="start-practice" data-kind="case" data-id="${id}" data-count="15"${(QS_BY_CASE[id] || []).length ? "" : " disabled"}>Practice this case study</button></div>
  </div>`;
};

// ---------- labs ----------
function labRow(l) {
  const done = labDone(l.id);
  return `<div class="lab-row">
    <span class="no">${esc(l.id.split("-")[0])}</span>
    <div><a class="title" href="#/lab/${l.id}" data-route="lab/${l.id}">${esc(l.title)}</a>
      <div class="meta"><span>${l.objectives.map((o) => `<span class="objid">${o}</span>`).join(" ")}</span><span>${l.minutes} min</span>${l.cost ? `<span>${esc(l.cost)}</span>` : ""}${l.requiresOrg ? `<span class="chip warn">${icon("warn")}Needs an organization</span>` : ""}</div></div>
    <label class="check"><input type="checkbox" data-action="lab-done" data-id="${l.id}"${done ? " checked" : ""}>Done</label>
  </div>`;
}
VIEWS.labs = function () {
  const list = LABS.filter((l) => !(ui.labNoOrg && l.requiresOrg));
  const setup = LAB["00-setup"];
  return `<div class="page narrow">
    <div class="page-head"><div><h1>Labs</h1><p>Hands-on practice in your own sandbox project. Every lab starts with <code>source labs/env.sh</code>, which refuses any project whose ID does not start with <code>pca-lab-</code>. Run <code>teardown.sh</code> when you finish.</p></div>
      <label class="check"><input type="checkbox" data-action="lab-filter"${ui.labNoOrg ? " checked" : ""}>Hide labs that need an organization</label>
    </div>
    ${setup && !labDone(setup.id) ? `<div class="callout"><b>Start with the setup lab.</b><span class="muted">It creates the lab project, a budget alert, and the gcloud configuration the other labs use.</span><div><a class="btn primary" href="#/lab/${setup.id}" data-route="lab/${setup.id}">Open ${esc(setup.title)}</a></div></div>` : ""}
    <div class="card-list">${list.map(labRow).join("") || `<p class="empty">No labs yet.</p>`}</div>
  </div>`;
};
VIEWS.lab = function ({ id }) {
  const l = LAB[id];
  if (!l) return notFound("lab");
  const done = labDone(id);
  return `<div class="page">
    ${crumbs([["Labs", "labs"], [l.id, null]])}
    ${titleBlock({ sheet: l.id.split("-")[0], title: l.title, cells: [["Objectives", l.objectives.map((o) => `<a href="#/objective/${o}" data-route="objective/${o}">${o}</a>`).join(" ") || "–"], ["Time", `${l.minutes} min`], ["Organization", l.requiresOrg ? "Required" : "Not needed"]] })}
    ${l.cost ? `<div class="callout"><span><b>Cost.</b> ${esc(l.cost)}</span></div>` : ""}
    <div class="reader">
      <article class="prose">${l.html}${l.files.length ? `<h2>Files in this lab</h2>${l.files.map((f) => `<details><summary>${esc(f.name)}</summary>${f.html}</details>`).join("")}` : ""}</article>
      ${l.toc.length ? `<nav class="toc" aria-label="On this page"><span class="eyebrow">On this page</span>${l.toc.map((t) => `<a href="#${esc(t.id)}">${esc(t.text)}</a>`).join("")}</nav>` : ""}
    </div>
    <div class="reader-foot panel"><label class="check"><input type="checkbox" data-action="lab-done" data-id="${id}"${done ? " checked" : ""}>I finished this lab and ran the cleanup</label><a class="btn ghost" href="#/labs" data-route="labs">All labs</a></div>
  </div>`;
};

// ---------- progress & settings ----------
VIEWS.progress = function () {
  const d = derived();
  const set = Store.data.state.settings || {};
  return `<div class="page">
    <div class="page-head"><div><h1>Progress</h1><p>Every number on the dashboard, as tables. Settings and your data are at the end.</p></div></div>
    <section class="panel">
      <h2>Sections</h2>
      <div class="scroll-x"><table class="data-table"><thead><tr><th>Section</th><th class="n">Weight</th><th class="n">Tried</th><th class="n">First try right</th><th class="n">Predicted</th><th class="n">Objectives done</th></tr></thead><tbody>
      ${SECTIONS.map((s) => { const p = d.ready.perSection[s.id]; const objs = OBJECTIVES.filter((o) => o.section === s.id); return `<tr><td><b>${s.id}</b> · ${esc(s.title)}</td><td class="n">${s.weight}%</td><td class="n">${p.seen}/${p.total}</td><td class="n">${p.seen ? `${p.firstRight} (${pct(p.accuracy)})` : "–"}</td><td class="n">${p.seen ? pct(p.estimate) : "–"}</td><td class="n">${objs.filter((o) => objStatus(o.id) === 2).length}/${objs.length}</td></tr>`; }).join("")}
      <tr><td><b>Overall</b></td><td class="n">100%</td><td class="n">${d.ready.firstAttempts}/${QS.length}</td><td class="n"></td><td class="n"><b>${d.ready.enough ? pct(d.ready.predicted) : "–"}</b></td><td class="n">${d.objDone}/${OBJECTIVES.length}</td></tr>
      </tbody></table></div>
    </section>
    <section class="panel">
      <h2>Objectives</h2>
      <div class="scroll-x"><table class="data-table"><thead><tr><th>Objective</th><th>Status</th><th class="n">Confidence</th><th class="n">Pages read</th><th class="n">Tried</th><th class="n">First try</th><th class="n">Latest</th><th class="n">Due</th><th class="n">Cards learned</th></tr></thead><tbody>
      ${OBJECTIVES.map((o) => { const os = d.objStats[o.id] || { total: 0, seen: 0, due: 0 }; const cos = d.cardObjStats[o.id] || { total: 0, mastered: 0 }; const notes = NOTES_BY_OBJ[o.id] || []; return `<tr><td><a href="#/objective/${o.id}" data-route="objective/${o.id}"><span class="objid">${o.id}</span></a> ${esc(o.title)}</td><td>${statusChip(objStatus(o.id))}</td><td class="n">${objConf(o.id) || "–"}</td><td class="n">${notes.filter((n) => noteRead(n.id)).length}/${notes.length}</td><td class="n">${os.seen}/${os.total}</td><td class="n">${os.seen ? pct(os.firstAcc) : "–"}</td><td class="n">${os.seen ? pct(os.lastAcc) : "–"}</td><td class="n">${os.due || ""}</td><td class="n">${cos.total ? `${cos.mastered}/${cos.total}` : "–"}</td></tr>`; }).join("")}
      </tbody></table></div>
    </section>
    <section class="panel" id="settings">
      <h2>Settings</h2>
      <div class="field" style="max-width:280px"><label for="exam-date">Exam date</label><input type="date" id="exam-date" data-change="exam-date" value="${esc(set.examDate || "")}"><span class="hint">Used for the countdown and weekly pace.</span></div>
    </section>
    <section class="panel">
      <h2>How the predicted score works</h2>
      <div class="explain" style="font-size:15.5px">
        <p>The score estimates how you would do on questions you have not seen. It uses only your <b>first</b> answer to each question, because a repeat answer tests memory of that question.</p>
        <p>For each exam section, the app takes the share of first answers you got right. Recent answers count more: an answer from ${READINESS.halfLifeDays} days ago counts half as much as one from today. Each section starts at ${pct(READINESS.priorMean)} with the weight of ${READINESS.priorWeight} answers, so a few lucky answers cannot move it far. The overall score weights the sections by the official exam guide (25%, 17.5%, 17.5%, 15%, 12.5%, 12.5%). The ± value is a 95% interval.</p>
        <p>Google does not publish the passing score. “Ready” in this app means: predicted score of 80% or more, at least 60% of the bank tried, 90% of objectives done, and a latest mock exam score of 80% or more. The bar is high on purpose.</p>
        <p>Spaced review: a wrong answer makes a question due again at once. Each right answer moves it to a longer interval: ${BOX_DAYS.slice(1).join(", ")} days.</p>
        <p>Flashcards use the same intervals. “Again” makes a card due at once, and each “Got it” moves it to a longer interval. A card is learned when it reaches the ${BOX_DAYS[3]}-day interval. Flashcards do not change the predicted score.</p>
      </div>
    </section>
    <section class="panel">
      <h2>Your data</h2>
      <p class="muted">${esc(Store.note || "")}</p>
      <div class="row">
        <button type="button" class="btn" data-action="copy-export">Copy progress as JSON</button>
        ${d.mocks.length ? `<span class="hint">${plural(d.mocks.length, "mock exam")} saved</span>` : ""}
      </div>
      <div class="field"><label for="import-box">Import progress</label><textarea id="import-box" placeholder='Paste a PCA Workbook export here ({"app":"pca-workbook", …})'></textarea>
        <div class="row"><button type="button" class="btn" data-action="import-data">Import and replace my progress</button>${ui.importMsg ? `<span class="hint">${esc(ui.importMsg)}</span>` : ""}</div></div>
      <hr class="rule">
      ${ui.resetStep === 0 ? `<div class="row"><button type="button" class="btn danger" data-action="reset-1">Reset all progress…</button></div>`
        : `<div class="callout warn"><b>Delete all progress?</b><span>This deletes objective status, notes read, labs done, every answer, every flashcard grade, and every mock exam. It cannot be undone.</span><div class="row"><button type="button" class="btn danger" data-action="reset-2">Delete everything</button><button type="button" class="btn" data-action="reset-cancel">Cancel</button></div></div>`}
      <p class="hint">Content built ${esc(fmtDateLong(Date.parse(DATA.builtAt)))} from exam guide ${esc(EXAM.guideVersion)} (retrieved ${esc(EXAM.retrieved)}): ${NOTES.length} notes pages, ${QS.length} questions, ${CARDS.length} flashcards, ${LABS.length} labs.</p>
    </section>
  </div>`;
};

// ---------- actions ----------
const ACTIONS = {
  "obj-status": ({ id, s }) => { Store.patch("state", { objectives: { [id]: { s: Number(s), c: objConf(id), t: Date.now() } } }); render(); },
  "obj-conf": ({ id, c }) => { Store.patch("state", { objectives: { [id]: { s: objStatus(id), c: Number(c), t: Date.now() } } }); render(); },
  "note-read": ({ id }) => {
    const was = noteRead(id);
    const n = NOTE[id];
    const patch = { notes: { [id]: was ? null : Date.now() } };
    if (!was && n && objStatus(n.objective) === 0) patch.objectives = { [n.objective]: { s: 1, c: objConf(n.objective), t: Date.now() } };
    Store.patch("state", patch);
    if (!was) logActivity({ r: 1 });
    const siblings = NOTES_BY_OBJ[n.objective] || [];
    if (!was && siblings.every((x) => x.id === id || noteRead(x.id)) && objStatus(n.objective) < 2) toast(`All ${n.objective} pages read. Mark the objective done after you practice it.`);
    render();
  },
  "lab-done": ({ id }, el) => {
    const on = el.checked;
    Store.patch("state", { labs: { [id]: on ? Date.now() : null } });
    if (on) logActivity({ l: 1 });
    toast(on ? "Lab marked as done" : "Lab marked as not done");
    render();
  },
  "lab-filter": (_, el) => { ui.labNoOrg = el.checked; render(); },
  "set-count": ({ n }) => { ui.practiceCount = Number(n); render(); },
  "start-practice": (ds) => startPractice(ds),
  "pick": ({ opt }) => {
    if (ui.route.name === "quiz") {
      const z = ui.quiz; const qid = z.qids[z.i]; const q = Q[qid];
      if (z.done[qid]) return;
      z.sel[qid] = toggleSel(z.sel[qid] || [], opt, q);
      render();
    } else if (ui.route.name === "exam") {
      const m = examDoc(); const qid = m.qids[m.current || 0]; const q = Q[qid];
      updateExam({ answers: { ...m.answers, [qid]: toggleSel(m.answers[qid] || [], opt, q) } });
    }
  },
  "submit-answer": () => {
    const z = ui.quiz; const qid = z.qids[z.i]; const q = Q[qid];
    const sel = z.sel[qid] || [];
    if (sel.length !== (q.type === "multi" ? q.answer.length : 1) || z.done[qid]) return;
    const ok = isCorrect(q, sel);
    z.done[qid] = true; z.right[qid] = ok;
    recordAnswer(qid, ok);
    render();
  },
  "next-q": () => {
    const z = ui.quiz;
    if (z.i + 1 < z.qids.length) { z.i++; render(); window.scrollTo(0, 0); } else { z.finished = true; render(); window.scrollTo(0, 0); }
  },
  "end-quiz": () => { ui.quiz.finished = true; render(); },
  "retry-missed": () => {
    const z = ui.quiz;
    const ids = z.qids.filter((id) => z.done[id] && !z.right[id]);
    startPractice({ kind: "ids", ids, count: ids.length });
  },
  "set-card-count": ({ n }) => { ui.cardCount = Number(n); render(); },
  "start-cards": (ds) => startCards(ds),
  "flip-card": () => {
    if (!ui.flash || ui.flash.finished) return;
    ui.flash.shown = true;
    render();
    document.querySelector(".fcard-grade")?.scrollIntoView({ block: "nearest" });
  },
  "grade-card": ({ ok }) => {
    const f = ui.flash;
    if (!f || !f.shown || f.finished) return;
    const id = f.ids[f.i];
    f.grades[id] = ok === "1";
    recordCard(id, f.grades[id]);
    f.shown = false;
    if (f.i + 1 < f.ids.length) f.i++; else f.finished = true;
    render(); window.scrollTo(0, 0);
  },
  "end-flash": () => { ui.flash.finished = true; render(); },
  "retry-cards": () => {
    const f = ui.flash;
    const ids = f.ids.filter((id) => f.grades[id] === false);
    startCards({ kind: "ids", ids, count: ids.length });
  },
  "toggle-case": () => { if (ui.route.name === "quiz") ui.quiz.showCase = !ui.quiz.showCase; else if (ui.exam) ui.exam.showCase = !ui.exam.showCase; render(); },
  "toggle-flag": ({ id }) => { const cur = !!qstats()[id]?.fl; Store.patch("qstats", { q: { [id]: { fl: !cur } } }); render(); },
  "mock-size": ({ n }) => { Store.patch("state", { settings: { mockSize: Number(n) } }); render(); },
  "mock-time": ({ n }) => { Store.patch("state", { settings: { mockMinutes: Number(n) } }); render(); },
  "start-mock": () => startMock(),
  "resume-mock": ({ id }) => { ui.exam = { id, showNav: false, confirmEnd: false, showCase: true, elapsed: Store.data.mocks[id]?.elapsedSec || 0 }; go("exam"); },
  "abandon-mock": ({ id }) => { Store.deleteMock(id); toast("Mock exam discarded"); render(); },
  "exam-goto": ({ i }) => { ui.exam.showNav = false; updateExam({ current: Number(i) }); window.scrollTo(0, 0); },
  "exam-next": () => { const m = examDoc(); updateExam({ current: Math.min((m.current || 0) + 1, m.qids.length - 1) }); window.scrollTo(0, 0); },
  "exam-prev": () => { const m = examDoc(); updateExam({ current: Math.max((m.current || 0) - 1, 0) }); window.scrollTo(0, 0); },
  "exam-flag": () => { const m = examDoc(); const qid = m.qids[m.current || 0]; const flags = new Set(m.flags || []); flags.has(qid) ? flags.delete(qid) : flags.add(qid); updateExam({ flags: [...flags] }); },
  "exam-nav": () => { ui.exam.showNav = !ui.exam.showNav; render(); },
  "end-exam": () => { ui.exam.confirmEnd = true; render(); window.scrollTo(0, 0); },
  "cancel-end-exam": () => { ui.exam.confirmEnd = false; render(); },
  "confirm-end-exam": () => finishExam(),
  "result-filter": ({ f }) => { ui.resultFilter = f; render(); },
  "practice-mock-missed": ({ id }) => {
    const m = Store.data.mocks[id];
    const ids = m.qids.filter((qid) => Q[qid] && !isCorrect(Q[qid], m.answers[qid] || []));
    startPractice({ kind: "ids", ids, count: ids.length });
  },
  "case-tab": ({ id, tab }) => { ui.caseTab[id] = tab; render(); },
  "copy-code": (_, el) => {
    const pre = el.closest(".code")?.querySelector("pre");
    if (pre) copyText(pre.innerText, "Copied");
  },
  "copy-export": () => copyText(JSON.stringify(Store.exportData(), null, 1), "Progress copied as JSON"),
  "import-data": () => {
    const box = document.getElementById("import-box");
    try { Store.importData(JSON.parse(box.value)); ui.importMsg = "Imported."; toast("Progress imported"); }
    catch (e) { ui.importMsg = `Import failed: ${e.message} Paste the full text you copied with "Copy progress as JSON".`; }
    render();
  },
  "reset-1": () => { ui.resetStep = 1; render(); },
  "reset-cancel": () => { ui.resetStep = 0; render(); },
  "reset-2": async () => { ui.resetStep = 0; await Store.resetAll(); toast("All progress deleted"); render(); },
};

function toggleSel(sel, opt, q) {
  if (q.type !== "multi") return [opt];
  const s = new Set(sel);
  if (s.has(opt)) s.delete(opt);
  else if (s.size < q.answer.length) s.add(opt);
  else return sel; // already at the required number of choices
  return [...s];
}

function copyText(text, msg) {
  const done = () => toast(msg);
  try {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, msg));
  } catch { fallbackCopy(text, msg); }
}
function fallbackCopy(text, msg) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  toast(ok ? msg : "Copy is blocked here. Select the text and copy it by hand.");
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const routeEl = e.target.closest("[data-route]");
  if (routeEl && routeEl.tagName === "A") { e.preventDefault(); go(routeEl.dataset.route); return; }
  const svgRoute = e.target.closest("[data-route-click]");
  if (svgRoute) { go(svgRoute.getAttribute("data-route-click")); return; }
  const anchor = e.target.closest('a[href^="#"]');
  if (anchor && !anchor.dataset.route) {
    const target = document.getElementById(decodeURIComponent(anchor.getAttribute("href").slice(1)));
    e.preventDefault();
    if (target) target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    return;
  }
  const act = e.target.closest("[data-action]");
  if (act && act.type !== "checkbox") {
    const fn = ACTIONS[act.dataset.action];
    if (fn && !act.disabled) { e.preventDefault(); fn(act.dataset, act, e); }
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.matches('input[type="checkbox"][data-action]')) { const fn = ACTIONS[el.dataset.action]; if (fn) fn(el.dataset, el, e); }
  if (el.dataset.change === "browse-obj") go(el.value ? `browse/${el.value}` : "browse", { replace: true });
  if (el.dataset.change === "exam-date") { Store.patch("state", { settings: { examDate: el.value || null } }); toast(el.value ? "Exam date saved" : "Exam date cleared"); }
});
document.addEventListener("input", (e) => {
  if (e.target.dataset.input !== "card-search") return;
  ui.browseQ = e.target.value;
  const box = document.getElementById("card-results");
  if (box) box.innerHTML = browseResults(ui.route.id, ui.browseQ);
});
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, textarea, select")) return;
  const name = ui.route.name;
  if (name === "flash") {
    const f = ui.flash;
    if (!f || f.finished) return;
    if (!f.shown && (e.key === " " || e.key === "Enter") && !e.target.closest("button, a")) { e.preventDefault(); ACTIONS["flip-card"](); }
    else if (f.shown && (e.key === "1" || e.key === "2")) { e.preventDefault(); ACTIONS["grade-card"]({ ok: e.key === "2" ? "1" : "0" }); }
    return;
  }
  if (name !== "quiz" && name !== "exam") return;
  const key = e.key.toUpperCase();
  let q, order;
  if (name === "quiz") { if (!ui.quiz || ui.quiz.finished) return; q = Q[ui.quiz.qids[ui.quiz.i]]; order = ui.quiz.orders[q.id]; }
  else { const m = examDoc(); if (!m) return; q = Q[m.qids[m.current || 0]]; order = m.orders[q.id]; }
  let idx = LETTERS.indexOf(key);
  if (idx < 0 && /^[1-6]$/.test(e.key)) idx = Number(e.key) - 1;
  if (idx >= 0 && idx < order.length && key.length === 1) { e.preventDefault(); ACTIONS.pick({ opt: order[idx] }); return; }
  if (e.key === "Enter") {
    if (e.target.closest("button")) return; // let the focused button act
    e.preventDefault();
    if (name === "quiz") { const qid = ui.quiz.qids[ui.quiz.i]; ui.quiz.done[qid] ? ACTIONS["next-q"]() : ACTIONS["submit-answer"](); }
    else ACTIONS["exam-next"]();
  }
  if (name === "exam" && e.key === "ArrowRight") { e.preventDefault(); ACTIONS["exam-next"](); }
  if (name === "exam" && e.key === "ArrowLeft") { e.preventDefault(); ACTIONS["exam-prev"](); }
});

// Tooltips for chart marks: pointer and keyboard focus show the same text.
const tipEl = document.getElementById("tip");
function showTip(el, x, y) {
  tipEl.innerHTML = el.getAttribute("data-tip");
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  const top = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
  tipEl.style.left = left + "px"; tipEl.style.top = top + "px";
}
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el) showTip(el, e.clientX, e.clientY); else tipEl.hidden = true;
});
document.addEventListener("focusin", (e) => {
  const el = e.target.closest && e.target.closest("[data-tip]");
  if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top); } else tipEl.hidden = true;
});
document.addEventListener("scroll", () => { tipEl.hidden = true; }, { passive: true });

// Re-render passive views when data arrives; keep active sessions stable.
Store.onChange((kind) => {
  if (kind === "data") dataVersion++;
  renderSaveState();
  renderNav();
  const passive = ["home", "study", "objective", "practice", "cards", "browse", "mock", "cases", "labs", "progress"];
  const waiting = !!document.querySelector("#main [data-waiting]");
  if ((kind === "data" || waiting) && (passive.includes(ui.route.name) || waiting) && !document.activeElement?.closest?.("input, textarea, select")) {
    const y = window.scrollY;
    $("#main").innerHTML = (VIEWS[ui.route.name] || VIEWS.home)(ui.route);
    window.scrollTo(0, y);
  }
});

// ---------- boot ----------
// The open quiz or mock exam survives a reload (a republish reloads the page).
function saveSession() {
  lsSetStr("pca-session", JSON.stringify({ quiz: ui.quiz, exam: ui.exam, flash: ui.flash, caseTab: ui.caseTab, practiceCount: ui.practiceCount, cardCount: ui.cardCount, labNoOrg: ui.labNoOrg, resultFilter: ui.resultFilter }));
}
function start() {
  let saved = {};
  try { saved = JSON.parse(lsGetStr("pca-session") || "{}") || {}; } catch { saved = {}; }
  for (const k of ["quiz", "exam", "flash", "caseTab", "practiceCount", "cardCount", "labNoOrg", "resultFilter"]) if (saved[k] != null) ui[k] = saved[k];
  if (ui.flash && !(ui.flash.ids || []).every((id) => CARD[id])) ui.flash = null; // a card left the deck in a new build
  let initial = lsGetStr("pca-route") || "home";
  const r = parseRoute(initial);
  if ((r.name === "quiz" && !ui.quiz) || (r.name === "exam" && !ui.exam) || (r.name === "flash" && !ui.flash) || !VIEWS[r.name]) initial = "home";
  ui.routeStr = initial;
  ui.route = parseRoute(initial);
  Store.init(); // loads this browser's cache at once, then connects to the db
  ui.routeStr = null;
  go(initial, { replace: true });
}
start();
