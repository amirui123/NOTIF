"""Stage B — attention model v2, built layer by layer in numpy (manual backprop).
Wide & Deep (Cheng et al. 2016) with a residual block (He et al. 2016), AdamW + cosine schedule, dropout,
early stopping, 3-seed ensemble, temperature scaling (Guo et al. 2017), and an online Bayesian logistic head
(assumed-density filtering, as in Chapelle & Li 2011) that personalises on-device."""
import numpy as np, json
from common import *
A = np.load("data/sim.npy"); uid = A[:, 0].astype(int); ev = A[:, 1].astype(int); y = A[:, 2].astype(float); ptrue = A[:, 3].astype(float)
cat = A[:, 4].astype(int); snd = A[:, 33].astype(int); oh = np.eye(7, dtype=np.float32)[cat]
X1 = np.hstack([oh, A[:, 5:18]])                    # the 20 v1 inputs
X2s = np.hstack([X1, A[:, 18:21], A[:, 34:38]])   # + text model: P(unwanted), 4 type probabilities                  # + learned text score + cyclic hour
X2 = np.hstack([X2s, A[:, 21:33]])                  # + 12 history features (personal memory)
tr, va, te = uid < 480, (uid >= 480) & (uid < 540), uid >= 540

def train_v1(X, seed=7):                            # exactly the v1 recipe: 20-12-1 tanh MLP
    rng = np.random.default_rng(seed); d = X.shape[1]
    P = {"W1": rng.normal(0, .3, (d, 12)), "b1": np.zeros(12), "W2": rng.normal(0, .3, (12, 1)), "b2": np.zeros(1)}
    opt = AdamW(P, 3e-3); Xt, yt = X[tr], y[tr]
    for ep in range(12):
        idx = rng.permutation(len(Xt))
        for i in range(0, len(idx), 256):
            b = idx[i:i+256]; h = np.tanh(Xt[b] @ P["W1"] + P["b1"]); g = ((sig((h @ P["W2"] + P["b2"])[:, 0]) - yt[b])/len(b))[:, None]
            gh = (g @ P["W2"].T)*(1-h*h); opt.step({"W2": h.T @ g, "b2": g.sum(0), "W1": Xt[b].T @ gh, "b1": gh.sum(0)})
    return lambda X: (np.tanh(X @ P["W1"] + P["b1"]) @ P["W2"] + P["b2"])[:, 0]

