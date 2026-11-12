# نقشه‌ی پروژه IslandX

آخرین بازبینی: پس از آپلود فایل‌های ورک‌اسپیس قبلی. همه‌ی فایل‌ها خوانده و مرتب شده‌اند.

## ساختار نهایی

```
NOTIF/
├── IslandX-Prototype/          دموی HTML (تک‌فایل، v7)
│   ├── index.html              764 KB — کل دمو: CSS + آیکون‌های SVG + وزن‌های مدل + منطق، همه inline
│   ├── preview.png             اسکرین‌شات پیش‌نمایش
│   └── fonts/                  Inter + Vazirmatn (هر دو SIL OFL) — داخل HTML هم embed شده‌اند
├── IslandX-Model/
│   ├── README.md               مستند فنی مدل (v4): منابع داده، لایسنس‌ها، محدودیت‌ها
│   ├── common.py               نرمال‌سازی متن فارسی، هش n-gram (FNV-1a)، AdamW، متریک‌ها
│   ├── text_model.py           Stage A — مدل متن fastText-style (multi-task در نسخه‌ی کامل)
│   ├── sim.py                  شبیه‌ساز رفتار: ۶۰۰ کاربر × ۴۰۰ اعلان، متن‌های واقعی held-out
│   ├── behavior.py             شبکه‌ی رفتاری wide & deep + بلوک residual
│   ├── stage2.py               مرحله‌ی دوم/کالیبراسیون
│   ├── policy.py               سیاست تصمیم با فیدبک جزئی: آستانه‌ی سودمندی، تست اکتشاف، گارد کلاهبرداری
│   ├── export_js.py            خروجی وزن‌ها به int8/int16 در weights.json
│   ├── engine.js               موتور استنتاج سمت مرورگر
│   ├── checks.js               تست‌های رفتاری (CheckList) روی موتور خروجی‌گرفته‌شده
│   ├── weights.json            ۵۵۸ KB — وزن‌های فشرده‌شده (base64 + scale)
│   ├── *.npz                   وزن‌های float برای پایتون
│   ├── metrics_*.json          همه‌ی اعداد گزارش‌شده
│   ├── *.log                   لاگ‌های آموزش/سیاست
│   ├── data/                   دیتاست‌ها (CSV/JSON)
│   └── legacy/                 مدل v1 و متریک‌ها قبل از دیتای فارسی اضافه
├── IslandX-Prompt-Pack/
│   ├── IslandX-Prompt-Pack.md  سند کامل پرامپت‌ها (۲۵ KB)
│   └── prompts/                0-master + 1-phase-1 … 8-phase-8
├── image-search/               ۲ رفرنس UI (media player / colorful waveform)
├── uploads/                    تصاویر آپلودی
└── docs/                       همین مستندات
```

## دمو — `IslandX-Prototype/index.html`

- **بدون هیچ وابستگی خارجی**: هیچ `src=` یا `href=` به فایل بیرونی ندارد؛ فونت‌ها base64 و وزن‌های مدل در `<script>const WB={…}` هستند.
- ساختار: `<style>` (خط ۷–۲۷۳) → مارک‌آپ ۱۶ حالت با `id="s-*"` → اسکریپت وزن‌ها → اسکریپت منطق (~۴۴۰ خط).
- حالت‌ها: `s-idle`, `s-peek` (hover panel), `s-music`, `s-musicx`, `s-glance`, `s-toast`, `s-reply`, `s-shot`, `s-prev`, `s-vol`, `s-bri`, `s-chg`, `s-lowbat`, `s-timerc`, `s-timerx`, `s-event`, `s-priv`.
- داک پایین صفحه: سه گروه دکمه (Notification / Context / System events) + پنل «What the island has learned» با دکمه‌ی `reset`.
- مدل داخل دمو **v4** است و به‌صورت آنلاین از واکنش کاربر (باز کردن / دیسمیس / نادیده گرفتن) یاد می‌گیرد.

## مدل — کیفیت فعلی (از `metrics_text.json`)

| زبان | مدل | Accuracy | F1 | AUC |
|---|---|---|---|---|
| English (n=481) | v1 regex | 0.867 | 0.086 | — |
| English | v2 neural (شipped) | 0.983 | 0.933 | 0.988 |
| Persian (n=607) | v1 regex | 0.557 | 0.316 | — |
| Persian | v2 neural (shipped) | 0.924 | 0.932 | 0.977 |

محدودیت‌های اعلام‌شده در `IslandX-Model/README.md`: واکنش کاربران شبیه‌سازی‌شده است، بخشی از دیتای فارسی ضعیف‌برچسب و بدون لایسنس است، و تست فارسی مستقل نیست (از همان نویسنده‌ی دیتای آموزش).

## نکته‌ی مهم درباره‌ی آپلود (فایل‌های هم‌نام)

آپلود فایل‌ها به‌صورت تخت (all in one folder) باعث شد فایل‌های هم‌نامِ `legacy/` روی نسخه‌ی اصلی بیفتند. مقایسه‌ی حجم‌ها در اسکرین‌شات‌ها با فایل‌های آپلودشده:

| فایل | حجم در `IslandX-Model/` (اسکرین‌شات) | حجم آپلودشده | نتیجه |
|---|---|---|---|
| `text_model.py` | ۱۱ KB | ۵ KB | احتمالاً نسخه‌ی legacy جایگزین شده |
| `metrics_text.json` | ۲ KB | ۱ KB | احتمالاً نسخه‌ی legacy جایگزین شده |

بقیه‌ی فایل‌ها سالم‌اند. برای اطمینان، این دو فایل باید دوباره از پوشه‌ی اصلی آپلود شوند.
