// Glossary terms in rendered HTML. The build marks terms from
// content/glossary.json as <span class="gl" data-g="id">; the app shows a card
// on hover (or tap) with the definition.
//
// Rules:
// - Match strings are case-sensitive. An ALL-CAPS string also matches with a
//   plural "s" (MIG -> MIGs). A lowercase string also matches Capitalized.
// - The longest match wins ("HA VPN" before "VPN").
// - A term right after "AWS" or "Amazon" (plus up to two capitalized words)
//   is part of an AWS product name, so it is left alone.
// - Text inside links, code, headings, and keyboard keys is left alone.
// - Only the first use of a term in each section (from one <h2> to the next)
//   is marked, so a long page does not fill with underlines.

const SKIP = new Set(["a", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "kbd", "script", "style", "button"]);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const glossaryId = (term) => String(term).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// The strings that match one entry, with generated variants.
export function variantsOf(entry) {
  const out = new Set();
  for (const raw of [entry.term, ...(entry.match || [])]) {
    const s = String(raw).trim();
    if (!s) continue;
    out.add(s);
    if (/^[A-Z0-9][A-Z0-9-]*[A-Z0-9]$/.test(s) && /[A-Z]/.test(s) && !s.endsWith("S")) out.add(s + "s");
    if (/^[a-z]/.test(s)) out.add(s[0].toUpperCase() + s.slice(1));
  }
  return [...out];
}

export function buildMatcher(entries) {
  const byString = new Map();
  const clashes = new Set();
  for (const e of entries) {
    const id = e.id || glossaryId(e.term);
    for (const v of variantsOf(e)) {
      const prev = byString.get(v);
      if (prev && prev !== id) clashes.add(`"${v.replace(/s$/, "")}" matches both ${prev} and ${id}`);
      else byString.set(v, id);
    }
  }
  const alts = [...byString.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b)).map(escRe);
  // Not inside an AWS product name ("AWS VPN", "AWS Cloud Adoption Framework"):
  // the cards explain Google Cloud terms.
  const re = alts.length ? new RegExp(`(?<![\\w-])(?<!\\b(?:AWS|Amazon)(?: [A-Z][\\w-]*){0,2} )(?:${alts.join("|")})(?![\\w])`, "g") : null;
  return { re, byString, clashes: [...clashes] };
}

// Returns the HTML with terms marked. `used` (optional Map id -> count)
// collects which entries matched, for the build report.
export function glossify(html, matcher, used) {
  if (!matcher.re || !html) return html;
  const parts = String(html).split(/(<[^>]*>)/);
  let skip = 0;
  let seen = new Set();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (p[0] === "<") {
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(p);
      if (!m) continue;
      const name = m[2].toLowerCase();
      const closing = m[1] === "/";
      if (name === "h2" && !closing) seen = new Set();
      if (SKIP.has(name) && !p.endsWith("/>")) skip += closing ? -1 : 1;
      if (skip < 0) skip = 0;
      continue;
    }
    if (skip) continue;
    parts[i] = p.replace(matcher.re, (s) => {
      const id = matcher.byString.get(s);
      if (!id || seen.has(id)) return s;
      seen.add(id);
      if (used) used.set(id, (used.get(id) || 0) + 1);
      return `<span class="gl" data-g="${escHtml(id)}">${s}</span>`;
    });
  }
  return parts.join("");
}

// Checks for content/glossary.json. `notes` maps note id -> plain text.
export function checkGlossary(entries, notes) {
  const problems = [];
  const ids = new Set();
  entries.forEach((e, i) => {
    const where = `glossary[${i}] ${e && e.term ? e.term : "?"}`;
    if (!e || typeof e.term !== "string" || !e.term.trim()) { problems.push(`${where}: missing term`); return; }
    const id = e.id || glossaryId(e.term);
    if (ids.has(id)) problems.push(`${where}: duplicate id ${id}`);
    ids.add(id);
    if (typeof e.def !== "string" || !e.def.trim()) problems.push(`${where}: missing def`);
    else {
      const n = e.def.trim().split(/\s+/).length;
      if (n > 45) problems.push(`${where}: def has ${n} words (max 45)`);
      if (/[`[\]<>]/.test(e.def)) problems.push(`${where}: def must be plain text`);
    }
    if (!e.note) problems.push(`${where}: missing note`);
    else if (!(e.note in notes)) problems.push(`${where}: note ${e.note} not found`);
    else if (!variantsOf(e).some((v) => notes[e.note].includes(v))) problems.push(`${where}: note ${e.note} does not mention the term`);
  });
  return problems;
}
