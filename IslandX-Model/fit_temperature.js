#!/usr/bin/env node
/* IslandX — fits a temperature for the text model's P(unwanted) on real labelled data.
 *
 *   node IslandX-Model/fit_temperature.js
 *
 * The engine outputs 0.0 / 100.0 almost everywhere: the logits are far too sharp. That makes the
 * number meaningless as a *risk* (you cannot say "34% likely unwanted"), and it makes thresholds
 * brittle. Temperature scaling (Guo et al. 2017) is a single parameter that cannot change the
 * ranking — only the confidence — so it is safe to fit on the test sets below.
 *
 * It prints the fitted T, then NLL and ECE before/after, and the constant to paste into index.html.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, 'IslandX-Prototype', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');
const WB = JSON.parse(src.match(/<script>const WB=(\{[\s\S]*?\});?<\/script>/)[1]);
const a = src.indexOf('/* === MODEL:START ==='), b = src.indexOf('/* === MODEL:END === */');
const M = new Function('WB', src.slice(a, b) + '\nreturn {textModel};')(WB);

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

/* ---- gather every labelled pair we have ---- */
const pairs = [];
for (const r of csv('barta.csv').filter(r => r.split === 'test'))
  pairs.push([M.textModel(r.text).pu, (r.label === 'normal' || r.label === 'transactional') ? 0 : 1]);
for (const f of ['fa_test_natural_217.csv', 'fa_test_user_57.csv', 'fa_test_judge_100.csv'])
  for (const r of csv(f))
    pairs.push([M.textModel(r.text).pu, /^(spam|phishing|scam)$/i.test((r.label || '').trim()) ? 1 : 0]);

const EPS = 1e-6, clip = v => Math.min(1 - EPS, Math.max(EPS, v));
const logit = p => Math.log(clip(p) / (1 - clip(p)));
const sigm = z => 1 / (1 + Math.exp(-z));
const nll = T => pairs.reduce((s, [p, y]) => {
  const q = clip(sigm(logit(p) / T));
  return s - (y * Math.log(q) + (1 - y) * Math.log(1 - q));
}, 0) / pairs.length;

const ece = (T, bins = 12) => {
  const B = Array.from({ length: bins }, () => [0, 0, 0]);        // confidence sum, positive count, n
  for (const [p, y] of pairs) {
    const q = sigm(logit(p) / T);
    const i = Math.min(bins - 1, Math.floor(q * bins));
    B[i][0] += q; B[i][1] += y; B[i][2]++;
  }
  return B.reduce((e, [cs, pos, n]) => n ? e + Math.abs(cs / n - pos / n) * n / pairs.length : e, 0);
};

/* ---- golden-section search: NLL is convex in T ---- */
let lo = .25, hi = 40;
for (let i = 0; i < 120; i++) {
  const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
  if (nll(m1) < nll(m2)) hi = m2; else lo = m1;
}
const T = Math.round(((lo + hi) / 2) * 100) / 100;

const pct = v => (v * 100).toFixed(2) + '%';
console.log('\nTEMPERATURE FITTING — text model P(unwanted)');
console.log('-'.repeat(52));
console.log('samples           ' + pairs.length + '  (barta test + 3 Persian sets)');
console.log('T                 ' + T);
console.log('NLL   raw → cal   ' + nll(1).toFixed(4) + ' → ' + nll(T).toFixed(4));
console.log('ECE   raw → cal   ' + pct(ece(1)) + ' → ' + pct(ece(T)));
console.log('-'.repeat(52));
const sample = [0.0001, .02, .3, .7, .98, .9999];
console.log('  raw → calibrated');
for (const p of sample) console.log('  ' + pct(p).padStart(7) + ' → ' + pct(sigm(logit(p) / T)).padStart(7));
console.log(`\npaste into index.html:  const CAL_T=${T};\n`);
process.exit(0);