def train_v2(X, seed, H=96, epochs=30, drop=.1):
    rng = np.random.default_rng(seed); d = X.shape[1]
    mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-6; mu = mu.astype(np.float32); sd = sd.astype(np.float32); N = lambda X: (X - mu)/sd
    he = lambda a, b: rng.normal(0, np.sqrt(2/a), (a, b))
    P = {"W1": he(d, H), "b1": np.zeros(H), "W2": he(H, H), "b2": np.zeros(H), "W3": he(H, H)*.1, "b3": np.zeros(H),
         "W4": he(H, H//2), "b4": np.zeros(H//2), "W5": he(H//2, 1)*.5, "b5": np.zeros(1), "Ww": np.zeros((d, 1))}
    def fwd(x, P, train=False):
        h1 = np.maximum(0, x @ P["W1"] + P["b1"]); m1 = (rng.random(h1.shape) > drop)/(1-drop) if train else 1.0; h1 = h1*m1
        r = np.maximum(0, h1 @ P["W2"] + P["b2"]); h2 = np.maximum(0, h1 + r @ P["W3"] + P["b3"])      # residual block
        m2 = (rng.random(h2.shape) > drop)/(1-drop) if train else 1.0; h2 = h2*m2
        h3 = np.maximum(0, h2 @ P["W4"] + P["b4"])
        return (h1, m1, r, h2, m2, h3), (h3 @ P["W5"] + P["b5"] + x @ P["Ww"])[:, 0]                 # deep + wide
    Xt, yt, Xv = N(X[tr]), y[tr], N(X[va]); opt = AdamW(P, 2e-3, wd=2e-5); steps = epochs*(len(Xt)//512+1); k = 0; best = (9, None); bad = 0
    for ep in range(epochs):
        idx = rng.permutation(len(Xt))
        for i in range(0, len(idx), 512):
            b = idx[i:i+512]; x = Xt[b]; (h1, m1, r, h2, m2, h3), z = fwd(x, P, True)
            g = ((sig(z) - yt[b])/len(b))[:, None]
            g3 = (g @ P["W5"].T)*(h3 > 0); g2 = (g3 @ P["W4"].T)*m2*(h2 > 0)
            gr = (g2 @ P["W3"].T)*(r > 0); g1 = (g2 + gr @ P["W2"].T)*m1*(h1 > 0)
            k += 1; lr = 2e-3*(.02 + .98*.5*(1+np.cos(np.pi*k/steps)))
            opt.step({"Ww": x.T @ g, "W5": h3.T @ g, "b5": g.sum(0), "W4": h2.T @ g3, "b4": g3.sum(0), "W3": r.T @ g2, "b3": g2.sum(0),
                      "W2": h1.T @ gr, "b2": gr.sum(0), "W1": x.T @ g1, "b1": g1.sum(0)}, lr)
        vl = logloss(y[va], sig(fwd(Xv, P)[1]))
        if vl < best[0]-1e-5: best = (vl, {k_: v.copy() for k_, v in P.items()}); bad = 0
        else:
            bad += 1
            if bad >= 5: break
    Pb = best[1]; return (lambda X: fwd(N(X), Pb)[1]), {"mu": mu, "sd": sd, **Pb}, best[0]

def temperature(zv, yv):                             # one scalar fitted on validation users
    Ts = np.linspace(.5, 2, 61); return float(Ts[np.argmin([logloss(yv, sig(zv/T)) for T in Ts])])

def online_v1(z):                                    # v1 personal layer: one offset per app-category and per sender
    out = np.empty(len(z))
    for u in np.unique(uid):
        m = np.where(uid == u)[0]; Uo = {}
        for i in m:
            ks = (("c", cat[i]), ("s", snd[i])); p = sig(z[i] + sum(Uo.get(k, 0.) for k in ks)); out[i] = p
            for k in ks: Uo[k] = Uo.get(k, 0.) + 1.5*(.6 if y[i] else .3)*(y[i]-p)
    return out

PHI = np.hstack([np.ones((len(A), 1)), oh, np.maximum(A[:, 13], A[:, 14])[:, None], A[:, 16:17], A[:, 18:19], A[:, 12:13]]).astype(np.float32)
def online_v2(z, mask, q0):                          # Bayesian online logistic regression (diagonal ADF) + per-sender offset
    out = np.full(len(z), np.nan)
    for u in np.unique(uid[mask]):
        idx = np.where(uid == u)[0]; m = np.zeros(PHI.shape[1]); q = np.full(PHI.shape[1], float(q0)); sm = {}; sq = {}
        for i in idx:
            f = PHI[i]; s = snd[i]; p = sig(z[i] + m @ f + sm.get(s, 0.)); out[i] = p; w = p*(1-p)
            m += (y[i]-p)*f/q; q += w*f*f
            qs = sq.get(s, float(q0)); sm[s] = sm.get(s, 0.) + (y[i]-p)/qs; sq[s] = qs + w
    return out

def score(name, p, m=te):
    yy, pp = y[m], p[m]; shown = pp >= .6; silent = pp < .3
    r = {"model": name, "auc": round(auc(yy, pp), 4), "accuracy": round(float(((pp > .5) == yy).mean()), 4), "logloss": round(logloss(yy, pp), 4),
         "ece": round(ece(yy, pp), 4), "useful_when_shown": round(float(yy[shown].mean()), 4), "shown_share": round(float(shown.mean()), 4),
         "missed_important": round(float(silent[yy == 1].mean()), 4)}
    for a, b, n in ((0, 20, "first20"), (20, 100, "21-100"), (100, 400, "101-400")):
        s = m & (ev >= a) & (ev < b); r["auc_"+n] = round(auc(y[s], p[s]), 4)
    print(r); return r

res = []
f1 = train_v1(X1); z1 = f1(X1)
res.append(score("v1 MLP 20-12-1 (static)", sig(z1)))
res.append(score("v1 + its personal offsets (what the prototype runs)", online_v1(z1)))
fs_, _, _ = train_v2(X2s, 1); res.append(score("v2 net, text model only (no memory)", sig(fs_(X2s))))
zs, packs = [], []
for seed in (1, 2, 3):
    f, pack, vl = train_v2(X2, seed); zs.append(f(X2)); packs.append(pack); print("seed", seed, "val logloss", round(vl, 4))
res.append(score("v2 net with memory features (single)", sig(zs[0])))
z2 = np.mean(zs, 0); res.append(score("v2 ensemble x3", sig(z2)))
T = temperature(z2[va], y[va]); z2 = z2/T; print("temperature", T); res.append(score("v2 ensemble + temperature", sig(z2)))
q0 = min((1, 2, 4, 8, 16, 32), key=lambda q: logloss(y[va], online_v2(z2, va, q)[va])); print("online prior precision", q0)
res.append(score("v2 FULL: ensemble + calibration + Bayesian online head", online_v2(z2, te, q0)))
res.append(score("ceiling: the simulator's true probabilities", ptrue))
json.dump(res, open("metrics_behavior.json", "w"), indent=1)
np.savez_compressed("behavior_model.npz", T=T, q0=q0, **{f"m{i}_{k}": v.astype(np.float32) for i, pk in enumerate(packs) for k, v in pk.items()})
print("parameters per net:", sum(v.size for k, v in packs[0].items() if k not in ("mu", "sd")))
