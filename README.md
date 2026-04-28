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

## Build Installer

```powershell
npm run dist
```

The Windows NSIS installer is written to `dist/`:

```
ESS-Server-Controller-Setup-1.0.0.exe
```

## Installer Features

- **Choose install location** — defaults to `%LOCALAPPDATA%\Programs\ESS Server Controller`, fully changeable
- **Desktop shortcut** created automatically
- **Start Menu shortcut** created automatically (`ESS Server Controller`)
- **Uninstaller** registered in Add/Remove Programs
- **App data preserved** on uninstall (`deleteAppDataOnUninstall: false`)
- **Launch on finish** — optional checkbox on the final page
- **Branded UI** — dark navy sidebar, ESS-themed header, custom icons

## Installer Asset Paths

| File | Dimensions | Purpose |
|------|-----------|---------|
| `src/assets/icon.ico` | 256×256 multi-res | App icon, installer + uninstaller icon |
| `src/assets/installer-sidebar.bmp` | 164×314 | Welcome/Finish page left sidebar (blue accent) |
| `src/assets/installer-header.bmp` | 150×57 | Inner-page header strip |
| `src/assets/uninstaller-sidebar.bmp` | 164×314 | Uninstaller sidebar (red accent) |

Replace any of these with final artwork. Keep BMP format — NSIS requires it.

## Custom NSIS Script

`build/installer.nsh` customises installer copy text (page titles, welcome/finish wording, registry entries). Edit it to update on-screen messaging without touching `package.json`.

## Release Update Process

The app checks GitHub Releases from:

```
https://github.com/Andrew79750/Multi-Server-Server-Controller
```

To publish an update:

1. Bump `version` in `package.json`.
2. Run `npm install` if dependencies changed.
3. Build with `npm run dist`.
4. Create a GitHub release tagged `vX.X.X`.
5. Upload the installer from `dist/`.
6. Add release notes to the GitHub release body.

Installed apps detect the new release on startup or via **Settings → About & Updates**.
