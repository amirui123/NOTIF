"""Stage B data — behaviour simulator v2.
600 simulated users x 400 notifications. Message TEXTS are real (held-out English/Persian messages the text model
never trained on); the REACTIONS are simulated, following what field studies report drives notification attendance:
sender relationship and content importance (Mehrotra et al., CHI 2016), current activity / time of day
(Pielot et al., UbiComp 2017), plus personal habits, conversation state and notification fatigue."""
import numpy as np, json, re
from common import *
rng = np.random.default_rng(11)
U, E, NS = 600, 400, 25
pool = json.load(open("data/heldout_texts.json", encoding="utf-8"))
z = np.load("text_model.npz")
def text_p(t):                                        # -> P(unwanted), P(type x4)
    a = bag_matrix([t]) @ (z["Eq"].astype(np.float64)*float(z["scale"])) * 8 + z["be"]; h = np.maximum(0, a @ z["W1"] + z["b1"])
    zt = (h @ z["Wt"] + z["bt"])[0]; e = np.exp(zt - zt.max()); return float(sig(h @ z["Wu"] + z["bu"])[0, 0]), (e/e.sum()).tolist()
RX_PROMO = re.compile(r"% ?off|sale|discount|digest|newsletter|تخفیف|٪", re.I)
RX_URG = re.compile(r"urgent|asap|right now|فوری|همین الان", re.I)
RX_OTP = re.compile(r"(code|otp|کد|رمز).{0,24}\d{4,8}|\d{4,8}.{0,24}(code|کد|رمز)", re.I)
def prep(t, y, p, pt):
    return (y, p, tuple(pt), 1.0 if RX_PROMO.search(t) else 0.0, 1.0 if re.search(r"[?؟]", t) else 0.0,
            1.0 if RX_URG.search(t) else 0.0, 1.0 if RX_OTP.search(t) else 0.0, min(1.0, len(t)/120))
P = {(g, y): [prep(d["t"], d["ty"], d["pu"], d["pt"]) for d in pool if d["lang"] == g and d["ty"] == y] for g in ("en", "fa") for y in range(4)}
print({k: len(v) for k, v in P.items()})
OTP = {"en": [prep(t, 1, *text_p(t)) for t in ("Your code is 482913", "731904 is your verification code", "Use 5521 to sign in")],
       "fa": [prep(t, 1, *text_p(t)) for t in ("کد تایید شما 48291 است", "رمز پویا: 918273", "کد ورود: 4410")]}
