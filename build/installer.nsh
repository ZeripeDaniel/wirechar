; ─────────────────────────────────────────────────────────────────────────────
; wirechar — custom NSIS hooks
;
;   customInit       : check Wireshark; run bundled installer if missing
;   customInstall    : register WinDivert kernel driver service
;   customUnInstall  : stop + delete WinDivert service, clean up
; ─────────────────────────────────────────────────────────────────────────────

; ──────────────────────────────────────────────────────────────────────────
; 1) Pre-install: Wireshark check + bundled install
; ──────────────────────────────────────────────────────────────────────────
!macro customInit
  StrCpy $0 "0"
  IfFileExists "$PROGRAMFILES64\Wireshark\tshark.exe" wsFound 0
  IfFileExists "$PROGRAMFILES\Wireshark\tshark.exe"   wsFound 0
  IfFileExists "$PROGRAMFILES32\Wireshark\tshark.exe" wsFound 0
  Goto wsMissing

  wsFound:
    DetailPrint "Wireshark/tshark already installed — skipping bundled Wireshark setup."
    Goto wsDone

  wsMissing:
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Wireshark is required for wirechar to capture network traffic.$\r$\n$\r$\n\
The bundled Wireshark installer will now launch. Make sure 'Install Npcap' is checked.$\r$\n$\r$\n\
Continue?" \
      IDYES wsRunInstaller IDNO wsSkip

  wsRunInstaller:
    DetailPrint "Launching bundled Wireshark installer…"
    SetOutPath "$PLUGINSDIR"
    File "/oname=Wireshark-x64.exe" "${BUILD_RESOURCES_DIR}\wireshark\Wireshark-x64.exe"
    ExecWait '"$PLUGINSDIR\Wireshark-x64.exe"' $0
    DetailPrint "Wireshark installer exit code: $0"

    IfFileExists "$PROGRAMFILES64\Wireshark\tshark.exe" wsDone 0
    IfFileExists "$PROGRAMFILES\Wireshark\tshark.exe"   wsDone 0
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Wireshark was not detected after installation.$\r$\n\
You can still proceed with wirechar, but packet capture will not work until Wireshark is installed."
    Goto wsDone

  wsSkip:
    MessageBox MB_OK|MB_ICONINFORMATION \
      "Wireshark setup skipped.$\r$\n\
wirechar will install, but packet capture will not work until Wireshark is installed manually from wireshark.org."
    Goto wsDone

  wsDone:
!macroend

; ──────────────────────────────────────────────────────────────────────────
; 2) Post-install: register the WinDivert driver service (real-time IP drop)
; ──────────────────────────────────────────────────────────────────────────
!macro customInstall
  ; WinDivert.sys is shipped in resources/windivert/WinDivert64.sys (via extraResources).
  ; The user-mode WinDivert.dll opens the driver via service-control, which
  ; creates the service on first use. We pre-register so the driver is ready
  ; immediately and the path doesn't depend on the app's working directory.

  IfFileExists "$INSTDIR\resources\windivert\WinDivert64.sys" wdInstall wdSkip

  wdInstall:
    DetailPrint "Registering WinDivert kernel driver…"

    ; Stop + delete any prior WinDivert service (old wirechar install or other app)
    nsExec::ExecToLog 'sc.exe stop WinDivert'
    Pop $0
    nsExec::ExecToLog 'sc.exe delete WinDivert'
    Pop $0

    ; Create service pointing at our bundled .sys
    nsExec::ExecToLog 'sc.exe create WinDivert type= kernel start= demand binPath= "$INSTDIR\resources\windivert\WinDivert64.sys" DisplayName= "WinDivert Packet Diversion (wirechar)"'
    Pop $0
    DetailPrint "sc create WinDivert -> $0"

    ${If} $0 != 0
      DetailPrint "Note: WinDivert service registration returned $0 (already exists or no admin)."
    ${EndIf}
    Goto wdDone

  wdSkip:
    DetailPrint "WinDivert64.sys not bundled — skipping driver registration."
    Goto wdDone

  wdDone:
!macroend

; ──────────────────────────────────────────────────────────────────────────
; 3) Uninstall: stop + delete the WinDivert service so the .sys isn't pinned
;
; IMPORTANT: electron-builder runs the previous uninstaller silently (/S) at
; the start of an UPGRADE install. We must NOT wipe blocked-IP firewall rules
; on upgrade — only on a real uninstall (user removed it from Add/Remove).
; `IfSilent` is true under both /S and the upgrade flow, so cleanup only runs
; when the user actively launched the uninstaller (non-silent).
; ──────────────────────────────────────────────────────────────────────────
!macro customUnInstall
  IfSilent skipCleanup doCleanup

  doCleanup:
    DetailPrint "Cleaning up WinDivert driver service…"
    nsExec::ExecToLog 'sc.exe stop WinDivert'
    Pop $0
    nsExec::ExecToLog 'sc.exe delete WinDivert'
    Pop $0

    ; Also remove any wirechar firewall rules left behind by Auto-Block mode
    DetailPrint "Cleaning up wirechar firewall rules…"
    nsExec::ExecToLog 'cmd /c for /f "tokens=*" %%R in (^"netsh advfirewall firewall show rule name=all ^| findstr Wirechar-Block-^") do @netsh advfirewall firewall delete rule name=%%R'
    Pop $0
    Goto cleanupDone

  skipCleanup:
    DetailPrint "Silent uninstall detected (upgrade) — preserving firewall rules + WinDivert service."

  cleanupDone:
!macroend
