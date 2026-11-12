#!/usr/bin/env node
/* IslandX — evaluates the SHIPPED engine (the int8 weights inside the prototype) on the real
 * test sets in data/, and compares the result with the numbers reported in metrics_text.json.
 *
 *   node IslandX-Model/eval_engine.js
 *
 * Why: the Python metrics describe the float model. What users actually run is the quantised
 * engine exported by export_js.py. If the two disagree, the export is lossy — and nobody notices,
 * because only the Python numbers were ever measured.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'IslandX-Prototype', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');
const WB = JSON.parse(src.match(/<script>const WB=(\{[\s\S]*?\});?<\/script>/)[1]);
const a = src.indexOf('/* === MODEL:START ==='), b = src.indexOf('/* === MODEL:END === */');
const M = new Function('WB', src.slice(a, b) + '\nreturn {textModel,TYPES};')(WB);
const { textModel, TYPES } = M;

/* ---- minimal CSV reader (quotes, CRLF, BOM) ---- */
function csv(file) {
  let s = fs.readFileSync(path.join(__dirname, 'data', file), 'utf8').replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift().map(h => h.trim().toLowerCase());
  return rows.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

/* ---- metrics ---- */
function evaluate(name, items) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const scored = [];
  for (const { text, y } of items) {
    if (!text || !String(text).trim()) continue;
    const p = textModel(String(text)).pu;
    scored.push([p, y]);
    const pred = p >= .5 ? 1 : 0;
    if (pred && y) tp++; else if (pred && !y) fp++; else if (!pred && !y) tn++; else fn++;
  }
  const n = tp + fp + tn + fn;
  const acc = (tp + tn) / n, prec = tp / (tp + fp || 1), rec = tp / (tp + fn || 1);
  const f1 = 2 * prec * rec / (prec + rec || 1);
  scored.sort((x, z) => x[0] - z[0]);
  return { name, n, acc, prec, rec, f1, auc: aucOf(scored) };
}
function aucOf(scored) {                        /* Mann–Whitney U, ties share the average rank */
  let i = 0, rankSum = 0, pos = 0;
  const n = scored.length;
  while (i < n) {
    let j = i;
    while (j + 1 < n && scored[j + 1][0] === scored[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (scored[k][1]) { rankSum += avgRank; pos++; }
    i = j + 1;
  }
  const neg = n - pos;
  if (!pos || !neg) return NaN;
  return (rankSum - pos * (pos + 1) / 2) / (pos * neg);
}

const pct = v => isNaN(v) ? '  —  ' : (v * 100).toFixed(1).padStart(5) + '%';
const pad = (s, n) => String(s).padEnd(n);

const suites = [];

/* 1. Barta (English / Bangla / Banglish / codemix) — authors' leak-free test split */
const barta = csv('barta.csv').filter(r => r.split === 'test');
suites.push(evaluate('Barta test (en/bn)', barta.map(r => ({ text: r.text, y: r.label === 'normal' || r.label === 'transactional' ? 0 : 1 }))));
suites.push(evaluate('  · english only', barta.filter(r => r.lang === 'english').map(r => ({ text: r.text, y: r.label === 'normal' || r.label === 'transactional' ? 0 : 1 }))));
suites.push(evaluate('  · bangla/banglish', barta.filter(r => r.lang !== 'english').map(r => ({ text: r.text, y: r.label === 'normal' || r.label === 'transactional' ? 0 : 1 }))));

/* 2. Persian test sets */
const P = [
  ['fa natural_217', 'fa_test_natural_217.csv'],
  ['fa user_57', 'fa_test_user_57.csv'],
  ['fa judge_100', 'fa_test_judge_100.csv'],
];
const faAll = [];
for (const [name, file] of P) {
  const rows = csv(file);
  const items = rows.map(r => ({ text: r.text, y: /^(spam|phishing|scam)$/i.test((r.label || '').trim()) ? 1 : 0 }));
  faAll.push(...items);
  suites.push(evaluate(name, items));
}
suites.push(evaluate('fa all (3 sets)', faAll));

/* ---- report ---- */
console.log('\nSHIPPED ENGINE (int8, inside index.html)');
console.log('-'.repeat(78));
console.log(pad('suite', 20) + pad('n', 7) + pad('acc', 8) + pad('prec', 8) + pad('recall', 8) + pad('f1', 8) + 'auc');
for (const s of suites) {
  console.log(pad(s.name, 20) + pad(s.n, 7) + pad(pct(s.acc), 8) + pad(pct(s.prec), 8) + pad(pct(s.rec), 8) + pad(pct(s.f1), 8) + pct(s.auc));
}

let reported = null;
try { reported = JSON.parse(fs.readFileSync(path.join(__dirname, 'metrics_text.json'), 'utf8')); } catch (e) { }
if (Array.isArray(reported)) {
  console.log('\nREPORTED in metrics_text.json (float / python)');
  console.log('-'.repeat(78));
  console.log(pad('model', 26) + pad('lang', 6) + pad('n', 7) + pad('acc', 8) + pad('f1', 8) + 'auc');
  for (const r of reported) console.log(pad(r.model, 26) + pad(r.lang, 6) + pad(r.n, 7) + pad(pct(r.accuracy), 8) + pad(pct(r.f1), 8) + pct(r.auc));
}
console.log();
