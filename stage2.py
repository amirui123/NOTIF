"""Stage B+ — residual memory. A first network (no personal memory) says what an average user would do.
For every sender / app category / hour block / busy state we remember how THIS user deviated from that
expectation (mean of y - p0). Those deviations become inputs of the final network. This separates
"Sara is important to me" from "that message happened to be urgent"."""
import numpy as np, json
exec(open("behavior.py", encoding="utf-8").read().split("res = []")[0])
f0, pack0, _ = train_v2(X2s, 1); p0 = sig(f0(X2s))
busy = np.maximum(A[:, 13], A[:, 14]).astype(int); hb = (np.arctan2(A[:, 19], A[:, 20]) % (2*np.pi) / (2*np.pi) * 4).astype(int) % 4
R = np.zeros((len(A), 5), np.float32); LAM = 2.0
for u in np.unique(uid):
    acc = {}
    for i in np.where(uid == u)[0]:
        ks = (("s", snd[i]), ("c", cat[i]), ("u",), ("h", hb[i]), ("b", busy[i]))
        for j, k in enumerate(ks):
            r, n = acc.get(k, (0., 0.)); R[i, j] = r/(n+LAM)
        d = y[i] - p0[i]
        for k in ks:
            r, n = acc.get(k, (0., 0.)); acc[k] = (r+d, n+1)
X3 = np.hstack([X2, R, p0[:, None].astype(np.float32)])
res = json.load(open("metrics_behavior.json")); res = [r for r in res if "v3" not in r["model"] and "ceiling" not in r["model"]]
zs, packs = [], []
for seed in (1, 2, 3):
    f, pack, vl = train_v2(X3, seed); zs.append(f(X3)); packs.append(pack); print("seed", seed, "val logloss", round(vl, 4))
z3 = np.mean(zs, 0); T = temperature(z3[va], y[va]); z3 = z3/T
res.append(score("v3 residual-memory ensemble + temperature", sig(z3)))
q0 = min((2, 8, 32, 128), key=lambda q: logloss(y[va], online_v2(z3, va, q)[va])); print("q0", q0)
res.append(score("v3 FULL: + Bayesian online head", online_v2(z3, te, q0)))
res.append(score("ceiling: the simulator's true probabilities", ptrue))
json.dump(res, open("metrics_behavior.json", "w"), indent=1)
np.savez_compressed("behavior_model.npz", T=T, q0=q0, lam=LAM, **{f"stage1_{k}": v.astype(np.float32) for k, v in pack0.items()},
                    **{f"m{i}_{k}": v.astype(np.float32) for i, pk in enumerate(packs) for k, v in pk.items()})
print("total parameters shipped:", sum(v.size for pk in packs+[pack0] for k, v in pk.items() if k not in ("mu", "sd")))
