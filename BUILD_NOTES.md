# Build Notes

The app runtime uses `logo.png` for Electron window icons and UI logo assets.

Electron Builder may require a Windows `.ico` file for executable metadata on some targets or versions. If a Windows build rejects `logo.png` in `build.win.icon`, generate a fresh Windows icon file from `src/assets/logo.png` and `installer/assets/logo.png`, then update the builder-only icon paths to those generated files. Do not restore stale runtime icon references.
