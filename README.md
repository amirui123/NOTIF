# IslandX — NOTIF

**IslandX** یک هاب اعلان هوشمند به سبک Dynamic Island برای ویندوز ۱۰/۱۱ است (بالای وسط صفحه، تم تیره با اکسنت بنفش، شیشه‌ای و بدون فوکوس‌دزدی). این ریپو سه بخش دارد:

| پوشه | چیه |
|---|---|
| [`IslandX-Prototype/`](IslandX-Prototype/) | **دموی HTML** — پیش‌نمایش تعاملی رابط کاربری، تک‌فایل و کاملاً self-contained (فونت‌ها و وزن‌های مدل inline) |
| [`IslandX-Model/`](IslandX-Model/) | مدل توجه (Python/numpy) + موتور استنتاج JS + دیتاست‌ها |
| [`IslandX-Prompt-Pack/`](IslandX-Prompt-Pack/) | پرامپت مادر + ۸ فاز پیاده‌سازی نسخه‌ی WPF |

## دموی زنده

```bash
npm run serve          # python3 -m http.server 8080 --directory IslandX-Prototype
```

سپس `http://localhost:8080` را باز کنید. هیچ بیلد و نصبی لازم نیست — همه چیز داخل `index.html` است (فونت‌ها و ۵۷۱KB وزن مدل، base64).

### ۲۱ حالت

`idle` · `HoverPanel` · `MusicCompact` · `MusicExpanded` · `Dual` (موزیک + تایمر) · `Glance` · `IncomingMessage` · `QuickReply` · `Sent` · `ScreenshotPicker` · `ScreenshotPreview` · `Volume` · `Brightness` · `Charging` · `LowBattery` · `PomodoroCompact` · `PomodoroExpanded` · `PhaseCard` · `NextEvent` · `PrivacyIndicator` · `FullscreenLine`

### چیزی که این نسخه را متفاوت می‌کند

| قابلیت | توضیح |
|---|---|
| **اولویت + صف + بازگردانی** | OSD صدا وسط اعلان می‌آید؟ صف می‌شود و بعد از تمام‌شدن اعلان با زمان باقی‌مانده برمی‌گردد. پنل تعاملی باز باشد، رویدادها صف می‌شوند. |
| **پومودورو تطبیقی** | طول جلسه با یک شبکه‌ی کوچک (۲۲ ویژگی: ساعت روز، تاریخچه‌ی جلسات، نرخ رهاکردن) پیشنهاد می‌شود؛ توزیع log-normal روی «چقدر می‌توانی تمرکز کنی». |
| **سپر تمرکز** | در طول جلسه، هر اعلان یک محاسبه‌ی هزینه/فایده دارد: `gain = اهمیت × فوریت × زمان انتظار` در برابر `cost = سهم جلسه‌ای که از دست می‌دهی`. اگر نگذرد، **نگه داشته** می‌شود و سر استراحت آزاد می‌شود. |
| **مدل توجه v4** | مدل متن (n-gram هش‌شده) + سه شبکه‌ی رفتاری + حافظه‌ی فرستنده؛ همه سمت کلاینت. |
| **گارد کلاهبرداری** | امتیاز چندسیگنالی؛ فیشینگ فارسی و فینگلیش پیش از نمایش گرفته می‌شود. |
| **فنر واقعی** | هر ویژگی (عرض/ارتفاع/شعاع/مقیاس) فنر مستقل با انتقال سرعت هنگام تغییر هدف. |
| **Hover intent تطبیقی** | در تمام‌صفحه باید کرسر روی خط «توقف» کند؛ زمانِ لازم از رفتار شما یاد گرفته و ذخیره می‌شود. |
| **هالو هلالی + کوریوگرافی شارژ** | خط هلالی با جاروی نور و دات‌های انرژی که به باتری می‌ریزند؛ همه با `prefers-reduced-motion`. |

## تست

```bash
npm test              # مدل متن (۹ کیس) + سیاست تصمیم (۱۲ کیس)
npm run test:eval     # ارزیابی موتور int8 روی تست‌ست‌های واقعی
npm i && npm run test:ui   # بوت دمو در DOM بی‌سر و ۱۲ سناریوی تعاملی
```

هر دو تست، کد را از خودِ `index.html` برمی‌دارند — پس همیشه همان چیزی را می‌سنجند که منتشر می‌شود.

## مدل

نگاه کنید به [`IslandX-Model/README.md`](IslandX-Model/README.md). اجرای زنجیره‌ی آموزش:

```
text_model.py → sim.py → behavior.py → stage2.py → policy.py → export_js.py → node checks.js
```

## مراجع

`reference/qwen-prototype.html` — نمونه‌ی مقایسه‌ای (تولیدشده با Qwen). تحلیل: [`docs/COMPARE-qwen.md`](docs/COMPARE-qwen.md)

## مستندات

- [`docs/PROJECT-MAP.md`](docs/PROJECT-MAP.md) — نقشه‌ی کامل فایل‌ها و کارکردشان
- [`docs/PLAN.md`](docs/PLAN.md) — برنامه‌ی کار و کارهای باقی‌مانده
- [`docs/COMPARE-qwen.md`](docs/COMPARE-qwen.md) — مقایسه با نمونه‌ی Qwen و برنامه‌ی الحاق قابلیت‌ها
