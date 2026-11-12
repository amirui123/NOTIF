"""Stage C — decision policy under REALISTIC feedback.
In the real app the island only learns from notifications the user actually saw: if it keeps a sender silent it
never finds out it was wrong (selective labels). Here memory is updated only for surfaced notifications
(plus 25% of silent ones, opened later from the list). On top of the probabilities we test
  * expected-utility thresholds that depend on context (busy / critical content), and
  * an optimism bonus for senders the island knows little about (UCB-style exploration, Auer et al. 2002)."""
import numpy as np, json
exec(open("behavior.py", encoding="utf-8").read().split("res = []")[0])
m = np.load("behavior_model.npz"); T, LAM = float(m["T"]), float(m["lam"])
def net(pre, X):
    g = lambda k: m[pre+k].astype(np.float64)
    x = (X - g("mu"))/g("sd"); h1 = np.maximum(0, x @ g("W1") + g("b1")); r = np.maximum(0, h1 @ g("W2") + g("b2"))
    h2 = np.maximum(0, h1 + r @ g("W3") + g("b3")); h3 = np.maximum(0, h2 @ g("W4") + g("b4")); return (h3 @ g("W5") + g("b5") + x @ g("Ww"))[:, 0]
p0 = sig(net("stage1_", X2s.astype(np.float64)))
busy = np.maximum(A[:, 13], A[:, 14]).astype(int); crit = np.maximum(A[:, 8], A[:, 9]).astype(int)       # urgent or login code (rule flags)
hb = (np.arctan2(A[:, 19], A[:, 20]) % (2*np.pi) / (2*np.pi) * 4).astype(int) % 4; ty = A[:, 38].astype(int)
COST = np.where(busy == 1, 1.5, 0.5); MISS = np.where(crit == 1, 3.0, 1.0)
THR_FIXED = np.full(len(A), .3); THR_UTIL = COST/(1 + COST + MISS)
coin = np.random.default_rng(5).random(len(A))

def simulate(mask, thr, beta=0.0, full_feedback=False):
    users = np.unique(uid[mask]); P = np.full(len(A), np.nan); S = np.zeros(len(A), bool)
    mem = [dict() for _ in users]; H0 = 27
    for e in range(400):
        idx = np.array([np.where((uid == u) & (ev == e))[0][0] for u in users]) if e == 0 else idx + 1
        X = X2[idx].astype(np.float64); R = np.zeros((len(users), 5)); ns = np.zeros(len(users))
        for j, i in enumerate(idx):
            M = mem[j]; ks = (("s", snd[i]), ("c", cat[i]), ("u",), ("h", hb[i]), ("b", busy[i]))
            st = [M.get(k, (0., 0., 0., 0.)) for k in ks]                                   # n, engaged, residual sum, last outcome
            X[j, H0+0] = (st[0][1]+.5)/(st[0][0]+1); X[j, H0+1] = np.log1p(st[0][0]); X[j, H0+2] = (st[1][1]+.5)/(st[1][0]+1); X[j, H0+3] = np.log1p(st[1][0])
            X[j, H0+4] = (st[2][1]+.5)/(st[2][0]+1); X[j, H0+5] = (st[3][1]+.5)/(st[3][0]+1)
            bz = M.get(("b", 1), (0., 0., 0., 0.)); X[j, H0+6] = (bz[1]+.5)/(bz[0]+1); X[j, H0+10] = st[0][3]; X[j, H0+11] = np.log1p(st[2][0])
            R[j] = [s_[2]/(s_[0]+LAM) for s_ in st]; ns[j] = st[0][0]
        X3 = np.hstack([X, R, p0[idx][:, None]]); p = sig(np.mean([net(f"m{k}_", X3) for k in range(3)], 0)/T)
        show = (p + beta/np.sqrt(ns+1)) >= thr[idx]; P[idx] = p; S[idx] = show
        for j, i in enumerate(idx):
            if full_feedback or show[j] or coin[i] < .25:
                M = mem[j]; d = y[i] - p0[i]
                for k in (("s", snd[i]), ("c", cat[i]), ("u",), ("h", hb[i]), ("b", busy[i])):
                    n_, e_, r_, _ = M.get(k, (0., 0., 0., 0.)); M[k] = (n_+1, e_+y[i], r_+d, 1. if y[i] else -1.)
    return P, S

def report(name, P, S, mask):
    yy = y[mask]; s = S[mask]; u = np.where(s, np.where(yy == 1, 1.0, -COST[mask]), np.where(yy == 1, -MISS[mask], 0.0))
    c = crit[mask] == 1; sc = ty[mask] == 3
    r = {"policy": name, "utility_per_notification": round(float(u.mean()), 4), "auc": round(auc(yy, P[mask]), 4), "surfaced_share": round(float(s.mean()), 4),
         "useful_when_surfaced": round(float(yy[s].mean()), 4), "missed_important": round(float((~s)[yy == 1].mean()), 4),
         "missed_critical": round(float((~s)[(yy == 1) & c].mean()), 4), "scams_surfaced": round(float(s[sc].mean()), 4)}
    print(r); return r
out = []
z1 = train_v1(X1)(X1); p1 = online_v1(z1); out.append(report("OLD system (v1 model, fixed 0.3 threshold, sees all feedback)", p1, p1 >= .3, te))
P, S = simulate(te, THR_FIXED, full_feedback=True); out.append(report("v3, fixed threshold, sees all feedback (previous report, optimistic)", P, S, te))
P, S = simulate(te, THR_FIXED); out.append(report("v3, fixed threshold, realistic feedback", P, S, te))
P, S = simulate(te, THR_UTIL); out.append(report("v3 + context-aware utility thresholds, realistic feedback", P, S, te))
GUARD = np.where((A[:, 37] > .5) & (A[:, 11] == 0), 9.0, THR_UTIL)   # safety rule: "scam" from a sender who is not a known contact -> never surfaced
P, S = simulate(te, GUARD); out.append(report("FINAL: v3 + utility thresholds + scam guard, realistic feedback", P, S, te))
best = max((0.0, .05, .1, .2, .3), key=lambda b: report(f"  (val) beta={b}", *simulate(va, THR_UTIL, b), va)["utility_per_notification"])
P, S = simulate(te, THR_UTIL, best); out.append(report(f"v3 + utility thresholds + exploration (beta={best}), realistic feedback", P, S, te))
u = np.where(ptrue >= THR_UTIL, np.where(y == 1, 1.0, -COST), np.where(y == 1, -MISS, 0.0))
out.append({"policy": "ceiling: true probabilities + utility thresholds", "utility_per_notification": round(float(u[te].mean()), 4)}); print(out[-1])
sc = te & (ty == 3); out.append({"scam_detection_in_sim": {"n": int(sc.sum()), "flagged_by_text_model(p_scam>0.5)": round(float((A[sc, 37] > .5).mean()), 4),
     "false_alarms_on_non_scam": round(float((A[te & (ty != 3), 37] > .5).mean()), 4)}}); print(out[-1])
json.dump({"assumptions": "utility: +1 surfaced & wanted; -0.5 surfaced & unwanted (-1.5 while busy); -1 wanted but silent (-3 if urgent/login code)", "beta": best, "results": out}, open("metrics_policy.json", "w"), indent=1)
