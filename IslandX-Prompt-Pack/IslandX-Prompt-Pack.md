# پک پرامپت ساخت «Dynamic Island برای ویندوز» (مخصوص Qwen در حالت Agentic)

## انتخاب زبان و تکنولوژی

| گزینه | نتیجه |
|---|---|
| Electron / Tauri | سنگین‌تر است (RAM بالا) و برای باتری خوب نیست |
| C++ خالص | سبک‌ترین است ولی ساخت UI شیک با آن برای ایجنت پرریسک است |
| **C# + .NET 8 + WPF + WinRT/Win32 interop** | **انتخاب من.** سبک، پایدار، ایجنت‌ها خوب آن را می‌سازند، به API های ویندوز (نوتیف، مدیا، صدا) دسترسی مستقیم دارد و خروجی کوچک می‌شود |

چند نکته درباره پک زیر:
- پرامپت‌ها را **به انگلیسی** نوشتم چون مدل‌ها در کدنویسی با انگلیسی دقیق‌تر کار می‌کنند.
- عکسی که فرستادی تم روشن آبی دارد. در پرامپت گفتم **فقط چیدمان و حالت‌ها** را از عکس بگیرد و استایل را **مشکی + بنفش** کند.
- **در هر مرحله عکس را دوباره همراه پرامپت بفرست.**
- پرامپت‌ها را **به ترتیب و یکی‌یکی** بده و تا کامپایل و تست مرحله قبل تمام نشده، سراغ بعدی نرو. این کار بهترین کیفیت را می‌دهد.
- محدودیت‌های واقعی ویندوز را (مثل Quick Reply و Win+Shift+S) صادقانه توی پرامپت گذاشتم تا ایجنت الکی وقت هدر ندهد یا کد فیک بنویسد.

---

## پرامپت 0: Master / System Prompt (اول از همه این را بده)

```
You are a senior Windows desktop engineer + product designer working in AGENTIC mode. You can create files, run shell commands, build, run and test. 

PROJECT: "IslandX" — a Dynamic-Island-style smart notification hub for Windows 10/11, docked at the top-center of the screen. Reference design: the attached image (16 states: Idle, Hover panel, Music compact, Music expanded, Incoming message, Quick reply, Screenshot, Screenshot preview, Volume, Brightness, Charger connected, Low battery, Pomodoro, Next event, Camera & mic in use, Full-screen app).

IMPORTANT STYLE OVERRIDE: The image is a LIGHT blue theme. Use it ONLY for layout, hierarchy, content and states. The final visual theme must be a premium DARK theme: near-black base with subtle violet/purple accents, glass/blur, soft glows.

TECH STACK (fixed, do not change):
- C# 12, .NET 8, WPF, target net8.0-windows10.0.19041.0, PerMonitorV2 DPI aware
- Win32 interop (CsWin32 or P/Invoke), WinRT APIs (Windows SDK projections)
- NAudio (WASAPI loopback) for audio visualizer
- CommunityToolkit.Mvvm for MVVM, Microsoft.Extensions.DependencyInjection + Hosting
- No Electron, no WebView, no heavy UI libraries.

NON-NEGOTIABLE QUALITY RULES:
1. Performance: idle CPU < 0.5%, idle RAM < 90 MB, zero timers/animations running while idle and nothing visible changing. Event-driven (no polling) wherever an event API exists. 
2. Battery: enable EcoQoS (SetProcessInformation / PROCESS_POWER_THROTTLING) when idle; pause visualizer/capture when music is not playing or the island is hidden; render at 60 fps only during animations.
3. Smoothness: all transitions use spring/ease physics, GPU-accelerated (RenderTransform, Opacity, Clip). Never animate Width/Height via layout in a way that causes jank; use a fixed transparent canvas and morph a clipped rounded shape.
4. Window must be: borderless, topmost, WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE (NEVER steals focus, never appears in Alt-Tab), hardware-accelerated transparency (use DwmExtendFrameIntoClientArea / composition instead of AllowsTransparency=true), click-through outside the island shape (handle WM_NCHITTEST -> HTTRANSPARENT), correct on multi-monitor and any DPI.
5. No placeholder code, no TODO stubs, no fake data in the final product. If an API is impossible, implement the best real fallback and clearly document the limitation in README.
6. Code quality: clean architecture (Core / Services / UI / Infrastructure), async everywhere, proper disposal, global exception logging to %LOCALAPPDATA%\IslandX\logs, nullable enabled, analyzers on.

WORKFLOW RULES:
- First output a short architecture plan + folder structure + milestone list, then start implementing.
- After EVERY milestone: run `dotnet build -c Release`, fix all errors/warnings, launch the app and verify behavior, then summarize what works and what remains.
- Never stop at a broken build. Never ask me questions unless truly blocked; make the best professional decision and note it.
- Keep a living file `docs/PROGRESS.md` updated with milestones, decisions, known limitations.
- Wait for my next phase prompt after finishing each phase. Reply "PHASE X DONE" with a checklist when complete.

Confirm you understood, then wait for PHASE 1.
```

