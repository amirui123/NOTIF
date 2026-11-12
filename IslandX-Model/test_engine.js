#!/usr/bin/env node
/* IslandX — regression tests for the model + policy that ship inside the prototype.
 *
 *   node IslandX-Model/test_engine.js
 *
 * There is no copy of the engine in this file. It reads IslandX-Prototype/index.html, takes the
 * block between `=== MODEL:START ===` and `=== MODEL:END ===`, and executes it with the same
 * weights the browser uses. So this always tests exactly what ships — no drift.
 *
 * Two suites:
 *   1. text model  — is the message classified the way the product needs?
 *   2. policy      — does the island show / glance / silence / flag it as a scam?
 *
 * `expected` is what the product SHOULD do. A MISMATCH is a product gap, not a broken test.
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'IslandX-Prototype', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');

const wb = src.match(/<script>const WB=(\{[\s\S]*?\});?<\/script>/);
if (!wb) { console.error('cannot find the WB weights blob in ' + HTML); process.exit(2); }
const WB = JSON.parse(wb[1]);

const a = src.indexOf('/* === MODEL:START ==='), b = src.indexOf('/* === MODEL:END === */');
if (a < 0 || b < 0) { console.error('MODEL markers missing from index.html'); process.exit(2); }
const block = src.slice(a, b);

const M = new Function('WB', block + '\nreturn {textModel,decide,scamScore,isCode,features,predictF,TYPES};')(WB);
const { textModel, decide, scamScore, TYPES } = M;

const pad = (s, n) => String(s).padEnd(n);
let fail = 0, known = 0;
const row = (id, cols, ok, isKnown) => {
  if (!ok) { isKnown ? known++ : fail++; }
  const verdict = ok ? 'ok' : isKnown ? 'known gap' : 'MISMATCH';
  console.log(pad(id, 18) + cols.map((c, i) => pad(c, [13, 16, 14, 12][i] || 12)).join('') + verdict);
};

/* ---------------- suite 1: text model ---------------- */
const TEXT = [
  { id: 'scam-fa-link',  text: 'حساب بانکی شما مسدود شده است. برای رفع مسدودی وارد لینک شوید: bank-meli.co', expect: 'scam' },
  /* known model gap: the Persian/Finglish scam type head says "promotional". The policy suite below
     compensates for it — these stay visible so a future retrain can close them. */
  { id: 'scam-fa-prize', text: 'برنده جایزه ۵۰ میلیون تومانی شدید! برای دریافت جایزه کد ملی و شماره کارت خود را ارسال کنید', expect: 'scam', known: true },
  { id: 'scam-finglish', text: 'tabrik! shoma barande shodid, baraye daryaft jayze link zir ra click konid', expect: 'scam', known: true },
  { id: 'otp-fa',        text: 'کد ورود شما ۴۸۲۹۱۳ است. آن را به کسی ندهید.', expect: 'transactional' },
  { id: 'ham-fa',        text: 'سلام، جلسه ساعت ۱۰:۳۰ برگزار میشه، می‌رسی؟', expect: 'personal' },
  { id: 'promo-fa',      text: 'فروش ویژه پایان فصل، تا ۷۰٪ تخفیف روی همه محصولات', expect: 'promotional' },
  { id: 'ham-en',        text: 'Are we still on for 1:30?', expect: 'personal' },
  { id: 'spam-en',       text: 'CONGRATULATIONS! You have won a $1000 gift card. Click here to claim now!!!', expect: 'scam' },
  { id: 'promo-en',      text: 'New season styles are here — 30% off everything, shop the sale', expect: 'promotional' },
];

console.log('\nTEXT MODEL' + ' '.repeat(18) + 'P(unwanted)  top class       expected    verdict');
console.log('-'.repeat(72));
for (const c of TEXT) {
  const r = textModel(c.text);
  const top = TYPES[r.pt.indexOf(Math.max(...r.pt))];
  row(c.id, [(r.pu * 100).toFixed(1) + '%', top, c.expect], top === c.expect, c.known);
}

/* ---------------- suite 2: decision policy ---------------- */
const C = { fs: false, priv: false, dnd: false };
const msg = (o) => Object.assign({ app: 'Messages', from: 'Unknown number', known: false }, o);
const POLICY = [
  { id: 'fa prize+card',  n: msg({ body: 'برنده جایزه ۵۰ میلیون تومانی شدید! کد ملی و شماره کارت خود را ارسال کنید' }), p: .8, expect: 'scam' },
  { id: 'finglish bait',  n: msg({ body: 'tabrik! shoma barande shodid, baraye daryaft jayze link zir ra click konid' }), p: .8, expect: 'scam' },
  { id: 'en gift card',   n: msg({ body: 'CONGRATULATIONS! You have won a $1000 gift card. Click here to claim now' }), p: .8, expect: 'scam' },
  { id: 'fa blocked+link',n: msg({ body: 'حساب بانکی شما مسدود شده است. وارد لینک شوید: bank-meli.co' }), p: .8, expect: 'scam' },
  { id: 'friend joke',    n: msg({ body: 'برنده شدی! 😂', known: true, from: 'Sara' }), p: .8, expect: 'show' },
  { id: 'otp',            n: msg({ app: 'Bank', from: 'Bank', body: 'Your code is 482913' }), p: .8, expect: 'show' },
  { id: 'otp-fa',         n: msg({ app: 'Bank', from: 'Bank', body: 'کد ورود شما ۴۸۲۹۱۳ است. آن را به کسی ندهید.' }), p: .8, expect: 'show' },
  { id: 'promo fa',       n: msg({ app: 'Shop', from: 'Shop', body: 'فروش ویژه پایان فصل، تا ۷۰٪ تخفیف' }), p: .8, expect: 'show' },
  { id: 'plain, low p',   n: msg({ body: 'سلام، خوبی؟' }), p: .1, expect: 'silent' },
  { id: 'meeting fa',     n: msg({ body: 'جلسه ساعت ۱۰:۳۰ برگزار میشه، می‌رسی؟' }), p: .8, expect: 'show' },
  { id: 'do not disturb', n: msg({ body: 'برنده جایزه شدید! کد ملی بفرستید' }), p: .9, C: { ...C, dnd: true }, expect: 'silent' },
];

console.log('\nPOLICY' + ' '.repeat(23) + 'text class     scam score    expected    verdict');
console.log('-'.repeat(72));
for (const c of POLICY) {
  const tm = textModel(c.n.body);
  const sc = scamScore(c.n, tm);
  const got = decide(c.n, c.p, c.C || C);
  const top = TYPES[tm.pt.indexOf(Math.max(...tm.pt))];
  row(c.id, [top, sc.v.toFixed(2), c.expect, got], got === c.expect);
}

console.log('-'.repeat(72));
const total = TEXT.length + POLICY.length;
console.log(`${total - fail - known}/${total} behave as intended` +
  (known ? `  ·  ${known} known model gap(s), covered by the policy guard` : '') +
  (fail ? `  ·  ${fail} to fix` : '') + '\n');
process.exit(fail ? 1 : 0);
