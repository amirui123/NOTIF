# برنامه‌ی کار

## انجام‌شده
- [x] انتقال فایل‌ها از ورک‌اسپیس قبلی به گیت‌هاب
- [x] مرتب‌سازی درخت پوشه‌ها
- [x] راه‌اندازی دموی HTML (پیش‌نمایش زنده)
- [x] مرور کد + تست واقعی موتور متن → `docs/REVIEW.md`

## یافته‌های باز (از REVIEW)
- [ ] **P1** گارد کلاهبرداری فقط کلاس `scam` انگلیسی را می‌گیرد؛ فیشینگ فارسی و فینگلیش بدون هشدار به‌عنوان promo نشان داده می‌شود. (۲ از ۹ کیس تست)
- [ ] **P2** احتمالات مدل متن اشباع‌اند (۰/۱۰۰) — کالیبراسیون دما لازم است
- [ ] **P3** RTL/فارسی‌سازی UI + دسترس‌پذیری (aria/tabindex/کیبورد)
- [ ] **P4** برچسب «simulated» روی موزیک/باتری/تایمر
- [ ] **P5** پاک‌سازی: `level()` مرده، reset ناقص، `ctx` ذخیره نمی‌شود
- [ ] **P6** بازگرداندن `text_model.py` و `metrics_text.json` اصلی (در آپلود تخت با نسخه‌ی legacy جابه‌جا شدند) — فعلاً مهم نیست

## تست
```bash
node IslandX-Model/test_engine_text.js     # 7/9 — هدف: 9/9
```

## برنامه‌ی الحاق از نسخه‌ی Qwen (جزئیات در `docs/COMPARE-qwen.md`)
### موج ۱
- [ ] صدای واقعی (Web Audio + AnalyserNode برای ویژوالایزر)
- [ ] ماشین حالت با اولویت + صف + بازگردانی (`PRI` / `restoreStack` / `evQueue`)
- [ ] پنل شفافیت مدل با اعداد واقعی (تب‌های affinity / habituation / decisions / telemetry)
- [ ] لایه‌ی سیاست: `interrupt = p × (1 − load × shield)` + refractory
### موج ۲
- [ ] Settings + قواعد per-app + ذخیره‌سازی
- [ ] Command palette (Ctrl+Alt+Space)
- [ ] State gallery (Ctrl+Shift+G)
- [ ] History با فیلتر/جستجو/undo
### موج ۳
- [ ] Chat / Quick reply کامل
- [ ] Cinema mode
- [ ] Screenshot + ادیتور
