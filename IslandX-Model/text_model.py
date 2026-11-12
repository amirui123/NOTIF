"""Stage A — text understanding trained on REAL messages (English + Persian).
fastText-style model (Joulin et al. 2016): hashed char n-grams -> embedding bag -> hidden -> P(promo/spam).
Replaces the v1 keyword regex."""
import numpy as np, json, re, csv
from common import *
rng = np.random.default_rng(1)
en = [l.rstrip("\n").split("\t", 1) for l in open("data/sms.tsv", encoding="utf-8")]
en = [(t, 1 if l == "spam" else 0, "en") for l, t in en if l in ("ham", "spam")]
fa = [(d["Text"], int(d["Label"]), "fa") for d in json.load(open("data/fa.json", encoding="utf-8"))]
seen, data = set(), []
for t, l, g in en + fa:                               # de-duplicate so test messages never leak into training
    k = normalize(t)
    if len(k) > 1 and k not in seen: seen.add(k); data.append((t, l, g))
print("messages after de-dup:", len(data), "(raw", len(en)+len(fa), ")")
texts = [d[0] for d in data]; y = np.array([d[1] for d in data], float); lang = np.array([d[2] for d in data])
perm = rng.permutation(len(data)); n = len(data)
split = np.empty(n, "U5"); split[perm[:int(.8*n)]] = "train"; split[perm[int(.8*n):int(.9*n)]] = "val"; split[perm[int(.9*n):]] = "test"
X = bag_matrix(texts); tr, va, te = split == "train", split == "val", split == "test"

D, H = 16, 24
P = {"E": rng.normal(0, .1, (B, D)), "be": np.zeros(D), "W1": rng.normal(0, np.sqrt(2/D), (D, H)), "b1": np.zeros(H),
     "W2": rng.normal(0, np.sqrt(1/H), (H, 1)), "b2": np.zeros(1)}
def fwd(Xb, P, drop=0.0):
    a = Xb @ P["E"] * 8 + P["be"]                      # pooled n-gram embedding
    mask = (rng.random(a.shape) > drop)/(1-drop) if drop else 1.0
    a = a*mask; h = np.maximum(0, a @ P["W1"] + P["b1"])
    return a, mask, h, (h @ P["W2"] + P["b2"])[:, 0]
opt = AdamW(P, 3e-3, wd=1e-4); Xtr, ytr = X[tr], y[tr]; best = (9, None); bad = 0
for ep in range(60):
    idx = rng.permutation(Xtr.shape[0])
    for i in range(0, len(idx), 128):
        b = idx[i:i+128]; Xb = Xtr[b]; a, mask, h, z = fwd(Xb, P, .2)
        g = ((sig(z) - ytr[b]) / len(b))[:, None]
        gh = (g @ P["W2"].T) * (h > 0); ga = (gh @ P["W1"].T) * mask
        opt.step({"W2": h.T @ g, "b2": g.sum(0), "W1": a.T @ gh, "b1": gh.sum(0), "be": ga.sum(0), "E": (Xb.T @ ga) * 8})
    vl = logloss(y[va], sig(fwd(X[va], P)[3]))
    if vl < best[0] - 1e-4: best = (vl, {k: v.copy() for k, v in P.items()}); bad = 0
    else:
        bad += 1
        if bad >= 6: break
P = best[1]; print("epochs", ep+1, "val logloss", round(best[0], 4))

RX = re.compile(r"% ?off|sale|discount|digest|newsletter|تخفیف|٪", re.I)       # the v1 "promo" detector
def report(name, pred, score, m):
    pr, rc, f1 = prf(y[m], pred[m]); acc = float((pred[m] == y[m]).mean())
    return {"model": name, "n": int(m.sum()), "accuracy": round(acc, 4), "precision": round(pr, 4), "recall": round(rc, 4),
            "f1": round(f1, 4), "auc": None if score is None else round(auc(y[m], score[m]), 4)}
rx = np.array([1 if RX.search(t) else 0 for t in texts])
p = sig(fwd(X, P)[3])
# int8 quantisation of the embedding table (what actually ships)
sc = np.abs(P["E"]).max()/127; Eq = np.round(P["E"]/sc).astype(np.int8)
Pq = dict(P); Pq["E"] = Eq.astype(np.float64)*sc; pq = sig(fwd(X, Pq)[3])
out = []
for g in ("en", "fa"):
    m = te & (lang == g)
    out += [dict(report("v1 keyword regex", rx, None, m), lang=g), dict(report("v2 neural (float)", (p > .5)*1, p, m), lang=g),
            dict(report("v2 neural (int8, shipped)", (pq > .5)*1, pq, m), lang=g)]
for o in out: print(o)
json.dump(out, open("metrics_text.json", "w"), indent=1, ensure_ascii=False)
np.savez_compressed("text_model.npz", Eq=Eq, scale=sc, **{k: P[k] for k in ("be", "W1", "b1", "W2", "b2")})
# out-of-fold-ish scores for the behaviour simulator: only use val+test messages there (model never trained on them)
json.dump([{"t": texts[i], "y": int(y[i]), "lang": lang[i], "p": round(float(pq[i]), 4)} for i in np.where(~tr)[0]],
          open("data/heldout_texts.json", "w"), ensure_ascii=False)
for t in ["Are we still on for 1:30?", "50% off everything this weekend!", "سلام، فوری زنگ بزن", "فروش ویژه با تخفیف باورنکردنی فقط تا پایان هفته", "Your code is 482913", "جلسه ساعت ۳ یادت نره"]:
    print(round(float(sig(fwd(bag_matrix([t]), Pq)[3])[0]), 3), t)
