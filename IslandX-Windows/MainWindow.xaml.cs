using Microsoft.Win32;
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace IslandX.Windows;

public partial class MainWindow : Window
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunName = "IslandXExperimental";
    private readonly DispatcherTimer _clock = new() { Interval = TimeSpan.FromSeconds(1) };

    public MainWindow()
    {
        InitializeComponent();
        Loaded += (_, _) => { PositionAtTop(); RefreshStatus(); RefreshStartup(); };
        _clock.Tick += (_, _) => RefreshStatus();
        _clock.Start();
    }

    private void PositionAtTop()
    {
        var work = SystemParameters.WorkArea;
        Left = work.Left + (work.Width - Width) / 2;
        Top = work.Top + 4;
    }

    private void RefreshStatus()
    {
        Clock.Text = DateTime.Now.ToString("HH:mm");
        var power = Forms.SystemInformation.PowerStatus;
        if (power.BatteryChargeStatus.HasFlag(Forms.BatteryChargeStatus.NoSystemBattery) || power.BatteryLifePercent < 0)
            Power.Text = "Battery unavailable";
        else
        {
            var percentage = Math.Clamp((int)Math.Round(power.BatteryLifePercent * 100), 0, 100);
            var connected = power.PowerLineStatus == Forms.PowerLineStatus.Online;
            Power.Text = connected ? $"{percentage}% · plugged in" : $"{percentage}% · battery";
        }
    }

    private void TogglePanel(object sender, RoutedEventArgs e)
    {
        bool expanded = Panel.Visibility != Visibility.Visible;
        Panel.Visibility = expanded ? Visibility.Visible : Visibility.Collapsed;
        Height = expanded ? 285 : 64;
        if (!expanded) ClipboardText.Text = string.Empty;
    }

    private void HideToTray(object sender, RoutedEventArgs e) { ClipboardText.Text = string.Empty; Hide(); }
    public void ShowIsland() { PositionAtTop(); Show(); Activate(); }

    private static string? ExecutablePath()
    {
        var path = Environment.ProcessPath;
        return path != null && Path.GetFileName(path).Equals("IslandX.Windows.exe", StringComparison.OrdinalIgnoreCase) ? path : null;
    }

    private void RefreshStartup()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            string? expected = ExecutablePath();
            Startup.IsChecked = expected != null && string.Equals(key?.GetValue(RunName) as string, $"\"{expected}\"", StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException)
        { Startup.IsEnabled = false; Status.Text = "Startup setting is unavailable."; }
    }

    private void StartupChanged(object sender, RoutedEventArgs e)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (Startup.IsChecked == true)
            {
                string path = ExecutablePath() ?? throw new InvalidOperationException("Startup requires a published executable.");
                key.SetValue(RunName, $"\"{path}\"", RegistryValueKind.String);
                Status.Text = "Startup enabled for this Windows user.";
            }
            else { key.DeleteValue(RunName, false); Status.Text = "Startup disabled."; }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or System.Security.SecurityException or IOException or InvalidOperationException)
        { Status.Text = "Could not change startup: " + ex.Message; RefreshStartup(); }
    }

    private void ReadClipboard(object sender, RoutedEventArgs e)
    {
        try
        {
            string text = Clipboard.ContainsText() ? Clipboard.GetText() : string.Empty;
            ClipboardText.Text = text.Length > 512 ? text[..512] + "…" : text;
            Status.Text = text.Length == 0 ? "No clipboard text." : "Displayed only; not saved. Clear or close this panel to hide it.";
        }
        catch (ExternalException) { ClipboardText.Text = string.Empty; Status.Text = "Clipboard is busy; try again."; }
    }

    private void ClearClipboard(object sender, RoutedEventArgs e) { ClipboardText.Text = string.Empty; Status.Text = string.Empty; }
    protected override void OnClosing(CancelEventArgs e) { _clock.Stop(); base.OnClosing(e); }
}