---

## پرامپت 1: بنیان پروژه + طراحی سیستم (Design System)

```
PHASE 1 — Project foundation + Design System.

1. Create solution `IslandX` with the structure:
   /src/IslandX.App (WPF), /src/IslandX.Core (models, state machine, interfaces), /src/IslandX.Services (Windows integrations), /tests/IslandX.Tests
   Set up DI/Hosting, logging (Serilog file sink, small rolling files), single-instance mutex, tray icon (NotifyIcon alternative that works in WPF, e.g. H.NotifyIcon) with menu: Settings, Pause, Do Not Disturb, Start with Windows, Exit.

2. Design tokens (ResourceDictionary, one place to change everything):
   - Background base: #08080C → #0E0B16 subtle vertical gradient
   - Surface: #121018 with 1px inner border rgba(255,255,255,0.07) + faint top-light gradient stroke (glass edge)
   - Accent violet: #8B5CF6, light #A78BFA, glow #C084FC, deep #5B21B6
   - Text primary #F5F3FF, secondary #A09BB5, tertiary #6B6680
   - Success #34D399, Warning #FBBF24, Danger #F87171
   - Radius: pill = height/2, panels = 30, inner cards = 20, buttons = full pill
   - Shadow: large soft shadow (black 55% + violet 10% glow), cheap to render (pre-baked or single DropShadowEffect only while expanded)
   - Font: "Segoe UI Variable Display/Text" with fallback "Segoe UI"; tabular numbers for time/timers; big clock weight SemiBold.
   - Icons: Segoe Fluent Icons / Segoe MDL2 Assets (no extra image assets, keeps size small).
   - Optional backdrop: Windows 11 acrylic/Mica via DWM (SetWindowCompositionAttribute fallback for Win10), tinted near-black with purple.

3. Build reusable controls: IslandShell (morphing clipped rounded container), PillButton (primary violet gradient / secondary ghost), IconButton, SeekBar, GlowSlider, SegmentedControl, Avatar (circular, initials fallback), Chip, Badge, AnimatedNumber.

4. Build an Animation helper: spring animator (stiffness ~380, damping ~30, mass 1) used for size/position/opacity/scale morphs, with 60fps CompositionTarget.Rendering ONLY while an animation is active, then unhooked.

5. Create a hidden dev "Gallery" window (Ctrl+Shift+G in Debug builds) that renders all 16 states with mock data so I can visually review each one.

Done criteria: app builds, runs from tray, empty pill shows at top-center on the correct monitor with the final dark-purple style, no focus stealing, click-through outside the pill, idle CPU ≈ 0.
```

---

## پرامپت 2: موتور جزیره (State Machine + Hover + Morph)

