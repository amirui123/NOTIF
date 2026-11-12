# IslandX Windows — experimental desktop island

This preview opens a small, topmost island on the primary screen using the actual HTML prototype and its embedded weights. Its transparent desktop shell is experimental and not a finished product. The system clock and battery percentage/plugged-in state come from Windows. Wattage and time-to-full are not available from this integration and are not claimed. The full demo, which includes simulated notifications and other test controls, is available via the tray menu.

**Not yet implemented:** real Windows notifications, actual media sessions, automatic fullscreen detection, a persistent clipboard history, a full installer/uninstaller, and the other system integrations. The controls for those in the demo are simulations. The tray offers an early native panel that can read clipboard text on demand and can enable per-user startup; clipboard text is not persisted. Startup is off until enabled by the user, and uses the executable at its current location. Disable it in the panel before moving or deleting that executable.

The page and models are embedded, served from memory and run offline; outgoing page requests are blocked. Microsoft Edge WebView2 Runtime must already be installed. The .NET runtime is bundled in the Windows x64 ZIP. This unsigned preview has not had a security audit or interactive testing on real devices. It should not be used for sensitive clipboard data or relied on for important notifications.

Build on Windows 10 2004 or newer with the .NET 10 SDK (package restore needs NuGet; normal operation is offline):

```powershell
dotnet publish IslandX-Windows/IslandX.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out/IslandX-Windows
```

The GitHub workflow compiles and starts the executable and checks both embedded pages and a simulated battery message. It does not replace real-device testing for rendering, hit testing, battery, permissions, or startup.
