// Service profiles: find where each Google Cloud service appears in the built content.
// content/services.json holds the profiles and the text patterns that find each service.
// A pattern is a JavaScript regular expression; a leading "(?i)" makes it case-insensitive.

/** Compile a pattern string. Returns a global RegExp. */
export function compilePattern(p) {
  const i = p.startsWith("(?i)");
  return new RegExp(i ? p.slice(4) : p, i ? "gi" : "g");
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Rendered HTML to plain text, so patterns match the words that the reader sees. */
export function plainText(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ");
}

function hit(rx, text) {
  return rx.some((r) => { r.lastIndex = 0; return r.test(text); });
}
function count(rx, text) {
  return rx.reduce((n, r) => n + (text.match(r) || []).length, 0);
}

/**
 * Check content/services.json. Returns a list of problems (strings).
 * noteIds and caseIds are Sets of valid ids.
 */
export function checkServices(spec, { noteIds, caseIds }) {
  const out = [];
  const cats = new Set((spec.categories || []).map((c) => c.id));
  const ids = new Set();
  for (const s of spec.services || []) {
    if (!s.id || ids.has(s.id)) out.push(`services: missing or duplicate id ${s.id}`);
    ids.add(s.id);
  }
  for (const c of spec.categories || []) {
    for (const r of c.decide || []) for (const id of r.then || []) if (!ids.has(id)) out.push(`services: category ${c.id}: unknown service ${id}`);
  }
  for (const s of spec.services || []) {
    const at = `services: ${s.id}`;
    if (!cats.has(s.category)) out.push(`${at}: unknown category ${s.category}`);
    for (const k of ["name", "what"]) if (!s[k]) out.push(`${at}: missing ${k}`);
    if (!(s.cues || []).length) out.push(`${at}: no cues`);
    if (!(s.patterns || []).length) out.push(`${at}: no patterns`);
    for (const p of [...(s.patterns || []), ...(s.guidePatterns || [])]) {
      try { compilePattern(p); } catch (e) { out.push(`${at}: bad pattern ${p} (${e.message})`); }
    }
    for (const x of s.confused || []) if (!ids.has(x.with)) out.push(`${at}: confused with unknown service ${x.with}`);
    for (const src of s.sources || []) {
      const m = /^case:(.+)$/.exec(src);
      if (m ? !caseIds.has(m[1]) : !noteIds.has(src)) out.push(`${at}: unknown source ${src}`);
    }
  }
  return out;
}

/**
 * Build the app data for the Services tab from the built notes, questions, cases, and cards.
 * For each service: q.a = questions with it in a correct option, q.d = only in wrong options,
 * q.c = only in the stem, the explanation, or the reasons why options are wrong.
 */
export function buildServices(spec, { exam, notes, questions, cases, cards, glossary }) {
  const noteIds = new Set(notes.map((n) => n.id));
  const cardIds = new Set(cards.map((c) => c.id));
  const qText = questions.map((q) => ({
    q,
    stem: plainText(q.stem),
    opts: Object.fromEntries(q.options.map((o) => [o.id, plainText(o.html)])),
    rest: plainText(q.explanation) + " " + Object.values(q.whyWrong || {}).map(plainText).join(" "),
  }));
  const noteTxt = notes.map((n) => [n.id, plainText(n.html)]);
  const caseTxt = cases.map((c) => [c.id, plainText(c.textHtml), plainText(c.analysisHtml)]);
  const cardTxt = cards.map((c) => [c.id, plainText(c.front + " " + c.back)]);
  const objectives = exam.sections.flatMap((s) => s.objectives);

  const services = spec.services.map((s) => {
    const rx = s.patterns.map(compilePattern);
    const q = { a: [], d: [], c: [] };
    const cases = {};
    for (const { q: qq, stem, opts, rest } of qText) {
      const inA = qq.answer.some((a) => opts[a] != null && hit(rx, opts[a]));
      const inD = Object.entries(opts).some(([k, t]) => !qq.answer.includes(k) && hit(rx, t));
      if (!(inA || inD || hit(rx, stem) || hit(rx, rest))) continue;
      (inA ? q.a : inD ? q.d : q.c).push(qq.id);
      if (qq.caseStudy) cases[qq.caseStudy] = (cases[qq.caseStudy] || 0) + 1;
    }
    const grx = rx.concat((s.guidePatterns || []).map(compilePattern));
    const guide = [];
    for (const o of objectives) {
      const lines = [o.title, ...(o.considerations || [])].filter((l) => hit(grx, l));
      if (lines.length) guide.push([o.id, lines]);
    }
    // Notes to read: the profile's own sources first, then the pages that name it most.
    const mentions = noteTxt.map(([id, t]) => [id, count(rx, t)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const reading = [];
    for (const id of [...(s.sources || []).filter((x) => noteIds.has(x)), ...mentions.map(([id]) => id)]) if (!reading.includes(id)) reading.push(id);
    return {
      id: s.id, name: s.name, cat: s.category, formerly: s.formerly || "",
      what: s.what, cues: s.cues || [], traps: s.traps || [],
      confused: (s.confused || []).map((x) => ({ with: x.with, tell: x.tell })),
      aws: s.aws || "", docs: s.docs || { title: "", url: "" },
      notes: reading.slice(0, 5),
      q, guide, cases,
      caseNamed: caseTxt.filter(([, , a]) => hit(rx, a)).map(([id]) => id),
      cards: cardTxt.filter(([, t]) => hit(rx, t)).map(([id]) => id).filter((id) => cardIds.has(id)),
    };
  });

  // A glossary term links to a service profile when one of its patterns covers most of the term.
  const serviceGloss = {};
  for (const g of glossary) {
    let best = null;
    for (const s of spec.services) {
      for (const p of s.patterns) {
        const r = compilePattern(p);
        const m = r.exec(g.term);
        if (m && m[0].length >= 0.6 * g.term.length && (!best || m[0].length > best[0])) best = [m[0].length, s.id];
      }
    }
    if (best) serviceGloss[g.id] = best[1];
  }

  const serviceCats = spec.categories.map((c) => ({ id: c.id, name: c.name, short: c.short || c.name, blurb: c.blurb || "", intro: c.intro || "", decide: c.decide || [] }));
  return { services, serviceCats, serviceGloss };
}
