# برنامه‌ی کار

## انجام‌شده
- [x] انتقال فایل‌ها از ورک‌اسپیس قبلی به گیت‌هاب
- [x] مرتب‌سازی درخت پوشه‌ها
- [x] راه‌اندازی دموی HTML (پیش‌نمایش زنده)
- [x] مرور کد + تست واقعی موتور متن → `docs/REVIEW.md`

## یافته‌های باز (از REVIEW)
- [x] **P1** گارد کلاهبرداری چندسیگنالی شد (`scamScore`) — ۱۱/۱۱ کیس سیاست ✅
- [ ] **P2** احتمالات مدل متن اشباع‌اند (۰/۱۰۰) — کالیبراسیون دما لازم است
- [ ] **P3** RTL/فارسی‌سازی UI + دسترس‌پذیری (aria/tabindex/کیبورد)
- [ ] **P4** برچسب «simulated» روی موزیک/باتری/تایمر
- [ ] **P5** پاک‌سازی: `level()` حذف شد ✅ · reset ناقص و `ctx` بدون ذخیره‌سازی باقی است
- [ ] **P6** بازگرداندن `text_model.py` و `metrics_text.json` اصلی (در آپلود تخت با نسخه‌ی legacy جابه‌جا شدند) — فعلاً مهم نیست

## تست
```bash
node IslandX-Model/test_engine.js   # 19/21 · 2 known gap
node IslandX-Model/eval_engine.js   # ارزیابی int8 روی تست‌ست‌های واقعی
```

## آرشیو دستور قبلی
```bash
node IslandX-Model/test_engine.js          # 18/20 · 2 known model gap (پوشش‌داده‌شده توسط policy)
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
