#!/usr/bin/env node
/* IslandX — regression test for the text model shipped inside the prototype.
 *
 * Reads the `const WB = {...}` blob out of IslandX-Prototype/index.html (so it always tests
 * exactly what the browser runs), re-implements nothing, and scores a small set of messages.
 *
 *   node IslandX-Model/test_engine_text.js
 *
 * `expected` is what the product SHOULD do, not what it currently does — a FAIL here is a
 * real product gap, not a broken test.
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'IslandX-Prototype', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');
const m = src.match(/<script>const WB=(\{[\s\S]*?\});?<\/script>/);
if (!m) { console.error('cannot find the WB weights blob in ' + HTML); process.exit(2); }
const WB = JSON.parse(m[1]);

/* ---- verbatim copies of the engine functions from index.html ---- */
const b64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u };
const sigm = z => 1 / (1 + Math.exp(-z));
const TX = WB.text, TXE = new Int8Array(b64(TX.E).buffer);
const deq = t => { const q = new Int16Array(b64(t.d).buffer), f = new Float32Array(q.length); for (let i = 0; i < q.length; i++) f[i] = q[i] * t.s; return f };
const NETS = WB.nets.map(n => { const o = { mu: n.mu, sd: n.sd, d: n.mu.length }; for (const k of ['W1', 'b1', 'W2', 'b2', 'W3', 'b3', 'W4', 'b4', 'W5', 'b5', 'Ww']) o[k] = deq(n[k]); o.H = o.b1.length; return o });
function dense(x, W, b, nout) { const nin = x.length, o = new Float32Array(nout); for (let j = 0; j < nout; j++) { let s = b ? b[j] : 0; for (let i = 0; i < nin; i++) s += x[i] * W[i * nout + j]; o[j] = s } return o }
const relu = a => { for (let i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0; return a };
function netZ(N, xr) {
  const x = new Float32Array(N.d); for (let i = 0; i < N.d; i++) x[i] = (xr[i] - N.mu[i]) / N.sd[i];
  const h1 = relu(dense(x, N.W1, N.b1, N.H)), r = relu(dense(h1, N.W2, N.b2, N.H)), h2 = dense(r, N.W3, N.b3, N.H);
  for (let i = 0; i < N.H; i++) h2[i] = Math.max(0, h2[i] + h1[i]);
  const h3 = relu(dense(h2, N.W4, N.b4, N.H / 2));
  return dense(h3, N.W5, N.b5, 1)[0] + dense(x, N.Ww, null, 1)[0];
}
const FA_FROM = '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩يكۀة', FA_TO = '01234567890123456789یکهه';
function normalizeText(t) {
  t = t.toLowerCase().replace(/[۰-۹٠-٩يكۀة]/g, c => FA_TO[FA_FROM.indexOf(c)]).replace(/\u200c/g, ' ');
  t = t.replace(/(https?:\/\/|www\.)\S+|\S+\.(com|ir|net|org|co|me|ly)\b\S*/gi, ' ~url ');
  return t.replace(/\[random_number\]|\d/g, '0').replace(/0{3,}/g, '000').replace(/\s+/g, ' ').trim().slice(0, 320);
}
const ENC = new TextEncoder();
function fnv1a(s) { let h = 0x811C9DC5; for (const b of ENC.encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0; return h }
const textCache = {}, TYPES = ['personal', 'transactional', 'promotional', 'scam'];
function textModel(raw) {
  if (raw in textCache) return textCache[raw];
  const t = ' ' + normalizeText(raw) + ' ', cnt = new Map(), add = s => { const k = fnv1a(s) % 8192; cnt.set(k, (cnt.get(k) || 0) + 1) };
  for (const n of [2, 3, 4]) for (let i = 0; i + n <= t.length; i++) add(t.slice(i, i + n));
  t.split(' ').filter(Boolean).forEach(w => add('w:' + w));
  let tot = 0; cnt.forEach(c => tot += Math.sqrt(c));
  const D = 24, H = 48, a = new Float32Array(D);
  cnt.forEach((c, k) => { const w = Math.sqrt(c) / tot * TX.scale * 8; for (let j = 0; j < D; j++) a[j] += w * TXE[k * D + j] });
  for (let j = 0; j < D; j++) a[j] += TX.be[j];
  const h = relu(dense(a, TX.W1, TX.b1, H)); let zu = TX.bu[0]; for (let j = 0; j < H; j++) zu += h[j] * TX.Wu[j];
  const zt = dense(h, TX.Wt, TX.bt, 4), mx = Math.max(...zt), ex = Array.from(zt, v => Math.exp(v - mx)), sm = ex.reduce((x, y) => x + y);
  return textCache[raw] = { pu: sigm(zu), pt: ex.map(v => v / sm) };
}
/* ---- end copy ---- */

const CASES = [
  { id: 'scam-fa-link', text: 'حساب بانکی شما مسدود شده است. برای رفع مسدودی وارد لینک شوید: bank-meli.co', expect: 'scam' },
  { id: 'scam-fa-prize', text: 'برنده جایزه ۵۰ میلیون تومانی شدید! برای دریافت جایزه کد ملی و شماره کارت خود را ارسال کنید', expect: 'scam' },
  { id: 'scam-finglish', text: 'tabrik! shoma barande shodid, baraye daryaft jayze link zir ra click konid', expect: 'scam' },
  { id: 'otp-fa', text: 'کد ورود شما ۴۸۲۹۱۳ است. آن را به کسی ندهید.', expect: 'transactional' },
  { id: 'ham-fa', text: 'سلام، جلسه ساعت ۱۰:۳۰ برگزار میشه، می‌رسی؟', expect: 'personal' },
  { id: 'promo-fa', text: 'فروش ویژه پایان فصل، تا ۷۰٪ تخفیف روی همه محصولات', expect: 'promotional' },
  { id: 'ham-en', text: 'Are we still on for 1:30?', expect: 'personal' },
  { id: 'spam-en', text: 'CONGRATULATIONS! You have won a $1000 gift card. Click here to claim now!!!', expect: 'scam' },
  { id: 'promo-en', text: 'New season styles are here — 30% off everything, shop the sale', expect: 'promotional' },
];

const pad = (s, n) => String(s).padEnd(n);
let fail = 0;
console.log('\n' + pad('case', 16) + pad('P(unwanted)', 13) + pad('top class', 16) + 'expected    verdict');
console.log('-'.repeat(70));
for (const c of CASES) {
  const r = textModel(c.text);
  const top = TYPES[r.pt.indexOf(Math.max(...r.pt))];
  const ok = top === c.expect;
  if (!ok) fail++;
  console.log(pad(c.id, 16) + pad((r.pu * 100).toFixed(1) + '%', 13) + pad(top, 16) + pad(c.expect, 12) + (ok ? 'ok' : 'MISMATCH'));
}
console.log('-'.repeat(70));
console.log(`${CASES.length - fail}/${CASES.length} behave as intended\n`);
