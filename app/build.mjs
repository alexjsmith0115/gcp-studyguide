// Build the study app: render all content to HTML at build time and inline
// it, with the app's CSS and JS, into one file: dist/index.html.
// dist/pca-workbook.html is the same app as a standalone page to open or send.
// The repo holds more than one guide; --guide picks one (see GUIDES).
//
//   node app/build.mjs               build the PCA guide
//   node app/build.mjs --guide pcd   build the PCD guide into dist/pcd/
//   node app/build.mjs --strict      also fail on broken internal links
//   node app/build.mjs --share       also write dist/pca-workbook.zip (standalone page and lab files)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { Marked } from "marked";
import hljs from "highlight.js";
import { buildMatcher, glossify, checkGlossary, glossaryId } from "./glossary.mjs";
import { buildServices, checkServices } from "./services.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...p) => path.join(ROOT, ...p);
const read = (f) => fs.readFileSync(f, "utf8");
const strict = process.argv.includes("--strict");
const problems = [];
const warn = (m) => problems.push(m);

// ---------- guide ----------
// Each guide has its own content and labs folders (relative to the repo root)
// and its own output folder. The labs of every guide run from the repo root.
const GUIDES = {
  pca: { content: "content", labs: "labs", out: "dist" },
  pcd: { content: "pcd/content", labs: "pcd/labs", out: "dist/pcd" },
};
const guideAt = process.argv.indexOf("--guide");
const guideId = guideAt >= 0 ? process.argv[guideAt + 1] : "pca";
const G = GUIDES[guideId];
if (!G) throw new Error(`unknown guide ${guideId}; use one of ${Object.keys(GUIDES).join(", ")}`);
const C = (...p) => P(G.content, ...p);
const OUT = (...p) => P(G.out, ...p);
const rel = (f) => path.relative(ROOT, f);

// ---------- glossary ----------
// content/glossary.json: terms that the app explains in a hover card.
const glossaryFile = C("glossary.json");
let glossary = [];
if (fs.existsSync(glossaryFile)) {
  try { glossary = JSON.parse(read(glossaryFile)); } catch (e) { warn(`${rel(glossaryFile)}: invalid JSON (${e.message})`); }
}
glossary = glossary.filter((e) => e && e.term).map((e) => ({ ...e, id: e.id || glossaryId(e.term) }));
const glossMatcher = buildMatcher(glossary);
for (const c of glossMatcher.clashes) warn(`${rel(glossaryFile)}: ${c}`);
const glossUsed = new Map();
const gloss = (html) => glossify(html, glossMatcher, glossUsed);

// ---------- markdown ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const LANG_ALIAS = { sh: "bash", shell: "bash", zsh: "bash", tf: "hcl", terraform: "hcl", yml: "yaml", py: "python", js: "javascript", console: "bash" };
const internalRefs = []; // [from, kind, id]

function makeMarked(ctx) {
  const m = new Marked({ gfm: true });
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const base = slug(html) || "section";
        let id = base, n = 2;
        while (ctx.ids.has(id)) id = `${base}-${n++}`;
        ctx.ids.add(id);
        if (depth === 2) ctx.toc.push({ id: ctx.prefix + id, text: html.replace(/<[^>]+>/g, "") });
        return `<h${depth} id="${ctx.prefix}${id}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const t = title ? ` title="${esc(title)}"` : "";
        const mm = /^(note|lab|case):([A-Za-z0-9._-]+)$/.exec(href || "");
        if (mm) {
          internalRefs.push([ctx.source, mm[1], mm[2]]);
          return `<a href="#/${mm[1]}/${mm[2]}" data-route="${mm[1]}/${mm[2]}"${t}>${text}</a>`;
        }
        if (/^https?:\/\//.test(href || "")) {
          return `<a href="${esc(href)}" target="_blank" rel="noopener"${t} class="ext">${text}</a>`;
        }
        if ((href || "").startsWith("#")) return `<a href="#${ctx.prefix}${esc(href.slice(1))}"${t}>${text}</a>`;
        warn(`${ctx.source}: unsupported link target ${href}`);
        return `<span class="deadlink">${text}</span>`;
      },
      code({ text, lang }) {
        const l = LANG_ALIAS[(lang || "").toLowerCase()] || (lang || "").toLowerCase();
        let body;
        try {
          body = l && hljs.getLanguage(l) ? hljs.highlight(text, { language: l }).value : esc(text);
        } catch { body = esc(text); }
        return `<div class="code"><div class="code-bar"><span>${esc(l || "text")}</span><button type="button" class="copy" data-action="copy-code">Copy</button></div><pre><code class="hljs lang-${esc(l || "text")}">${body}</code></pre></div>\n`;
      },
      table(token) {
        const head = token.header.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</th>`).join("");
        const rows = token.rows.map((r) => "<tr>" + r.map((c) => `<td${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</td>`).join("") + "</tr>").join("\n");
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  return m;
}

