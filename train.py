"""IslandX attention model.
Trains a small MLP (20 -> 12 -> 1) that predicts "will the user engage with this
notification right now?".  The data is SYNTHETIC: 400 simulated users with different
habits reacting to 60k notifications.  It gives the app a sensible starting point;
the on-device personal layer then adapts it to the real user.
"""
import numpy as np, json
rng = np.random.default_rng(7)
F = ["messenger","workchat","email","finance","shopping","social","system",
     "direct","mention","question","urgent","otp","promo","known","active_conv",
     "fullscreen","meeting","work_hours","night","length"]
N, USERS = 60000, 400

def gen(n):
    X = np.zeros((n, len(F))); g = lambda k: X[:, F.index(k)]
    cat = rng.choice(7, n, p=[.28,.2,.17,.06,.12,.12,.05]); X[np.arange(n), cat] = 1
    chat = (cat <= 1)
    g("direct")[:]      = (rng.random(n) < np.where(chat, .5, np.where(cat==2, .35, 0)))
    g("mention")[:]     = (rng.random(n) < np.where(chat & (g("direct")==0), .2, 0))
    g("question")[:]    = (rng.random(n) < np.where(chat | (cat==2), .3, .03))
    g("urgent")[:]      = (rng.random(n) < np.where(chat | (cat==2), .08, .02))
    g("otp")[:]         = (rng.random(n) < np.where(cat==3, .7, .01))
    g("promo")[:]       = (rng.random(n) < np.where(cat==4, .85, np.where(cat==2, .4, np.where(cat==5, .25, 0))))
    g("known")[:]       = (rng.random(n) < np.where(g("direct")==1, .6, .1))
    g("active_conv")[:] = (rng.random(n) < np.where(chat, .22, .02))
    g("fullscreen")[:]  = rng.random(n) < .25
    g("meeting")[:]     = rng.random(n) < .12
    hour = rng.integers(0, 24, n)
    g("work_hours")[:]  = (hour >= 9) & (hour < 18)
    g("night")[:]       = (hour >= 23) | (hour < 7)
    g("length")[:]      = rng.beta(2, 4, n)
    return X

def truth(X, user):
    g = lambda k: X[:, F.index(k)]
    z = -1.5 + 1.0*g("messenger") + .4*g("workchat") + .1*g("email") + .5*g("finance") \
        - .9*g("shopping") - .7*g("social") + .2*g("system")
    z += 1.3*g("direct") + 1.6*g("mention") + .7*g("question") + 1.8*g("urgent") + 3.2*g("otp")
    z += -2.4*g("promo") + 1.1*g("known") + 2.0*g("active_conv") - .3*g("length")
    # interactions a linear model cannot represent
    z += g("workchat")*(1.0*g("work_hours") - 1.6*g("night"))
    z += g("email")*(.6*g("work_hours") - 1.0*g("night"))
    busy = np.clip(g("fullscreen") + g("meeting"), 0, 1)
    critical = np.clip(g("otp") + g("urgent") + g("active_conv"), 0, 1)
    z += busy * (-1.8 + 1.7*critical)
    z += -.8*g("night")*(1-critical)
    z += g("promo")*g("otp")*2.0            # "your code" mails that look promotional
    # per-user habits (what the personal layer must later learn)
    z += user["bias"] + (X[:, :7] @ user["cat"])
    return 1/(1+np.exp(-z))

users = [{"bias": rng.normal(0, .5), "cat": rng.normal(0, .7, 7)} for _ in range(USERS)]
X = gen(N); uid = rng.integers(0, USERS, N); p = np.zeros(N)
for u in range(USERS):
    m = uid == u; p[m] = truth(X[m], users[u])
y = (rng.random(N) < p).astype(float)
tr = uid < 320; te = ~tr                      # test on users never seen in training

def auc(y, s):
    o = np.argsort(s); r = np.empty(len(s)); r[o] = np.arange(1, len(s)+1)
    n1 = y.sum(); n0 = len(y)-n1
    return (r[y==1].sum() - n1*(n1+1)/2) / (n1*n0)

def train(hidden, epochs=60, lr=3e-3, bs=256):
    d = X.shape[1]; H = hidden
    P = {"W1": rng.normal(0, .3, (d, H)) if H else None, "b1": np.zeros(H) if H else None,
         "W2": rng.normal(0, .3, (H or d, 1)), "b2": np.zeros(1)}
    P = {k: v for k, v in P.items() if v is not None}
    M = {k: np.zeros_like(v) for k, v in P.items()}; V = {k: np.zeros_like(v) for k, v in P.items()}; t = 0
    Xt, yt = X[tr], y[tr]
    for ep in range(epochs):
        idx = rng.permutation(len(Xt))
        for i in range(0, len(idx), bs):
            b = idx[i:i+bs]; xb, yb = Xt[b], yt[b][:, None]
            if H: h = np.tanh(xb @ P["W1"] + P["b1"]); o = h @ P["W2"] + P["b2"]
            else: o = xb @ P["W2"] + P["b2"]
            g = (1/(1+np.exp(-o)) - yb) / len(b)
            G = {"W2": (h if H else xb).T @ g, "b2": g.sum(0)}
            if H:
                gh = (g @ P["W2"].T) * (1-h*h); G["W1"] = xb.T @ gh; G["b1"] = gh.sum(0)
            t += 1
            for k in P:
                M[k] = .9*M[k] + .1*G[k]; V[k] = .999*V[k] + .001*G[k]**2
                P[k] -= lr * (M[k]/(1-.9**t)) / (np.sqrt(V[k]/(1-.999**t)) + 1e-8)
    def f(x):
        if H: return (np.tanh(x @ P["W1"] + P["b1"]) @ P["W2"] + P["b2"])[:, 0]
        return (x @ P["W2"] + P["b2"])[:, 0]
    return P, f

res = {}
for name, H in [("logistic baseline", 0), ("MLP 20-12-1", 12)]:
    P, f = train(H); s = f(X[te])
    res[name] = {"accuracy": round(float(((s > 0) == y[te]).mean()), 4), "auc": round(float(auc(y[te], s)), 4)}
    print(name, res[name])
    if H: best = P
print("ceiling (true probabilities, unknowable in practice): acc", round(float(((p[te] > .5) == y[te]).mean()), 4), "auc", round(float(auc(y[te], p[te])), 4))
out = {"features": F, "W1": np.round(best["W1"], 3).tolist(), "b1": np.round(best["b1"], 3).tolist(),
       "W2": np.round(best["W2"][:, 0], 3).tolist(), "b2": round(float(best["b2"][0]), 3)}
json.dump(out, open("model.json", "w"), separators=(",", ":"))
json.dump({"train_samples": int(tr.sum()), "test_samples": int(te.sum()), "data": "synthetic (400 simulated users)", **res}, open("metrics.json", "w"), indent=1)
