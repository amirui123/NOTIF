# IslandX attention model (v4)

Run order: `text_model.py` → `sim.py` → `behavior.py` → `stage2.py` → `policy.py` → `export_js.py` → `node checks.js`
(numpy + scipy + node only, about 10 minutes on 2 CPU cores, under 1 GB RAM).

| File | What it is |
|---|---|
| `common.py` | text normalisation, FNV-1a n-gram hashing, AdamW, metrics |
| `text_model.py` | multi-task text network: P(unwanted) + type (personal / transactional / promotional / scam) |
| `sim.py` | behaviour simulator: 600 simulated users × 400 notifications, real held-out message texts |
| `behavior.py`, `stage2.py` | behaviour networks: wide & deep + residual block, memory features, residual memory, 3-net ensemble |
| `policy.py` | decision policy under realistic (partial) feedback: utility thresholds, exploration test, scam guard |
| `export_js.py`, `weights.json`, `engine.js` | shipped weights (int8 / int16) and the inference engine used by the prototype |
| `checks.js` | behavioural test-suite run against the shipped engine |
| `metrics_*.json` | every reported number |
| `legacy/` | v1 model and the text metrics before the extra Persian data |

## Data
| Source | Use | Licence |
|---|---|---|
| SahadatIslamAsif/BartaScope `merged.csv` (12,808 SMS, 4 gold classes, English/Bangla) | train/val/test with the authors' leak-free split | MIT |
| MahdiyarGHD/sms-spam-dataset (5,839 Persian SMS, spam/ham) | train/val/test | none stated |
| ElaheBarghamadi/SpamModel training files (≈6,000 Persian scam / modern ham messages, partly pattern-generated) | train/val/test | none stated |
| ElaheBarghamadi/SpamModel `test/` (natural_217, judge_100, user_57) | test only | none stated |
| 1,000 templated OTP / receipt / promo messages (generated here) | training only | — |

## Limits
- User reactions are simulated; only message texts are real. Behaviour numbers show the learning machinery works, not how well it predicts real people.
- The Persian external test sets come from the same author as part of the Persian training data, so they are no longer independent.
- Persian message types use rule-derived (weak) labels. Two of the three Persian sources have no licence: check before shipping.
- Exploration bonus and the Bayesian online head were tested and gave no gain; both are left out of the shipped model.

## Ideas used
fastText (Joulin et al. 2016), data programming / weak supervision (Ratner et al. 2017), Wide & Deep (Cheng et al. 2016),
residual blocks (He et al. 2016), AdamW (Loshchilov & Hutter 2019), temperature scaling (Guo et al. 2017),
UCB exploration (Auer et al. 2002), CheckList behavioural testing (Ribeiro et al. 2020),
notification receptivity studies (Mehrotra et al. CHI 2016; Pielot et al. UbiComp 2017).
