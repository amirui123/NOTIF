"""Shared pieces: text normalisation, hashing, tiny numpy NN toolkit (manual backprop), metrics."""
import numpy as np, re
B, NG = 8192, (2, 3, 4)
_FA = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩يكۀة", "01234567890123456789یکهه")
_URL = re.compile(r"(https?://|www\.)\S+|\S+\.(com|ir|net|org|co|me|ly)\b\S*", re.I)

def normalize(t):
    t = t.lower().translate(_FA).replace("\u200c", " ")
    t = _URL.sub(" ~url ", t)
    t = re.sub(r"\[random_number\]|\d", "0", t)       # every digit -> 0 (generalises codes, prices, phones)
    t = re.sub(r"0{3,}", "000", t)
    return re.sub(r"\s+", " ", t).strip()[:320]

def fnv1a(s):                                         # 32-bit FNV-1a over UTF-8, trivial to port to C#/JS
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h

def buckets(t):
    t = " " + normalize(t) + " "
    ids = [fnv1a(t[i:i+n]) % B for n in NG for i in range(len(t)-n+1)]
    ids += [fnv1a("w:" + w) % B for w in t.split()]
    return ids

def bag_matrix(texts):
    from scipy.sparse import csr_matrix
    r, c, v = [], [], []
    for i, t in enumerate(texts):
        ids = buckets(t)
        if not ids: continue
        u, cnt = np.unique(ids, return_counts=True)
        w = np.sqrt(cnt); w = w / w.sum()
        r += [i]*len(u); c += u.tolist(); v += w.tolist()
    return csr_matrix((v, (r, c)), shape=(len(texts), B), dtype=np.float32)

# ---------- metrics ----------
def auc(y, s):
    from scipy.stats import rankdata
    r = rankdata(s); n1 = y.sum(); n0 = len(y) - n1
    return float((r[y == 1].sum() - n1*(n1+1)/2) / (n1*n0))
def logloss(y, p):
    p = np.clip(p, 1e-6, 1-1e-6); return float(-(y*np.log(p) + (1-y)*np.log(1-p)).mean())
def ece(y, p, bins=15):
    e = 0.0; idx = np.minimum((p*bins).astype(int), bins-1)
    for b in range(bins):
        m = idx == b
        if m.any(): e += m.mean() * abs(y[m].mean() - p[m].mean())
    return float(e)
def prf(y, pred):
    tp = ((pred == 1) & (y == 1)).sum(); fp = ((pred == 1) & (y == 0)).sum(); fn = ((pred == 0) & (y == 1)).sum()
    pr = tp/max(1, tp+fp); rc = tp/max(1, tp+fn)
    return float(pr), float(rc), float(2*pr*rc/max(1e-9, pr+rc))
sig = lambda z: 1/(1+np.exp(-np.clip(z, -30, 30)))

# ---------- optimiser ----------
class AdamW:
    def __init__(s, params, lr, wd=0.0):
        s.p, s.lr, s.wd, s.t = params, lr, wd, 0
        s.m = {k: np.zeros_like(v) for k, v in params.items()}; s.v = {k: np.zeros_like(v) for k, v in params.items()}
    def step(s, grads, lr=None):
        s.t += 1; lr = lr or s.lr
        for k, g in grads.items():
            s.m[k] = .9*s.m[k] + .1*g; s.v[k] = .999*s.v[k] + .001*g*g
            upd = (s.m[k]/(1-.9**s.t)) / (np.sqrt(s.v[k]/(1-.999**s.t)) + 1e-8)
            if s.wd and k.startswith("W"): upd = upd + s.wd*s.p[k]
            s.p[k] -= lr*upd
