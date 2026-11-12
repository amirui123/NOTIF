"""Packs the trained weights for the browser / C# port: int8 text embeddings, int16 network tensors (base64)."""
import numpy as np, json, base64
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
t = np.load("text_model.npz"); m = np.load("behavior_model.npz")
out = {"text": {"E": b64(t["Eq"]), "scale": float(t["scale"]), **{k: np.round(t[k].astype(float), 5).ravel().tolist() for k in ("be", "W1", "b1", "Wu", "bu", "Wt", "bt")}},
       "T": float(m["T"]), "lam": float(m["lam"]), "nets": []}
def q(a):
    s = float(np.abs(a).max())/32767 or 1.0; return {"d": b64(np.round(a/s).astype("<i2")), "s": s}
for pre in ("stage1_", "m0_", "m1_", "m2_"):
    n = {"mu": m[pre+"mu"].astype(float).round(6).tolist(), "sd": m[pre+"sd"].astype(float).round(6).tolist()}
    for k in ("W1", "b1", "W2", "b2", "W3", "b3", "W4", "b4", "W5", "b5", "Ww"): n[k] = q(m[pre+k])
    out["nets"].append(n)
json.dump(out, open("weights.json", "w"), separators=(",", ":"))
# reference values for the parity test
from common import *
E_ = t["Eq"].astype(np.float64)*float(t["scale"])
def text_p(s):
    a = bag_matrix([s]) @ E_ * 8 + t["be"]; h = np.maximum(0, a @ t["W1"] + t["b1"]); zt = (h @ t["Wt"] + t["bt"])[0]; e = np.exp(zt - zt.max())
    return [float(sig(h @ t["Wu"] + t["bu"])[0, 0])] + (e/e.sum()).tolist()
def net(pre, x):
    P = {k: m[pre+k].astype(np.float64) for k in ("mu", "sd", "W1", "b1", "W2", "b2", "W3", "b3", "W4", "b4", "W5", "b5", "Ww")}
    x = (x - P["mu"])/P["sd"]; h1 = np.maximum(0, x @ P["W1"] + P["b1"]); r = np.maximum(0, h1 @ P["W2"] + P["b2"])
    h2 = np.maximum(0, h1 + r @ P["W3"] + P["b3"]); h3 = np.maximum(0, h2 @ P["W4"] + P["b4"]); return float((h3 @ P["W5"] + P["b5"] + x @ P["Ww"])[0])
rng = np.random.default_rng(0); x23 = rng.random(27); x41 = rng.random(45)
texts = ["Are we still on for 1:30?", "50% off everything this weekend!", "سلام، فوری زنگ بزن", "فروش ویژه با تخفیف باورنکردنی فقط تا پایان هفته", "Your code is 482913",
         "جلسه ساعت ۳ یادت نره", "WINNER!! claim your prize now at www.win.com call 09061701461", "Reza pushed the new onboarding frames"]
json.dump({"texts": [[s, text_p(s)] for s in texts], "x23": x23.tolist(), "z23": net("stage1_", x23), "x41": x41.tolist(),
           "z41": [net(f"m{i}_", x41) for i in range(3)]}, open("/tmp/ref.json", "w"), ensure_ascii=False)
print(len(open("weights.json").read())//1024, "KB")
