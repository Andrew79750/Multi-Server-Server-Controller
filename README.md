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

The Windows NSIS installer is written to `dist` with a name like:

```text
ESS-Server-Controller-Setup-1.0.0.exe
```

The installer is configured to:

- Install the app locally through NSIS.
- Create a Desktop shortcut.
- Create a Start Menu shortcut.
- Add an uninstaller.
- Run the installed app after setup.
- Preserve `%APPDATA%\ESS Server Controller` on uninstall.

## Installer Branding Assets

The installer uses:

- `src/assets/icon.ico`
- `src/assets/installer-sidebar.bmp`
- `src/assets/installer-header.bmp`

Replace these files with final branded artwork when desired. Keep the sidebar/header as BMP files for NSIS compatibility.

## Release Update Process

The app checks GitHub Releases from:

```text
https://github.com/Andrew79750/Multi-Server-Server-Controller
```

To publish an update:

1. Change `version` in `package.json`.
2. Run `npm install` if dependencies changed.
3. Build with `npm run dist`.
4. Create a GitHub release with tag `vX.X.X`.
5. Upload the generated installer from `dist`.
6. Put update notes in the GitHub release body.
7. Installed apps will detect the release on startup or from Settings > About & Updates.

The updater compares `package.json` / installed app version against the latest GitHub release tag. Tags can be `v1.0.1` or `1.0.1`.