function sanitize(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function renderMd(src, source, prefix = "") {
  const ctx = { ids: new Set(), toc: [], source, prefix };
  const html = gloss(sanitize(makeMarked(ctx).parse(src)));
  return { html, toc: ctx.toc };
}
function renderInline(src, source, { terms = true } = {}) {
  const ctx = { ids: new Set(), toc: [], source, prefix: "" };
  const html = sanitize(makeMarked(ctx).parseInline(String(src ?? "")));
  return terms ? gloss(html) : html;
}
function renderBlock(src, source) {
  return renderMd(String(src ?? ""), source).html;
}
const words = (s) => (s.replace(/```[\s\S]*?```/g, " ").match(/[A-Za-z0-9][\w'.-]*/g) || []).length;

// ---------- load ----------
const exam = JSON.parse(read(C("exam.json")));
// exam.app: the app's name, file names, and labels for this guide.
const app = { ...exam.app, id: guideId, labsDir: G.labs };
for (const k of ["name", "slug", "subtitle", "labPrefix"]) if (!app[k]) throw new Error(`${rel(C("exam.json"))}: app.${k} is missing`);
const objectiveIds = new Set(exam.sections.flatMap((s) => s.objectives.map((o) => o.id)));
const sectionOf = (obj) => String(obj).split(".")[0];

function listFiles(dir, re) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));
}
function fm(file) {
  const g = matter(read(file));
  return { data: g.data, body: g.content };
}
const asList = (v) => (Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)]);

// Notes
const notes = [];
const noteText = {};
for (const f of listFiles(C("notes"), /\.md$/)) {
  const { data, body } = fm(f);
  const id = path.basename(f, ".md");
  if (data.id && String(data.id) !== id) warn(`${f}: frontmatter id ${data.id} differs from file name`);
  const objective = String(data.objective ?? id.split("-")[0]);
  if (!objectiveIds.has(objective)) warn(`${f}: unknown objective ${objective}`);
  const { html, toc } = renderMd(body, `note:${id}`);
  noteText[id] = body;
  notes.push({
    id, title: String(data.title || id), objective, also: asList(data.also).filter((o) => objectiveIds.has(o)),
    order: Number(data.order ?? 50), minutes: Number(data.minutes ?? Math.max(5, Math.round(words(body) / 200))),
    labs: asList(data.labs), verified: data.verified ? String(data.verified instanceof Date ? data.verified.toISOString().slice(0, 10) : data.verified) : null,
    words: words(body), html, toc,
  });
}
notes.sort((a, b) => a.objective.localeCompare(b.objective, undefined, { numeric: true }) || a.order - b.order || a.id.localeCompare(b.id));

// Case studies
const cases = [];
for (const c of exam.caseStudies) {
  const tf = C("case-studies", `${c.id}.md`);
  const af = C("case-studies", `${c.id}.analysis.md`);
  const entry = { id: c.id, name: c.name, pdf: c.pdf, textHtml: null, analysisHtml: null, toc: [], minutes: null, words: 0 };
  if (fs.existsSync(tf)) {
    const { body } = fm(tf);
    entry.textHtml = renderMd(body, `case:${c.id}`, "cs-").html;
    entry.words = words(body);
  }
  if (fs.existsSync(af)) {
    const { data, body } = fm(af);
    const r = renderMd(body, `case:${c.id}-analysis`, "an-");
    entry.analysisHtml = r.html;
    entry.toc = r.toc;
    entry.minutes = Number(data.minutes ?? Math.round(words(body) / 200));
  }
  cases.push(entry);
}

