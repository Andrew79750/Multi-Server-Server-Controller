; ESS Server Controller — Custom NSIS Installer Script

; Welcome page — must define text then insert the page
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to ESS Server Controller"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ESS Server Controller.$\r$\n$\r$\nESS Server Controller is a Windows VPS Management Dashboard for managing game servers, monitoring system stats, and deploying Git-powered updates.$\r$\n$\r$\nClick Next to choose your installation folder and continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Finish page — must define run function, set MUI_FINISHPAGE_RUN, then insert the page
!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Installation Complete"
  !define MUI_FINISHPAGE_TEXT "ESS Server Controller has been installed successfully.$\r$\n$\r$\nA Desktop shortcut and Start Menu entry have been created.$\r$\n$\r$\nClick Finish to close this wizard."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch ESS Server Controller"

  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; Write registry keys after install
!macro customInstall
  WriteRegStr HKCU "Software\ESS\ServerController" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\ESS\ServerController" "Version"    "${VERSION}"
!macroend

; Clean up registry on uninstall
!macro customUnInstall
  DeleteRegKey HKCU "Software\ESS\ServerController"
!macroend
