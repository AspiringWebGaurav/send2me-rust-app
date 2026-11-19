; ==============================================================================
; Send2Me — NSIS Installer & Uninstaller Customization Hooks
; Developer: Gaurav Patil (https://gauravpatil.site)
; App: https://send2me.eu.cc
; Clean process shutdown using trusted $SYSDIR pathing (zero AV heuristic flags)
; ==============================================================================

!macro NSIS_HOOK_PREINSTALL
  ; Politely close running Send2Me window if open
  FindWindow $0 "" "Send2Me"
  ${If} $0 != 0
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 300
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 1. Request clean polite shutdown via Send2Me window WM_CLOSE
  FindWindow $0 "" "Send2Me"
  ${If} $0 != 0
    SendMessage $0 ${WM_CLOSE} 0 0
    Sleep 300
  ${EndIf}

  ; 2. Silent forced kill fallback to guarantee zero locks or zombie processes
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM send2me.exe /T'
  Sleep 300
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Delete "$INSTDIR\*.old"
  Delete "$INSTDIR\*.staged"
  Delete "$INSTDIR\*.tmp"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 1. Remove all Desktop and Start Menu shortcuts
  Delete "$DESKTOP\Send2Me.lnk"
  Delete "$DESKTOP\send2me.lnk"
  Delete "$SMPROGRAMS\Send2Me.lnk"
  Delete "$SMPROGRAMS\send2me.lnk"
  RMDir /r "$SMPROGRAMS\Send2Me"
  RMDir /r "$SMPROGRAMS\send2me"

  ; 2. Clean registry autostart keys
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Send2Me"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "send2me"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "Send2Me"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "send2me"

  ; 3. Auto-close uninstaller in passive or update mode
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
!macroend
