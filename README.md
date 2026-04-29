# ESS Server Controller

Electron desktop dashboard for managing ESS VPS services, Git repositories, logs, and app release updates.

## Development

```powershell
npm install
npm start
```

If Electron is launched from a shell that has `ELECTRON_RUN_AS_NODE=1`, clear it first:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm start
```

## Installer System

The installer used for distribution is the custom themed Electron installer in `installer/`.

The root app build creates the Server Manager payload EXE:

```powershell
npm run dist
```

The custom installer build creates the themed installer:

```powershell
npm run installer:build
```

Build both:

```powershell
npm run build:full
```

## Distribution

The final customer-facing file is the custom themed installer:

```text
ESS-Server-Controller-Setup-1.0.0.exe
```

That one EXE contains the Server Manager payload. When opened, it extracts the app files into the user's chosen install folder.

```text
ESS Server Controller.exe
chrome_100_percent.pak
ffmpeg.dll
resources\
logs\
```

The ZIP is only an internal installer resource. Users receive and open one installer EXE.

## External Files

The installed app uses the chosen install folder as its external runtime root, usually:

```text
%LOCALAPPDATA%\Programs\ESS-Multi-Server-Manager
```

Runtime folders live directly inside that root:

```text
scripts\
configs\
data\
logs\
```

Put scripts that should stay outside the app executable in `scripts/` and commit them to GitHub so the custom installer can download them.
