#!/usr/bin/env node
/* IslandX — context-policy tests.
 *
 *   node IslandX-Model/test_context.js
 *
 * The island's decision is not "how important is this notification" alone. It is
 * "how important is it, against how receptive is the person right now". This suite locks in the
 * second half: the context vector (battery, charging, focus, DND, burst, dismissals, engagement)
 * and the fact that it moves the decision thresholds in the right direction.
 *
 * Like test_engine.js it executes the MODEL block straight out of the prototype — no copy, no drift.
 */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'IslandX-Prototype', 'index.html');
const src = fs.readFileSync(HTML, 'utf8');

const wb = src.match(/<script>const WB=(\{[\s\S]*?\});?<\/script>/);
if (!wb) { console.error('cannot find the WB weights blob'); process.exit(2); }
const a = src.indexOf('/* === MODEL:START ==='), b = src.indexOf('/* === MODEL:END === */');
if (a < 0 || b < 0) { console.error('MODEL markers missing'); process.exit(2); }
const M = new Function('WB', src.slice(a, b) + '\nreturn {contextSense,thresholds,calib,decide,textModel,CAL_T};')(JSON.parse(wb[1]));
const { contextSense, thresholds, calib, decide, CAL_T } = M;

const pad = (s, n) => String(s).padEnd(n);
let fail = 0;
const check = (id, cols, ok, note = '') => {
  if (!ok) fail++;
  console.log(pad(id, 26) + cols.map(c => pad(c, 20)).join('') + (ok ? 'ok' : 'FAIL') + (note ? '  ' + note : ''));
};

const base = { fs: 0, music: 0, timer: 0, priv: 0, dnd: 0, battery: 64, charging: 0, load: 0, fatigue: 0, engagement: .5 };
const C = o => ({ ...base, ...o });
const n = (body = 'Are we still on for 1:30?', extra = {}) =>
  ({ app: 'Telegram', from: 'Sara', body, known: 1, c: '#38BDF8', ...extra });

console.log('\nCONTEXT POLICY — the island decides on a vector, not a single score');
console.log('-'.repeat(96));

/* 1. the bar moves in the right direction ------------------------------------------------------ */
const calm = thresholds(contextSense(C({ charging: 1, engagement: .9 })));
const tense = thresholds(contextSense(C({ battery: 8, load: 7, fatigue: .8, fs: 1 })));
check('bar rises when saturated', [`show ${(calm.show * 100).toFixed(0)}% → ${(tense.show * 100).toFixed(0)}%`],
  tense.show > calm.show + .1);
check('bar falls when receptive', [`glance ${(calm.glance * 100).toFixed(0)}% vs ${(tense.glance * 100).toFixed(0)}%`],
  calm.glance < tense.glance - .05);

/* 2. the same message, different moment -------------------------------------------------------- */
const mid = n('can you send the deck?', { known: 0 });      // not urgent, not from a contact
const atCalm = decide({ ...mid }, .62, C({ charging: 1, engagement: .9 }));
const atTense = decide({ ...mid }, .62, C({ battery: 8, load: 7, fatigue: .8 }));
check('same message, calm moment', [`p=62% → ${atCalm}`, `→ ${atTense}`], atCalm === 'show' && atTense === 'silent');

/* 3. DND is absolute --------------------------------------------------------------------------- */
const dd = n();
const dndDec = decide({ ...dd }, .99, C({ dnd: 1, battery: 100, charging: 1 }));
check('DND overrides everything', [`p=99% → ${dndDec}`], dndDec === 'silent');

/* 4. a single driver is enough to move it ------------------------------------------------------ */
const t0 = thresholds(contextSense(C({}))).show;
const tBatt = thresholds(contextSense(C({ battery: 9 }))).show;
const tChg = thresholds(contextSense(C({ charging: 1 }))).show;
const tFat = thresholds(contextSense(C({ fatigue: .9 }))).show;
const tEng = thresholds(contextSense(C({ engagement: 1 }))).show;
check('battery 9% raises the bar', [`${(t0 * 100).toFixed(1)} → ${(tBatt * 100).toFixed(1)}%`], tBatt > t0);
check('charging lowers the bar', [`${(t0 * 100).toFixed(1)} → ${(tChg * 100).toFixed(1)}%`], tChg < t0);
check('dismissal fatigue raises it', [`${(t0 * 100).toFixed(1)} → ${(tFat * 100).toFixed(1)}%`], tFat > t0);
check('engagement lowers it', [`${(t0 * 100).toFixed(1)} → ${(tEng * 100).toFixed(1)}%`], tEng < t0);

/* 5. hard safety rules still beat context ------------------------------------------------------ */
const scam = n('حساب بانکی شما مسدود شده است. برای رفع مسدودی وارد لینک شوید: bank-meli.co',
  { app: 'Messages', from: 'Unknown number', known: 0 });
check('scam remains scam when calm', [`→ ${decide({ ...scam }, .99, C({ charging: 1, engagement: 1 }))}`],
  decide({ ...scam }, .99, C({ charging: 1, engagement: 1 })) === 'scam');
const code = n('Your code is 482913', { app: 'Bank', from: 'Bank', known: 0 });
check('login code shown at 8% battery', [`→ ${decide({ ...code }, .10, C({ battery: 8, load: 8 }))}`],
  decide({ ...code }, .10, C({ battery: 8, load: 8 })) === 'show');

/* 6. calibration is monotone and only softens the extremes ------------------------------------- */
let mono = true, prev = -1;
for (let i = 0; i <= 100; i++) { const v = calib(i / 100); if (v < prev) mono = false; prev = v; }
check(`calibration monotone (T=${CAL_T})`, [`0.01→${(calib(.0001) * 100).toFixed(2)}%`, `99.99→${(calib(.9999) * 100).toFixed(2)}%`],
  mono && calib(.9999) < .9999 && calib(.0001) > .0001);
check('calibration keeps 50% at 50%', [`${(calib(.5) * 100).toFixed(1)}%`], Math.abs(calib(.5) - .5) < 1e-9);

console.log('-'.repeat(96));
console.log(fail ? `${fail} FAILED` : 'all context checks pass');
process.exit(fail ? 1 : 0);