// Labs
const labs = [];
if (fs.existsSync(P(G.labs))) {
  for (const d of fs.readdirSync(P(G.labs)).sort()) {
    const dir = P(G.labs, d);
    const readme = path.join(dir, "README.md");
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(readme)) continue;
    const { data, body } = fm(readme);
    const { html, toc } = renderMd(body, `lab:${d}`);
    const files = fs.readdirSync(dir).filter((f) => f !== "README.md" && !f.startsWith(".") && fs.statSync(path.join(dir, f)).isFile() && fs.statSync(path.join(dir, f)).size < 60000).sort();
    labs.push({
      id: d, title: String(data.title || d), objectives: asList(data.objectives).filter((o) => objectiveIds.has(o)),
      minutes: Number(data.minutes ?? 30), cost: data.cost ? String(data.cost) : "", requiresOrg: !!data.requiresOrg,
      html, toc,
      files: files.map((f) => {
        const ext = path.extname(f).slice(1);
        const lang = { sh: "bash", tf: "hcl", py: "python", yaml: "yaml", yml: "yaml", json: "json", csv: "text", txt: "text" }[ext] || "text";
        return { name: f, html: renderBlock("```" + lang + "\n" + read(path.join(dir, f)) + "\n```", `lab:${d}/${f}`) };
      }),
    });
  }
}

// Reference pages (content/reference/*.md): the first H1 is the title.
const refs = [];
for (const f of listFiles(C("reference"), /\.md$/)) {
  const { body } = fm(f);
  const id = path.basename(f, ".md");
  const h1 = /^#\s+(.+)$/m.exec(body);
  const { html, toc } = renderMd(h1 ? body.replace(h1[0], "") : body, `ref:${id}`);
  refs.push({ id, title: h1 ? h1[1].trim() : id, html, toc, words: words(body) });
}

// Questions
const questions = [];
for (const f of listFiles(C("questions"), /\.json$/)) {
  let arr;
  try { arr = JSON.parse(read(f)); } catch (e) { warn(`${f}: invalid JSON (${e.message})`); continue; }
  for (const q of arr) {
    if (!q || !q.id || !objectiveIds.has(String(q.objective))) { warn(`${f}: skipped question ${q && q.id}`); continue; }
    const src = `question:${q.id}`;
    questions.push({
      id: q.id, objective: String(q.objective), section: sectionOf(q.objective), caseStudy: q.caseStudy || null,
      type: q.type === "multi" ? "multi" : "single", difficulty: q.difficulty || 2, tags: q.tags || [],
      stem: renderBlock(q.stem, src),
      options: (q.options || []).map((o) => ({ id: o.id, html: renderInline(o.text, src) })),
      answer: q.answer || [],
      explanation: renderBlock(q.explanation, src),
      whyWrong: Object.fromEntries(Object.entries(q.whyWrong || {}).map(([k, v]) => [k, renderInline(v, src)])),
      sources: (q.sources || []).map((s) => ({ title: String(s.title || s.url), url: String(s.url), evidence: s.evidence ? String(s.evidence) : "" })),
    });
  }
}
const seenQ = new Set();
for (const q of questions) {
  if (seenQ.has(q.id)) warn(`duplicate question id ${q.id}`);
  seenQ.add(q.id);
}
// The "Study" links of a question: the notes pages of its objective that cite one of
// its sources, else the pages that also cover the objective and cite one, else any
// page that cites one. An empty list makes the app link every page of the objective.
const pageKey = (u) => u.split("#")[0].replace(/\/$/, "");
const citedBy = new Map();
for (const n of notes) {
  for (const m of noteText[n.id].matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
    const k = pageKey(m[1]);
    if (!citedBy.has(k)) citedBy.set(k, new Set());
    citedBy.get(k).add(n.id);
  }
}
for (const q of questions) {
  const hits = new Set(q.sources.flatMap((s) => [...(citedBy.get(pageKey(s.url)) || [])]));
  const cited = notes.filter((n) => hits.has(n.id));
  const own = cited.filter((n) => n.objective === q.objective);
  const also = cited.filter((n) => n.also.includes(q.objective));
  q.notes = (own.length ? own : also.length ? also : cited).map((n) => n.id);
}