```
PHASE 2 — Island engine: state machine, morph animation, hover-to-expand, queueing.

Implement an IslandState machine with priority + queue:
States: Idle, HoverPanel, MusicCompact, MusicExpanded, IncomingMessage, QuickReply, ScreenshotPicker, ScreenshotPreview, Volume, Brightness, Charging, LowBattery, Timer(Pomodoro), NextEvent, PrivacyIndicator(Camera/Mic), FullscreenMini.

Rules:
- Priority (high→low): LowBattery/Privacy > IncomingMessage > NextEvent > Volume/Brightness/Charging > Screenshot > Timer > Music > Idle. A higher-priority event interrupts; lower one is queued and restored afterward.
- Auto-dismiss durations: message 5s (paused while mouse is over it), volume/brightness 1.8s, charging 3s, screenshot preview 6s, etc. All configurable.
- HOVER BEHAVIOR (key feature): hovering the pill for ~500 ms (configurable 300–1000) WITHOUT clicking expands to HoverPanel (clock, date, unread count, latest notification card, quick actions: Screenshot / Timer / Media / Settings). Moving the mouse away collapses after ~350 ms grace. No click required, no focus change, never interferes with windows underneath. Cancel the dwell timer if the mouse leaves early. Add subtle haptic-like micro scale (1.0→1.02) on hover start.
- Idle pill: shows time (big, SemiBold) + short date + unread-notification badge, auto-width. Collapsed music pill shows album art circle, title/artist, mini 3-bar visualizer.
- Morph animation: the same rounded shape smoothly morphs between sizes/corner radii (spring), content cross-fades with slight blur/scale (content in/out staggered 40ms). No flicker, no layout jumps. Position anchored top-center with ~8-12px margin from the top edge (configurable), and respects the primary/selected monitor and taskbar-on-top setups.
- Fullscreen detection (SHQueryUserNotificationState + foreground window rect check): switch to FullscreenMini (tiny pill: time + notification count dot as in the last state of the reference). Optionally hide completely while games/presentations; messages in that mode show as a very compact toast, and hover still expands it.
- Do Not Disturb mode suppresses everything except Low battery & Privacy.

Write unit tests for the state machine (priority, queue restore, timeouts) with a fake clock.

Done criteria: I can trigger every state from the dev Gallery/command palette in Debug and see smooth morph transitions between them at 60fps without CPU spikes when idle.
```

---

## پرامپت 3: نوتیفیکیشن‌ها + پیام‌ها + Quick Reply

```
PHASE 3 — Real notification capture (the core purpose of the app).

1. Use Windows.UI.Notifications.Management.UserNotificationListener:
   - Request access, handle Allowed/Denied/Unspecified gracefully with a friendly onboarding screen.
   - Subscribe to NotificationChanged (event-driven, no polling). Read app name, app icon, title, body lines, timestamp, and sender avatar/image if available.
   - NOTE: this API requires package identity. Solve it properly: create an MSIX **sparse package** (or single-project MSIX packaging) so the app has identity while remaining a normal WPF exe. Document the exact build/sign/install steps (self-signed dev cert script included).
2. Map notifications to IncomingMessage state (see reference): avatar, app name + small app icon, bold sender/title, message body (max 2-3 lines, ellipsis), relative time ("now", "2m"), "Open app" button, and a reply input field.
3. Notification Center inside HoverPanel: unread count badge, list of recent notifications grouped by app, swipe/click to dismiss, "clear all", history stored locally (SQLite or JSON, encrypted with DPAPI, retention configurable, can be disabled for privacy).
4. Smart behavior: group multiple messages from the same sender, show "+3 more", skip duplicates, per-app rules (mute / priority / hide content for privacy), keyword rules (e.g. OTP codes get a one-click "Copy code" button — detect 4–8 digit codes).
5. Original Windows toast banners will still appear — implement an onboarding step that explains how to disable banners per app (Settings → Notifications) while keeping notifications in Action Center so IslandX still receives them, and deep-link to ms-settings:notifications.
6. QUICK REPLY — be honest and realistic: Windows does NOT allow third-party apps to invoke inline-reply on other apps' toasts via the listener. Implement:
   a) "Open app" → activate the source app (via launch URI / AUMID / bring window to front).
   b) Quick Reply best-effort using UI Automation to find the matching toast/Action Center item and invoke its reply box when it exists; if not possible, fall back to opening the app and copying the typed reply to clipboard with a toast "Reply copied". Mark this feature "Experimental" in settings. Quick chips: "On my way", "Running 10 min late", "Call you later" (editable). 
   c) Reply UI must exactly follow the reference "Quick reply" state (header with name+app, close X, original message, input with Send button, chips below) in the dark-purple style. This UI is the ONLY state allowed to take keyboard focus (activate the window only while typing, then release focus back to the previous window).
7. RTL/Persian support: correct rendering of Persian/Arabic text, bidi, proper fonts (Vazirmatn bundled optional, ~100KB subset) and auto text direction per message.

Done criteria: sending a real Windows notification (e.g., from PowerShell BurntToast or a Telegram message) shows up on the island within ~200 ms with the correct app/sender/text.
```

