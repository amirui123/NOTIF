using System;
using System.Threading;
using System.Windows;
using Forms = System.Windows.Forms;

namespace IslandX.Windows;

public partial class App : Application
{
    private Mutex? _instance;
    private bool _ownsMutex;
    private Forms.NotifyIcon? _tray;
    private MainWindow? _window;
    private PrototypeWindow? _prototype;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _instance = new Mutex(true, @"Local\IslandX.Windows.Experimental", out _ownsMutex);
        if (!_ownsMutex) { Shutdown(); return; }

        _window = new MainWindow();
        _prototype = new PrototypeWindow();
        MainWindow = _prototype;
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("Show prototype", null, (_, _) => _prototype.ShowPreview());
        menu.Items.Add("Show experimental native status", null, (_, _) => _window.ShowIsland());
        menu.Items.Add("Exit", null, (_, _) => Shutdown());
        _tray = new Forms.NotifyIcon
        {
            Text = "IslandX (experimental)",
            Icon = System.Drawing.SystemIcons.Application,
            ContextMenuStrip = menu,
            Visible = true
        };
        _tray.DoubleClick += (_, _) => _prototype.ShowPreview();
        _prototype.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (_tray != null) { _tray.Visible = false; _tray.ContextMenuStrip?.Dispose(); _tray.Dispose(); }
        if (_ownsMutex) _instance?.ReleaseMutex();
        _instance?.Dispose();
        base.OnExit(e);
    }
}
