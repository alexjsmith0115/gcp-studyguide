import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMatcher, glossify, variantsOf, checkGlossary, glossaryId } from "../glossary.mjs";

const entries = [
  { term: "VPN", def: "d", note: "n" },
  { term: "HA VPN", def: "d", note: "n" },
  { term: "MIG", expansion: "Managed instance group", def: "d", note: "n" },
  { term: "Cloud Run functions", match: ["Cloud Functions"], def: "d", note: "n" },
  { term: "error budget", def: "d", note: "n" },
];
const m = buildMatcher(entries);
const mark = (id, s) => `<span class="gl" data-g="${id}">${s}</span>`;

test("variantsOf: plural for all-caps, capital for lowercase", () => {
  assert.deepEqual(variantsOf({ term: "MIG" }), ["MIG", "MIGs"]);
  assert.deepEqual(variantsOf({ term: "error budget" }), ["error budget", "Error budget"]);
  assert.deepEqual(variantsOf({ term: "Cloud Run" }), ["Cloud Run"]);
  assert.deepEqual(variantsOf({ term: "SOC 2" }), ["SOC 2"]);
  assert.deepEqual(variantsOf({ term: "LOA-CFA" }), ["LOA-CFA", "LOA-CFAs"]);
});

test("glossify: longest match wins", () => {
  assert.equal(glossify("<p>Use HA VPN here.</p>", m), `<p>Use ${mark("ha-vpn", "HA VPN")} here.</p>`);
});

test("glossify: plural and alias map to the entry", () => {
  assert.equal(glossify("<p>Two MIGs and Cloud Functions.</p>", m), `<p>Two ${mark("mig", "MIGs")} and ${mark("cloud-run-functions", "Cloud Functions")}.</p>`);
});

test("glossify: whole words only", () => {
  assert.equal(glossify("<p>MIGRATE a MIG2 thing</p>", m), "<p>MIGRATE a MIG2 thing</p>");
  assert.equal(glossify("<p>pre-VPN</p>", m), "<p>pre-VPN</p>");
  assert.equal(glossify("<p>VPN-based</p>", m), `<p>${mark("vpn", "VPN")}-based</p>`);
});

test("glossify: skips the AWS product of the same name", () => {
  assert.equal(glossify("<p>AWS VPN and Amazon VPN, then VPN</p>", m), `<p>AWS VPN and Amazon VPN, then ${mark("vpn", "VPN")}</p>`);
  assert.equal(glossify("<p>AWS Site VPN, then AWS and VPN</p>", m), `<p>AWS Site VPN, then AWS and ${mark("vpn", "VPN")}</p>`);
});

test("glossify: skips links, code, and headings", () => {
  const html = '<h2 id="vpn">VPN</h2><p><a href="#x">VPN</a> <code>VPN</code> and VPN</p>';
  assert.equal(glossify(html, m), `<h2 id="vpn">VPN</h2><p><a href="#x">VPN</a> <code>VPN</code> and ${mark("vpn", "VPN")}</p>`);
});

test("glossify: first use per section only", () => {
  const html = "<p>MIG and MIG</p><ul><li>MIG</li></ul><h2>B</h2><p>MIG</p>";
  assert.equal(glossify(html, m), `<p>${mark("mig", "MIG")} and MIG</p><ul><li>MIG</li></ul><h2>B</h2><p>${mark("mig", "MIG")}</p>`);
});

test("glossify: capitalized lowercase term, attributes untouched", () => {
  const html = '<p title="VPN">Error budget</p>';
  assert.equal(glossify(html, m), `<p title="VPN">${mark("error-budget", "Error budget")}</p>`);
});

test("glossify: counts uses", () => {
  const used = new Map();
  glossify("<p>VPN</p><h2>x</h2><p>VPN</p>", m, used);
  assert.equal(used.get("vpn"), 2);
});

test("buildMatcher: reports a string claimed by two entries", () => {
  const x = buildMatcher([{ term: "PSC", def: "d", note: "n" }, { term: "Private Service Connect", match: ["PSC"], def: "d", note: "n" }]);
  assert.equal(x.clashes.length, 1);
});

test("checkGlossary: note must exist and mention the term", () => {
  const notes = { a: "This page covers HA VPN.", b: "Nothing here." };
  assert.deepEqual(checkGlossary([{ term: "HA VPN", def: "Two interfaces.", note: "a" }], notes), []);
  assert.equal(checkGlossary([{ term: "HA VPN", def: "x", note: "b" }], notes).length, 1);
  assert.equal(checkGlossary([{ term: "HA VPN", def: "x", note: "zz" }], notes).length, 1);
  assert.equal(checkGlossary([{ term: "HA VPN", def: "Use `x`.", note: "a" }], notes).length, 1);
  assert.equal(glossaryId("Cloud Run functions"), "cloud-run-functions");
});