---

## پرامپت 4: موزیک پلیر + رقص نور

```
PHASE 4 — Media player with audio-reactive visualizer.

1. Use GlobalSystemMediaTransportControlsSessionManager (SMTC): current session, playback status, title, artist, album, thumbnail, timeline (position/duration), source app name (e.g., Spotify), subscribe to events (MediaPropertiesChanged, PlaybackInfoChanged, TimelinePropertiesChanged, CurrentSessionChanged). Handle multiple sessions (choose the actively playing one; allow switching).
2. Compact state (reference "Music, compact"): small pill with rounded album art, title + artist (marquee scrolling when too long), pause icon, and a mini 3-bar live visualizer. When a tab/song is playing and nothing else is happening, the island automatically shows this compact pill and stays out of the way.
3. Expanded state (reference "Music, expanded"): large art with rounded corners, title, "artist — album", source app badge, 4-ish bar visualizer top-right, seek bar with elapsed/remaining time (draggable, smooth), prev / play-pause (large violet-glow circular button) / next. Hover-expand (500 ms dwell) also opens this when music is active.
4. Visualizer ("رقص نور"): 
   - Capture system audio via WASAPI loopback (NAudio), 1024/2048-point FFT, 16–32 log-spaced bands, smoothing with attack/release envelopes, peak-hold.
   - Render as rounded vertical bars (compact: 3 bars; expanded: more bars or a soft waveform) with violet gradient, glow, and color tinted from the album art's dominant color (fallback violet).
   - Subtle ambient glow behind the island that pulses to bass (very cheap: animated opacity of a pre-rendered radial gradient).
   - Cap at 30 fps, start capture ONLY when playback is "Playing" AND island is visible; stop completely when paused/hidden (zero CPU). Use pooled buffers, no per-frame allocations.
   - Fallback when loopback is unavailable: synthetic, gentle bars driven by playback state.
5. Album art: cached, downscaled to the needed size, decoded off the UI thread.
6. Optional: synced lyrics line (LRCLIB API, opt-in, cached) shown under the title in expanded view.
7. Media keys / hover scroll wheel to change volume of the island's session.

Done criteria: playing Spotify/YouTube in Chrome shows the compact pill with live bars; hovering 500 ms expands to the full player; controls work; pausing drops CPU to ~0.
```

---

## پرامپت 5: اسکرین‌شات

```
PHASE 5 — Screenshot tool integrated into the island.

1. Trigger: hover panel "Screenshot" button AND a global hotkey via RegisterHotKey (default Ctrl+Alt+S, configurable). NOTE: Win+Shift+S is reserved by Windows and can't be registered; offer an optional button that launches the system snipper through `ms-screenclip:` as an alternative, but the main flow must be our own.
2. Capture picker UI (reference "Screenshot" state): title "Capture", close X, three segmented options: Full screen / Region / Window, a footer line with Delay (off/3s/5s/10s), save folder (Pictures\Screenshots), cursor hidden/shown toggle.
3. Engine: use Windows.Graphics.Capture (or DXGI Desktop Duplication) for high-quality, DPI-correct, multi-monitor capture. 
   - Full screen: current monitor (or all).
   - Region: freeze the screen into a dim overlay on all monitors (lightweight, one borderless window per monitor), crosshair, live size indicator "1284 × 806", drag/resize handles, Esc to cancel, Enter to confirm.
   - Window: highlight window under cursor (DWM extended frame bounds, include rounded corners/shadow optionally), click to capture.
   - The island itself must never appear in the screenshot.
4. After capture: copy PNG to clipboard immediately, save as `Screenshot yyyy-MM-dd HHmmss.png`, then show the "Screenshot preview" state (thumbnail, filename, dimensions, file size, "Copied to clipboard" check, buttons: Save as…, Edit, Undo/Delete). Drag the thumbnail directly into other apps (drag & drop file).
5. Edit: a simple built-in annotation overlay (arrow, rectangle, highlighter, blur/pixelate, text, crop) in the same dark style; "Copy" and "Save" at the end. Keep it lightweight (no big libraries).
6. Extras: optional OCR "Copy text" using Windows.Media.Ocr (offline), auto-delete options, PNG optimization.

Done criteria: pressing the hotkey or hovering → Screenshot works end-to-end for all three modes on multi-monitor, preview appears, clipboard is filled, file saved.
```