// Flashcards: one file per author domain. A card takes the objective of its notes page.
const cards = [];
const noteIndex = new Map(notes.map((n, i) => [n.id, i]));
for (const f of listFiles(C("flashcards"), /\.json$/)) {
  let arr;
  try { arr = JSON.parse(read(f)); } catch (e) { warn(`${f}: invalid JSON (${e.message})`); continue; }
  for (const c of arr) {
    const n = c && notes[noteIndex.get(c.note)];
    if (!c || !c.id || !n) { warn(`${f}: skipped card ${c && c.id} (unknown note ${c && c.note})`); continue; }
    const src = `card:${c.id}`;
    cards.push({
      id: c.id, note: n.id, objective: n.objective, kind: c.kind === "concept" ? "concept" : "term",
      // No glossary marks on the front: a definition there gives away the answer.
      front: renderInline(c.front, src, { terms: false }), back: renderInline(c.back, src), aws: c.aws ? renderInline(c.aws, src, { terms: false }) : null,
      source: c.source ? { title: String(c.source.title || c.source.url), url: String(c.source.url), evidence: c.source.evidence ? String(c.source.evidence) : "" } : null,
    });
  }
}
cards.sort((a, b) => noteIndex.get(a.note) - noteIndex.get(b.note)); // reading order; stable inside a page
const seenC = new Set();
for (const c of cards) {
  if (seenC.has(c.id)) warn(`duplicate card id ${c.id}`);
  seenC.add(c.id);
}

// ---------- link integrity ----------
const noteIds = new Set(notes.map((n) => n.id));
const labIds = new Set(labs.map((l) => l.id));
const caseIds = new Set(cases.map((c) => c.id));
for (const [from, kind, id] of internalRefs) {
  const ok = kind === "note" ? noteIds.has(id) : kind === "lab" ? labIds.has(id) : caseIds.has(id);
  if (!ok) warn(`${from}: link to missing ${kind}:${id}`);
}
for (const n of notes) for (const l of n.labs) if (!labIds.has(l)) warn(`note:${n.id}: frontmatter lab ${l} not found`);

// ---------- services ----------
// content/services.json: one profile per service. The build finds where each service
// appears in the questions, notes, case studies, flashcards, and exam guide.
let serviceSpec = { categories: [], services: [] };
const servicesFile = C("services.json");
if (fs.existsSync(servicesFile)) {
  try { serviceSpec = JSON.parse(read(servicesFile)); } catch (e) { warn(`${rel(servicesFile)}: invalid JSON (${e.message})`); }
}
const serviceProblems = checkServices(serviceSpec, { noteIds, caseIds });
for (const p of serviceProblems) warn(`${G.content}/${p}`);

// ---------- glossary checks ----------
for (const p of checkGlossary(glossary, noteText)) warn(p);
const glossUnused = glossary.filter((e) => !glossUsed.has(e.id)).map((e) => e.term);
// Not a problem: a term that appears only in code is still on the Glossary page.
if (glossUnused.length) console.log(`  glossary terms marked nowhere (only in code or headings): ${glossUnused.join(", ")}`);
const noteTitle = Object.fromEntries(notes.map((n) => [n.id, n.title]));

// ---------- assemble ----------
const data = {
  builtAt: new Date().toISOString(),
  exam: {
    ...exam,
    sections: exam.sections.map((s) => ({
      ...s,
      objectives: s.objectives.map((o) => ({ ...o, considerationsHtml: (o.considerations || []).map((c) => gloss(esc(c))) })),
    })),
  },
  glossary: glossary
    .map((e) => ({ id: e.id, term: String(e.term), expansion: e.expansion ? String(e.expansion) : "", def: String(e.def || ""), aws: e.aws ? String(e.aws) : "", note: noteTitle[e.note] ? e.note : "" }))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" })),
  app, notes, cases, labs, questions, refs, cards,
};
let serviceData = { services: [], serviceCats: [], serviceGloss: {} };
try { serviceData = buildServices(serviceSpec, { exam, notes, questions, cases, cards, glossary: data.glossary }); } catch (e) { warn(`${rel(servicesFile)}: ${e.message}`); }
Object.assign(data, serviceData);
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const css = read(P("app", "src", "styles.css"));
const stripExports = (s) => s.replace(/^export\s+(?=(async\s+)?function|const|let|class)/gm, "").replace(/^export\s*\{[^}]*\};?\s*$/gm, "");
const js = [read(P("app", "src", "logic.js")), read(P("app", "src", "store.js")), read(P("app", "src", "app.js"))].map(stripExports).join("\n\n");
if (/^\s*import\s/m.test(js)) throw new Error("app source must not contain import statements");
let html = read(P("app", "src", "template.html"));
html = html.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js).replace("__DATA__", () => json)
  .replaceAll("__APP_NAME__", () => esc(app.name)).replaceAll("__APP_SUBTITLE__", () => esc(app.subtitle));

