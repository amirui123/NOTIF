# IslandX Windows — experimental foundation

This is **not the finished product or a release**. It is a small native WPF foundation, separate from the HTML prototype. It reads the Windows clock and battery status, can optionally register per-user startup on request, and reads clipboard text only on an explicit button press. Clipboard text is not persisted and is cleared from the display when the panel is collapsed or hidden. A tray menu can show the window or exit.

It does **not** yet integrate Windows notifications, trained models, media sessions, a persistent clipboard history, full-screen detection, the prototype's visuals/motion, or an installer. The startup entry points to the published executable in its current location; moving/deleting it breaks startup. Disabling startup in Windows settings remains under the user's control. Remove the optional entry via the checkbox before deleting this experimental preview.

No networking or telemetry is implemented. Do not use this preview for sensitive clipboard data or treat it as security-reviewed. Unsigned experimental binaries may trigger SmartScreen.

Build on Windows with the .NET 10 SDK:

```powershell
dotnet publish IslandX-Windows/IslandX.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out/IslandX-Windows
```

The GitHub Actions workflow only builds an **experimental artifact**; it does not create or upload a GitHub Release. Real-device testing and the remaining features are necessary before an installer or final release.
