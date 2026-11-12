# IslandX Windows — experimental desktop island

This preview opens a small, topmost island on the primary screen using the actual HTML prototype and its embedded weights. Its transparent desktop shell is experimental and not a finished product. The system clock and battery percentage/plugged-in state come from Windows. Wattage and time-to-full are not available from this integration and are not claimed. The full demo, which includes simulated notifications and other test controls, is available separately via the tray menu. The desktop overlay hides the simulated screenshot, command and system Do Not Disturb controls. Hover over the island and click Clipboard to read text explicitly; it is cleared on pointer exit and not saved.

**Not yet implemented:** real Windows notifications, actual media sessions, automatic fullscreen detection, a persistent clipboard history, and the other system integrations. The controls for those in the demo are simulations. The tray offers an early native panel that can read clipboard text on demand and can enable per-user startup; clipboard text is not persisted. Startup is off until enabled by the user, and uses the executable at its current location. Disable it in the panel before moving or deleting that executable.

The page and models are embedded, served from memory and run offline; outgoing page requests are blocked. Microsoft Edge WebView2 Runtime must already be installed. The .NET runtime is bundled in the Windows x64 installer and ZIP. The per-user installer creates a Start menu shortcut and can be removed using Windows Settings; it removes the startup entry if it points to the installed executable. This unsigned preview has not had a security audit or interactive testing on real devices. It should not be used for sensitive clipboard data or relied on for important notifications.

Build on Windows 10 2004 or newer with the .NET 10 SDK (package restore needs NuGet; normal operation is offline):

```powershell
dotnet publish IslandX-Windows/IslandX.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out/IslandX-Windows
```

The GitHub workflow compiles and starts the executable and checks both embedded pages, a simulated battery message, and silent install/uninstall. It does not replace real-device testing for rendering, hit testing, battery, permissions, or startup.