---

## پرامپت 6: HUD های سیستم (صدا، روشنایی، باتری، دوربین/میکروفون)

```
PHASE 6 — System HUDs and indicators (all event-driven).

1. Volume (reference "Volume"): speaker icon (changes with level/mute), smooth glow slider, numeric value. Use Core Audio (IAudioEndpointVolume + IAudioEndpointVolumeCallback) for events; allow dragging the slider to change volume (focus-less). Also react to default device changes; show device name on hover.
2. Brightness (reference "Brightness"): sun icon, slider, value. Read/set via WMI (WmiMonitorBrightness / WmiMonitorBrightnessMethods) with WmiMonitorBrightnessEvent watcher; for external monitors try DDC/CI (dxva2) as optional, silently skip if unsupported.
3. Charger connected (reference "Charging"): plug icon bubble, "Charging", "1 h 12 min until full", battery glyph with percent and animated fill. Use SystemEvents.PowerModeChanged / Windows.Devices.Power.Battery.ReportUpdated (no polling).
4. Low battery (reference "Low battery"): thresholds 20% and 10% (configurable), red/pink danger tint but still in the dark theme, big percent, "Connect your charger", buttons "Battery settings" (ms-settings:batterysaver) and "Turn on battery saver".
5. Camera & microphone in use (reference): detect via registry ConsentStore (HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\{webcam,microphone} + NonPackaged subkeys, LastUsedTimeStop == 0 means in use). Use RegNotifyChangeKeyValue (no polling). Show green Camera chip and orange Mic chip, device names, using-app names, "Privacy settings" link. While active, show a tiny colored dot in the idle pill too.
6. Optional extras: Caps Lock / Num Lock indicator, Bluetooth device connected (with battery %), Wi-Fi/VPN connected, USB device connected, Focus Assist/DND changes, clipboard history peek (opt-in), download finished.

Done criteria: each HUD triggers from the real system event, within ~100ms, auto-dismisses correctly, and idle CPU stays ≈ 0.
```

---

## پرامپت 7: تایمر / پومودورو / تقویم / ویژگی‌های هوشمند

```
PHASE 7 — Productivity & smart features.

1. Timer / Pomodoro / Stopwatch (reference "Pomodoro"): segmented control (Timer | Pomodoro | Stopwatch), large tabular time (e.g., 18:24), label "Focus — Session 2 of 4", session dots, thin violet progress bar, buttons Pause/Resume, Skip to break, Reset. Configurable durations (25/5/15), sounds, persists across restarts. While running and nothing else active, show a compact pill with remaining time + circular progress. Use a single low-frequency timer (1 Hz) only while running; render at higher rate only during visible expansions.
2. Next event (reference "Next event"): date tile (NOV 12), title, time range, "in 18 min", location/meeting platform, primary "Join meeting" button (detect Teams/Zoom/Meet links and open them), "Snooze 5 min", plus a task/reminder row ("Submit expense report — Due 12:00"). Source: Windows AppointmentStore (Windows.ApplicationModel.Appointments) + optional ICS URL(s) in settings. Show 10 min before start (configurable) and again at start.
3. Smart behaviors:
   - Context awareness: if a fullscreen video/game/presentation is running → auto DND (configurable).
   - Smart auto-hide: after N seconds of nothing, shrink to minimal pill; optionally fade to low opacity when a window is maximized under it.
   - Quick actions row in HoverPanel customizable (drag to reorder): Screenshot, Timer, Media, Clipboard, Do Not Disturb, Color picker, Calculator.
   - Weather chip (opt-in, Open-Meteo, no API key) in HoverPanel.
   - Command palette: Ctrl+Alt+Space opens a small input inside the island (calc, unit conversion, launch apps, timers like "timer 10m").
4. Global keyboard shortcuts: configurable, conflict detection.
5. Localization: English + Persian (Farsi) with full RTL layout switch, Persian digits option, Jalali date option.

Done criteria: Pomodoro, events and quick actions all work and persist; Persian UI renders correctly in RTL.
```

