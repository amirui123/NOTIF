#define AppVersion "0.3.0"
[Setup]
AppId={{04A8C797-0DD7-4E71-9046-4EAC5BF33F3F}
AppName=IslandX (experimental preview)
AppVersion={#AppVersion}
AppPublisher=IslandX
DefaultDirName={localappdata}\Programs\IslandX
DefaultGroupName=IslandX
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.19041
OutputDir=..\..\out
OutputBaseFilename=IslandX-Setup-preview-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
AppMutex=Local\IslandX.Windows.Experimental
CloseApplications=yes
UninstallDisplayIcon={app}\IslandX.Windows.exe

[Files]
Source: "..\..\out\IslandX-Windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\IslandX"; Filename: "{app}\IslandX.Windows.exe"

[Run]
Filename: "{app}\IslandX.Windows.exe"; Description: "Launch IslandX"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  RunValue: String;
begin
  if CurUninstallStep = usUninstall then
    if RegQueryStringValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'IslandXExperimental', RunValue) then
      if CompareText(RunValue, '"' + ExpandConstant('{app}\IslandX.Windows.exe') + '"') = 0 then
        RegDeleteValue(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'IslandXExperimental');
end;
