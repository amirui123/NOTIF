# IslandX — NOTIF

**IslandX** یک هاب اعلان هوشمند به سبک Dynamic Island برای ویندوز ۱۰/۱۱ است (بالای وسط صفحه، تم تیره با اکسنت بنفش، شیشه‌ای و بدون فوکوس‌دزدی). این ریپو سه بخش دارد:

| پوشه | چیه |
|---|---|
| [`IslandX-Prototype/`](IslandX-Prototype/) | **دموی HTML** — پیش‌نمایش تعاملی رابط کاربری، تک‌فایل و کاملاً self-contained (فونت‌ها و وزن‌های مدل inline) |
| [`IslandX-Model/`](IslandX-Model/) | مدل توجه (Python/numpy) + موتور استنتاج JS + دیتاست‌ها |
| [`IslandX-Prompt-Pack/`](IslandX-Prompt-Pack/) | پرامپت مادر + ۸ فاز پیاده‌سازی نسخه‌ی WPF |

## دموی زنده

```bash
cd IslandX-Prototype
python3 -m http.server 8080 --bind 0.0.0.0
```

سپس `http://localhost:8080` را باز کنید. هیچ بیلد و نصبی لازم نیست — همه چیز داخل `index.html` است.

دمو شامل ۱۶ حالت جزیره است (Idle، Hover panel، Music compact/expanded، Incoming message، Quick reply، Screenshot، Screenshot preview، Volume، Brightness، Charging، Low battery، Pomodoro، Next event، Privacy indicator، Fullscreen mini) به‌همراه یک **داک شبیه‌ساز** که با آن می‌شود اعلان فرستاد، به آن واکنش داد (باز کردن / رد کردن / نادیده گرفتن) و رفتار مدل v4 را در پنل «What the island has learned» دید.

## مدل

نگاه کنید به [`IslandX-Model/README.md`](IslandX-Model/README.md). اجرای زنجیره‌ی آموزش:

```
text_model.py → sim.py → behavior.py → stage2.py → policy.py → export_js.py → node checks.js
```

## مستندات

- [`docs/PROJECT-MAP.md`](docs/PROJECT-MAP.md) — نقشه‌ی کامل فایل‌ها و کارکردشان
- [`docs/PLAN.md`](docs/PLAN.md) — برنامه‌ی کار و کارهای باقی‌مانده