CATW = np.array([1.0, .4, .1, .5, -.9, -.7, .2])
rows = []
for u in range(U):
    lang = "fa" if rng.random() < .5 else "en"
    bias, catp = rng.normal(0, .5), rng.normal(0, .7, 7)
    s_busy, fat, tol = rng.uniform(.5, 1.5), rng.uniform(.1, .5), rng.normal(0, .6)
    w0, owl = rng.uniform(7.5, 10.5), rng.uniform(0, 3)
    scat = rng.choice(7, NS, p=[.3, .2, .15, .05, .12, .12, .06])
    chat = scat <= 1
    sdirect = (rng.random(NS) < np.where(chat, .55, np.where(scat == 2, .35, 0))) * 1.0
    sknown = (rng.random(NS) < np.where(sdirect == 1, .6, .08)) * 1.0
    sscam = (rng.random(NS) < .07) & (sknown == 0)          # unknown senders that only send scams
    spromo = (scat == 4) | ((scat == 5) & (rng.random(NS) < .5)) | ((scat == 2) & (sdirect == 0) & (rng.random(NS) < .6))
    aff = rng.normal(0, 1.2, NS)
    freq = 1/np.arange(1, NS+1)**.9; freq = rng.permutation(freq); freq /= freq.sum()
    n_s = np.zeros(NS); e_s = np.zeros(NS); last_t = np.full(NS, -1e9); last_e = np.full(NS, -1e9); last_o = np.zeros(NS)
    n_c = np.zeros(7); e_c = np.zeros(7); n_h = np.zeros(4); e_h = np.zeros(4); n_b = e_b = n_u = e_u = 0.0
    t, s, recent, last_eng = rng.uniform(0, 1440), 0, [], -1e9
    for e in range(E):
        if e and rng.random() < .25: t += rng.uniform(.3, 3)
        else: s = rng.choice(NS, p=freq); t += rng.exponential(90)
        hour = (t/60) % 24; c = scat[s]
        fs = 1.0 if rng.random() < (.4 if 19 <= hour < 24 else .18) else 0.0
        meet = 1.0 if rng.random() < (.25 if 9 <= hour < 18 else .02) else 0.0
        if c == 3 and not sscam[s]:
            if rng.random() < .6: tx = OTP[lang][rng.integers(3)]
            else: pl = P[(lang, 1)]; tx = pl[rng.integers(len(pl))]
        else: pl = P[(lang, 3 if sscam[s] else 2 if spromo[s] else 0)]; tx = pl[rng.integers(len(pl))]
        ty, ptext, pt4, rxp, q, urg, otp, ln = tx; spam = 1.0 if ty == 2 else 0.0; scam = 1.0 if ty == 3 else 0.0
        mention = 1.0 if (c <= 1 and not sdirect[s] and rng.random() < .2) else 0.0
        recent = [r for r in recent if t - r < 10]; burst = len(recent)
        active = 1.0 if t - last_e[s] < 10 else 0.0
        uw = 1.0 if w0 <= hour < w0+9 else 0.0; h2 = (hour - owl) % 24; un = 1.0 if (h2 >= 23 or h2 < 7) else 0.0
        busy = max(fs, meet); crit = min(1.0, otp + urg + active)
        zt = (-1.5 + CATW[c] + 1.3*sdirect[s] + 1.6*mention + .7*q + 1.8*urg + 3.2*otp + 1.1*sknown[s] + (-2.4 + tol)*spam - 3.5*scam
              + aff[s] + 2.0*active - .3*ln + (c == 1)*(1.0*uw - 1.6*un) + (c == 2)*(.6*uw - 1.0*un)
              + busy*(-1.8*s_busy + 1.7*crit) - .8*un*(1-crit) - fat*min(5, burst) + bias + catp[c])
        p = 1/(1+np.exp(-zt)); y = 1.0 if rng.random() < p else 0.0
        hb = int(hour//6)
        rows.append((u, e, y, p, c, sdirect[s], mention, q, urg, otp, rxp, sknown[s], active, fs, meet,
                     1.0 if 9 <= hour < 18 else 0.0, 1.0 if (hour >= 23 or hour < 7) else 0.0, ln,          # ---- v1 inputs end
                     ptext, np.sin(hour/24*2*np.pi), np.cos(hour/24*2*np.pi),
                     (e_s[s]+.5)/(n_s[s]+1), np.log1p(n_s[s]), (e_c[c]+.5)/(n_c[c]+1), np.log1p(n_c[c]),
                     (e_u+.5)/(n_u+1), (e_h[hb]+.5)/(n_h[hb]+1), (e_b+.5)/(n_b+1), np.log1p(burst),
                     np.log1p(min(t-last_t[s], 1e4)), np.log1p(min(t-last_eng, 1e4)), last_o[s], np.log1p(n_u), s) + pt4 + (ty,))
        n_s[s] += 1; e_s[s] += y; n_c[c] += 1; e_c[c] += y; n_u += 1; e_u += y; n_h[hb] += 1; e_h[hb] += y
        if busy: n_b += 1; e_b += y
        last_t[s] = t; last_o[s] = 1 if y else -1; recent.append(t)
        if y: last_e[s] = t; last_eng = t
A = np.array(rows, dtype=np.float32)
np.save("data/sim.npy", A); print(A.shape, "engage rate", A[:, 2].mean().round(3))