fs.mkdirSync(OUT(), { recursive: true });
fs.writeFileSync(OUT("index.html"), html);
const page = `${app.slug}.html`;

// The standalone page. The artifact publish step adds its own doctype, head,
// and reset rules, so add the same ones here. Without Claude, progress saves in
// the browser only.
const bodyAt = html.indexOf('<div class="app"');
if (bodyAt < 0) throw new Error('template.html must contain <div class="app">');
fs.rmSync(OUT("preview.html"), { force: true }); // replaced by pca-workbook.html
fs.writeFileSync(OUT(page), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>[hidden] { display: none !important; } img { max-width: 100%; }</style>
${html.slice(0, bodyAt).trim()}
</head>
<body>
${html.slice(bodyAt)}
</body>
</html>
`);

const byObj = {};
for (const q of questions) byObj[q.objective] = (byObj[q.objective] || 0) + 1;
console.log(`Built ${rel(OUT("index.html"))} and ${rel(OUT(page))} (${(html.length / 1024).toFixed(0)} KB each)`);
console.log(`  notes: ${notes.length} pages, ${notes.reduce((a, n) => a + n.words, 0).toLocaleString()} words`);
console.log(`  case studies: ${cases.filter((c) => c.textHtml).length} texts, ${cases.filter((c) => c.analysisHtml).length} analyses`);
console.log(`  labs: ${labs.length}`);
console.log(`  reference pages: ${refs.length}`);
console.log(`  glossary: ${glossary.length} terms, ${[...glossUsed.values()].reduce((a, b) => a + b, 0).toLocaleString()} marked uses`);
console.log(`  questions: ${questions.length} (${questions.filter((q) => q.caseStudy).length} case study)`);
console.log(`  services: ${data.services.length} in ${data.serviceCats.length} categories, ${data.services.filter((s) => s.guide.length).length} in the exam guide wording`);
console.log(`  flashcards: ${cards.length} (${cards.filter((c) => c.kind === "term").length} term, ${cards.filter((c) => c.kind === "concept").length} concept)`);
console.log(`  per objective: ${Object.entries(byObj).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([k, v]) => `${k}:${v}`).join(" ")}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log("  - " + p);
  if (strict) process.exit(1);
}

if (process.argv.includes("--share")) {
  // One zip to send to other people: the standalone page, plus the lab files that
  // the labs run from a terminal. Leaves out caches, editor files, and Terraform
  // state, but keeps files that a lab needs, such as .python-version.
  const stage = OUT(".share");
  const root = path.join(stage, app.slug);
  const zip = `${app.slug}.zip`;
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.copyFileSync(OUT(page), path.join(root, page));
  // The labs keep their path from the repo root, so their commands work unchanged.
  fs.cpSync(P(G.labs), path.join(root, G.labs), { recursive: true, filter: (src) => !/^(\.DS_Store|\.terraform|\.venv|__pycache__)$|\.pyc$|\.tfstate(\..*)?$/.test(path.basename(src)) });
  fs.writeFileSync(path.join(root, "README.txt"), `${app.name}: a study guide for the ${exam.exam} exam.

1. Open ${page} in a web browser on a computer. It has the notes,
   practice questions, mock exams,${cases.length ? " case studies," : ""} and lab steps. Your progress
   saves in that browser only.
2. To do the labs, open a terminal in this folder. The labs call this folder
   the repository root. Start with ${G.labs}/00-setup/README.md. The labs create
   resources in your own Google Cloud project, and those resources cost money.
`);
  fs.rmSync(OUT(zip), { force: true });
  execFileSync("zip", ["-qr", "-X", path.join("..", zip), app.slug], { cwd: stage });
  fs.rmSync(stage, { recursive: true, force: true });
  console.log(`Built ${rel(OUT(zip))} (${(fs.statSync(OUT(zip)).size / 1024).toFixed(0)} KB)`);
}
