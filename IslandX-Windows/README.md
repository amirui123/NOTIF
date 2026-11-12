# IslandX Windows — experimental preview

This is **not the finished product**. The first window hosts the actual, unchanged `IslandX-Prototype/index.html`, embedded into the application. Its battery, notification, music, meeting, and context controls remain simulations: it is not yet a real desktop island. The embedded page and trained weights run locally; WebView2 Runtime must already be installed. A virtual local origin is served from the embedded resource, with network requests blocked.

The tray menu also exposes a separate early native status panel. That panel reads the Windows clock and battery, can optionally register per-user startup on request, and reads clipboard text only when the button is pressed. Clipboard text is not persisted and is cleared from the display when the panel is collapsed or hidden. The tray menu can exit. Startup opens the prototype preview, not a finished background island. The startup entry points to the executable in its current location; moving/deleting it breaks startup. Remove the optional entry via the checkbox before deleting the preview.

The final native notification bridge, a persistent clipboard history, real media, full-screen detection, and the native island are **not implemented**. The UI is not yet integrated with the real machine. This preview has not undergone a security audit or real-device interactive test; unsigned binaries may trigger SmartScreen. Do not use sensitive clipboard data.

Build on Windows with the .NET 10 SDK (restore needs NuGet, runtime use is offline):

```powershell
dotnet publish IslandX-Windows/IslandX.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out/IslandX-Windows
```

A successful CI build and brief process-start test do not validate interactive rendering, startup on login, or real hardware. The workflow builds an experimental artifact, not a finished release.