---

## پرامپت 8: تنظیمات + بهینه‌سازی + پکیج نهایی

```
PHASE 8 — Settings, performance hardening, packaging.

1. Settings window (dark-purple, same design system, Mica/Acrylic, keyboard accessible): General (startup with Windows, monitor, position offset, size scale), Appearance (accent color picker with violet default, opacity/blur, corner roundness, compact/large mode), Behavior (hover delay, auto-dismiss durations, priority order), Notifications (per-app rules, privacy: hide content, DND schedule), Music, Screenshot, Timer, Shortcuts, Languages, About + Check for updates (GitHub releases, optional).
2. Settings stored in JSON (%LOCALAPPDATA%\IslandX), atomic writes, live-apply without restart.
3. Performance audit (must report numbers in PROGRESS.md):
   - Measure idle CPU, working set, handles, GC count with dotnet-counters / PerfView notes. 
   - Targets: idle CPU < 0.5%, RAM < 90 MB, cold start < 1.2 s, island animation 60fps with < 6% CPU on a mid laptop.
   - Enable: ReadyToRun, TieredPGO, `ServerGC=false`, `ConcurrentGarbageCollection=false`, trimming where safe, no unused assemblies, lazy-load heavy services (visualizer, OCR, screenshot editor) only on first use.
   - Freeze Freezable objects, cache brushes/geometries, avoid BlurEffect on large areas (use pre-rendered gradients), RenderOptions bitmap scaling, set `RenderOptions.ProcessRenderMode` smartly.
   - Pause all animations when the session is locked, the display is off, or the laptop is on battery saver (reduce visualizer to 20 fps).
4. Robustness: handle monitor hot-plug, DPI changes, Explorer restart, sleep/resume, RDP sessions, Windows 10 vs 11 differences (rounded corners, Mica fallback).
5. Security/privacy: no network except opted-in features, no telemetry, notification history encrypted, clear-data button.
6. Packaging: 
   - `dotnet publish -c Release -r win-x64 --self-contained false -p:PublishReadyToRun=true` (small, requires .NET 8 Desktop Runtime) AND a self-contained single-file variant.
   - MSIX (sparse package for identity) + signing script, or an Inno Setup installer that registers the sparse package and a startup entry.
   - Produce README.md (install, permissions, limitations, troubleshooting), LICENSE, and a CHANGELOG.
7. Final QA checklist: run through all 16 reference states and verify each against the reference layout in the dark-purple theme; list any deviations.

Done criteria: installer/portable build produced, all tests pass, performance numbers reported, final checklist all green.
```

---

## نکات مهم برای تو

1. **اگر ایجنت وسط کار گیر کرد**، این را بفرست:
   `Build is failing. Read the full error output, fix the root cause (not by removing the feature), rebuild, and continue. Show me the final build log.`
2. **برای بررسی ظاهر**، بعد از فاز ۱ و ۲ از او بخواه: `Take screenshots of every state from the Gallery and compare them against the reference image. Fix spacing, radius, typography and alignment mismatches.`
3. **محدودیت‌های واقعی ویندوز:**
   - پیام‌ها را فقط از طریق اجازه‌ی Notification Access می‌خواند، پس باید در تنظیمات ویندوز اجازه بدهی.
   - بنر اصلی ویندوز را نمی‌شود کامل خاموش کرد. باید بنر برنامه‌ها را از تنظیمات ویندوز خاموش کنی تا فقط جزیره نمایش بدهد.
   - Quick Reply مستقیم برای تلگرام و واتس‌اپ در ویندوز محدود است و در پرامپت به‌صورت «آزمایشی + راه جایگزین» نوشته شده.
4. اگر Qwen کانتکستش پر شد، فایل `docs/PROGRESS.md` را بهش بده و بگو: `Continue from PROGRESS.md, next is PHASE X`.
