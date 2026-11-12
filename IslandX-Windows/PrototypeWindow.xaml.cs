using Microsoft.Web.WebView2.Core;
using System;
using System.ComponentModel;
using System.IO;
using System.Reflection;
using System.Windows;

namespace IslandX.Windows;

public partial class PrototypeWindow : Window
{
    private const string LocalPage = "https://islandx.local/index.html";
    private const string Headers = "Content-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'\r\nX-Content-Type-Options: nosniff\r\n";
    private bool _exiting;
    private readonly bool _smokeTest = Array.Exists(Environment.GetCommandLineArgs(), a => a == "--smoke-test");

    public PrototypeWindow()
    {
        InitializeComponent();
        Loaded += InitializePreview;
        Application.Current.Exit += (_, _) => _exiting = true;
    }

    private async void InitializePreview(object sender, RoutedEventArgs args)
    {
        Loaded -= InitializePreview;
        try
        {
            string profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IslandX", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            await View.EnsureCoreWebView2Async(environment);
            var core = View.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsWebMessageEnabled = false;
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
                    e.Response = content == null
                        ? environment.CreateWebResourceResponse(null, 500, "Missing embedded prototype", "Cache-Control: no-store\r\n")
                        : environment.CreateWebResourceResponse(content, 200, "OK", Headers);
                }
                else e.Response = environment.CreateWebResourceResponse(null, 403, "Blocked", "Cache-Control: no-store\r\n");
            };
            if (_smokeTest)
            {
                await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__islandErrors=[];window.addEventListener('error',e=>window.__islandErrors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__islandErrors.push('rejection')); ");
                core.NavigationCompleted += async (_, e) =>
                {
                    bool ok = false;
                    try
                    {
                        if (e.IsSuccess)
                        {
                            string result = await core.ExecuteScriptAsync("Boolean(document.querySelector('#island') && document.querySelector('#b-notif button') && document.querySelector('#b-ctx button') && typeof textModel === 'function' && typeof show === 'function' && window.__islandErrors && window.__islandErrors.length === 0)");
                            ok = result == "true";
                        }
                    }
                    catch (Exception) { ok = false; }
                    _exiting = true;
                    Application.Current.Shutdown(ok ? 0 : 1);
                };
            }
            core.Navigate(LocalPage);
        }
        catch (Exception ex)
        {
            Failure.Text = "Could not start the prototype. Microsoft Edge WebView2 Runtime is required.\n\n" + ex.Message;
            Failure.Visibility = Visibility.Visible;
            View.Visibility = Visibility.Collapsed;
            if (_smokeTest) { _exiting = true; Application.Current.Shutdown(1); }
        }
    }

    public void ShowPreview() { Show(); if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal; Activate(); }
    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_exiting && Application.Current?.Dispatcher.HasShutdownStarted == false) { e.Cancel = true; Hide(); }
        base.OnClosing(e);
    }
}
