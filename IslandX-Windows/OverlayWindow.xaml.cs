using Microsoft.Web.WebView2.Core;
using System;
using System.ComponentModel;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace IslandX.Windows;

public partial class OverlayWindow : Window
{
    private const string LocalPage = "https://islandx.local/index.html";
    private const string Headers = "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'\r\nX-Content-Type-Options: nosniff\r\n";
    private readonly DispatcherTimer _powerTimer = new() { Interval = TimeSpan.FromSeconds(10) };
    private readonly bool _smokeTest = Array.Exists(Environment.GetCommandLineArgs(), a => a == "--overlay-smoke-test");
    private bool _ready, _exiting;

    public OverlayWindow()
    {
        InitializeComponent();
        View.DefaultBackgroundColor = System.Drawing.Color.Transparent;
        Loaded += InitializeOverlay;
        Application.Current.Exit += (_, _) => _exiting = true;
        _powerTimer.Tick += (_, _) => SendPower();
    }

    private void PositionAtTop()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Left + (area.Width - Width) / 2;
        Top = area.Top;
    }

    private async void InitializeOverlay(object sender, RoutedEventArgs args)
    {
        Loaded -= InitializeOverlay;
        PositionAtTop();
        try
        {
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IslandX", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await View.EnsureCoreWebView2Async(environment);
            var core = View.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreHostObjectsAllowed = false;
            core.NavigationStarting += (_, e) => { if (!string.Equals(e.Uri, LocalPage, StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.PermissionRequested += (_, e) => e.State = CoreWebView2PermissionState.Deny;
            core.DownloadStarting += (_, e) => e.Cancel = true;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += (_, e) =>
            {
                if (string.Equals(e.Request.Uri, LocalPage, StringComparison.OrdinalIgnoreCase))
                {
                    Stream? content = Assembly.GetExecutingAssembly().GetManifestResourceStream("IslandX.Prototype.index.html");
                    e.Response = content == null ? environment.CreateWebResourceResponse(null, 500, "Missing prototype", "Cache-Control: no-store\r\n") : environment.CreateWebResourceResponse(content, 200, "OK", Headers);
                }
                else e.Response = environment.CreateWebResourceResponse(null, 403, "Blocked", "Cache-Control: no-store\r\n");
            };
            core.WebMessageReceived += (_, e) =>
            {
                if (!string.Equals(e.Source, LocalPage, StringComparison.OrdinalIgnoreCase)) return;
                try
                {
                    using var json = JsonDocument.Parse(e.WebMessageAsJson);
                    var root = json.RootElement;
                    if (!root.TryGetProperty("type", out var type)) return;
                    if (type.GetString() == "ready") { _ready = true; SendPower(); _powerTimer.Start(); }
                    else if (type.GetString() == "readClipboard")
                    {
                        string? text = null;
                        try
                        {
                            text = Clipboard.ContainsText() ? Clipboard.GetText() : "No clipboard text";
                            if (text.Length > 512) text = text[..512] + "…";
                        }
                        catch (System.Runtime.InteropServices.ExternalException) { }
                        core.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "clipboard", text }));
                    }
                    else if (type.GetString() == "size" && root.TryGetProperty("width", out var w) && root.TryGetProperty("height", out var h) && w.TryGetDouble(out double width) && h.TryGetDouble(out double height) && double.IsFinite(width) && double.IsFinite(height))
                    {
                        Width = Math.Clamp(width, 100, 390); Height = Math.Clamp(height, 30, 340); PositionAtTop();
                    }
                }
                catch (JsonException) { }
                catch (InvalidOperationException) { }
            };
            using var script = Assembly.GetExecutingAssembly().GetManifestResourceStream("IslandX.NativeOverlay.js") ?? throw new InvalidOperationException("Missing overlay adapter");
            using var reader = new StreamReader(script);
            await core.AddScriptToExecuteOnDocumentCreatedAsync(await reader.ReadToEndAsync());
            if (_smokeTest)
            {
                await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__islandErrors=[];window.addEventListener('error',e=>window.__islandErrors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__islandErrors.push('rejection'));");
                core.NavigationCompleted += async (_, e) =>
                {
                    bool ok = false;
                    try
                    {
                        if (e.IsSuccess)
                        {
                            await System.Threading.Tasks.Task.Delay(1200);
                            ok = await core.ExecuteScriptAsync("Boolean(document.documentElement.dataset.nativeOverlay === 'true' && document.querySelector('#island .st.on') && getComputedStyle(document.querySelector('#dock')).display === 'none' && document.querySelector('#native-clipboard') && ['#a-pal','#a-shot','#a-dnd','#l-save'].every(s => getComputedStyle(document.querySelector(s)).display === 'none') && typeof textModel === 'function' && batt.pct === 73 && batt.w > 0 && window.__islandErrors.length === 0)") == "true" && Width >= 100 && Height >= 30;
                        }
                    }
                    catch (Exception) { }
                    _exiting = true; Application.Current.Shutdown(ok ? 0 : 1);
                };
            }
            core.Navigate(LocalPage);
        }
        catch (Exception)
        {
            Failure.Visibility = Visibility.Visible; View.Visibility = Visibility.Collapsed;
            if (_smokeTest) { _exiting = true; Application.Current.Shutdown(1); }
        }
    }

    private void SendPower()
    {
        if (!_ready || View.CoreWebView2 == null) return;
        if (_smokeTest)
        {
            View.CoreWebView2.PostWebMessageAsJson("{\"type\":\"power\",\"available\":true,\"percent\":73,\"plugged\":true}");
            return;
        }
        var power = Forms.SystemInformation.PowerStatus;
        bool available = !power.BatteryChargeStatus.HasFlag(Forms.BatteryChargeStatus.NoSystemBattery) && power.BatteryLifePercent >= 0;
        bool? plugged = power.PowerLineStatus == Forms.PowerLineStatus.Unknown ? null : power.PowerLineStatus == Forms.PowerLineStatus.Online;
        View.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new { type = "power", available, percent = available ? power.BatteryLifePercent * 100 : 0, plugged }));
    }

    public void ShowIsland() { PositionAtTop(); Show(); }
    protected override void OnClosing(CancelEventArgs e)
    {
        _powerTimer.Stop();
        if (!_exiting && Application.Current?.Dispatcher.HasShutdownStarted == false) { e.Cancel = true; Hide(); }
        base.OnClosing(e);
    }
}
