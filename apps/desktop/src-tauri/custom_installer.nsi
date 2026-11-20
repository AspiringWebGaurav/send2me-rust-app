Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

CRCCheck force
!if "lzma" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "lzma"
!endif

; Keep above !include to stay ahead of any plugin command
; see https://github.com/tauri-apps/tauri/pull/15422#discussion_r3289239624
!addplugindir ".\Plugins\x86-unicode"

!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define UNINSTALLERICON "{{uninstaller_icon}}"
!define UNINSTALLERHEADERIMAGE "{{uninstaller_header_image}}"

; Installer & Uninstaller Icons (Must be set BEFORE MUI2.nsh and before any Page command)
!if "${INSTALLERICON}" != ""
  Icon "${INSTALLERICON}"
  !define MUI_ICON "${INSTALLERICON}"
!endif

!if "${UNINSTALLERICON}" != ""
  UninstallIcon "${UNINSTALLERICON}"
  !define MUI_UNICON "${UNINSTALLERICON}"
!else if "${INSTALLERICON}" != ""
  UninstallIcon "${INSTALLERICON}"
  !define MUI_UNICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Enable header images for installer and uninstaller pages when either image is configured.
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP "${HEADERIMAGE}"
!else if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
!endif

; Uninstaller header image
!if "${UNINSTALLERHEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_UNBITMAP "${UNINSTALLERHEADERIMAGE}"
!else if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE_UNBITMAP "${HEADERIMAGE}"
!endif

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{else}}
!include "hooks.nsh"
{{/if}}
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "StrFunc.nsh"
${StrCase}
${StrLoc}


!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "Gaurav Patil"
!define PRODUCTNAME "Send2Me"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "https://send2me.eu.cc"
!define INSTALLMODE "currentUser"
!define LICENSE "{{license}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "com.send2me.app"
!define COPYRIGHT "Copyright 2026 Gaurav Patil"
!define OUTFILE "nsis-output.exe"
!define ARCH "x64"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "true"
!define DISPLAYLANGUAGESELECTOR "false"
!define INSTALLWEBVIEW2MODE "downloadBootstrapper"
!define WEBVIEW2INSTALLERARGS "/silent"
!define WEBVIEW2BOOTSTRAPPERPATH ""
!define WEBVIEW2INSTALLERPATH ""
!define MINIMUMWEBVIEW2VERSION ""
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND ""
!define ESTIMATEDSIZE "23858"
!define STARTMENUFOLDER ""

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var OldMainBinaryName

; Custom consent state — collected during install, persisted so uninstall can react
Var ConsentDialog
Var ConsentCheckboxTerms
Var ConsentCheckboxTelemetry
Var ConsentCheckboxSelectAll
Var ConsentTermsAccepted
Var ConsentTelemetryOptIn

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "Comments" "Localized high-speed peer-to-peer file transfer and folder sync by Gaurav Patil. Visit https://send2me.eu.cc"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!else if "${INSTALLMODE}" == "perMachine"
  !define SHCTX HKLM
!else
  !define SHCTX HKCU
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Installer pages, must be ordered as they appear
; 1. Welcome Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_WELCOME

; 2. Consent & Acceptance Page
Page custom ConsentPageShow ConsentPageLeave

Function ConsentPageShow
  ; Skip in passive/silent install: the /P flag implies pre-authorized deployment
  ${If} $PassiveMode = 1
    ; Auto-accept terms silently; leave telemetry opt-in off by default
    StrCpy $ConsentTermsAccepted "1"
    StrCpy $ConsentTelemetryOptIn "0"
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "Welcome to Send2Me (send2me.eu.cc)" "Developed by Gaurav Patil. Please review our data and liability terms."

  nsDialogs::Create 1018
  Pop $ConsentDialog
  ${If} $ConsentDialog == error
    Abort
  ${EndIf}
  ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  CreateFont $2 "Segoe UI" 9
  CreateFont $3 "Segoe UI" 9 600

  ; Symmetric intro label
  ${NSD_CreateLabel} 8u 2u 284u 14u "Send2Me transfers files directly peer-to-peer. Please acknowledge before setup:"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $2 1

  ; Symmetric clean bullet points (Concise, simple words)
  ${NSD_CreateLabel} 8u 18u 284u 34u "• Direct P2P: Files transfer device-to-device with zero cloud storage.$\r$\n• 100% Private: Transfers and pairing codes stay strictly on your device.$\r$\n• Local First: Full transfer speed across your local Wi-Fi network."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $2 1

  ; Single-line symmetric Checkbox 1 (Required) - CHECKED BY DEFAULT
  ${NSD_CreateCheckbox} 8u 56u 284u 14u "I accept the terms of use and liability (Required)"
  Pop $ConsentCheckboxTerms
  SendMessage $ConsentCheckboxTerms ${WM_SETFONT} $3 1
  ${NSD_SetState} $ConsentCheckboxTerms ${BST_CHECKED}
  ${NSD_OnClick} $ConsentCheckboxTerms ConsentCheckboxTermsClick

  ; Single-line symmetric Checkbox 2 (Optional)
  ${NSD_CreateCheckbox} 8u 72u 284u 14u "Allow anonymous crash reports to help improve Send2Me (Optional)"
  Pop $ConsentCheckboxTelemetry
  SendMessage $ConsentCheckboxTelemetry ${WM_SETFONT} $2 1
  ${NSD_SetState} $ConsentCheckboxTelemetry ${BST_UNCHECKED}
  ${NSD_OnClick} $ConsentCheckboxTelemetry ConsentCheckboxTelemetryClick

  ; Single-line symmetric Checkbox 3 (Select all)
  ${NSD_CreateCheckbox} 8u 88u 284u 14u "Select all options"
  Pop $ConsentCheckboxSelectAll
  SendMessage $ConsentCheckboxSelectAll ${WM_SETFONT} $3 1
  ${NSD_SetState} $ConsentCheckboxSelectAll ${BST_UNCHECKED}
  ${NSD_OnClick} $ConsentCheckboxSelectAll ConsentCheckboxSelectAllClick

  ; Symmetric clean link at bottom
  ${NSD_CreateLink} 8u 108u 284u 12u "Terms: send2me.eu.cc/terms  •  Developer: gauravpatil.site"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $2 1
  ${NSD_OnClick} $0 ConsentLinkClick

  ; Enable Next button initially since terms are checked by default
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 1

  nsDialogs::Show
FunctionEnd

Function ConsentLinkClick
  Pop $0
  ExecShell "open" "https://send2me.eu.cc/terms"
FunctionEnd

Function ConsentCheckboxTermsClick
  Pop $0
  Call ConsentSyncUI
FunctionEnd

Function ConsentCheckboxTelemetryClick
  Pop $0
  Call ConsentSyncUI
FunctionEnd

Function ConsentCheckboxSelectAllClick
  Pop $0
  ${NSD_GetState} $ConsentCheckboxSelectAll $0
  ${If} $0 == ${BST_CHECKED}
    ${NSD_SetState} $ConsentCheckboxTerms ${BST_CHECKED}
    ${NSD_SetState} $ConsentCheckboxTelemetry ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $ConsentCheckboxTerms ${BST_UNCHECKED}
    ${NSD_SetState} $ConsentCheckboxTelemetry ${BST_UNCHECKED}
  ${EndIf}
  Call ConsentSyncUI
FunctionEnd

Function ConsentSyncUI
  ${NSD_GetState} $ConsentCheckboxTerms $1
  ${NSD_GetState} $ConsentCheckboxTelemetry $2

  ; Enable Next button only if required terms are checked
  GetDlgItem $0 $HWNDPARENT 1
  ${If} $1 == ${BST_CHECKED}
    EnableWindow $0 1
  ${Else}
    EnableWindow $0 0
  ${EndIf}

  ; Keep "Select all" in sync
  ${If} $1 == ${BST_CHECKED}
  ${AndIf} $2 == ${BST_CHECKED}
    ${NSD_SetState} $ConsentCheckboxSelectAll ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $ConsentCheckboxSelectAll ${BST_UNCHECKED}
  ${EndIf}
FunctionEnd

Function ConsentPageLeave
  ${NSD_GetState} $ConsentCheckboxTerms $0
  ${NSD_GetState} $ConsentCheckboxTelemetry $1

  ${If} $0 <> ${BST_CHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_OK "You must accept the terms and liability notice to install ${PRODUCTNAME}."
    Abort
  ${EndIf}

  StrCpy $ConsentTermsAccepted "1"
  ${If} $1 == ${BST_CHECKED}
    StrCpy $ConsentTelemetryOptIn "1"
  ${Else}
    StrCpy $ConsentTelemetryOptIn "0"
  ${EndIf}
FunctionEnd

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif

; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installation was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall
Function PageReinstall
  ; Uninstall previous WiX installation if exists.
  ;
  ; A WiX installer stores the installation info in registry
  ; using a UUID and so we have to loop through all keys under
  ; `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
  ; and check if `DisplayName` and `Publisher` keys match ${PRODUCTNAME} and ${MANUFACTURER}
  ;
  ; This has a potential issue that there maybe another installation that matches
  ; our ${PRODUCTNAME} and ${MANUFACTURER} but wasn't installed by our WiX installer,
  ; however, this should be fine since the user will have to confirm the uninstallation
  ; and they can chose to abort it if doesn't make sense.
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_loop_done ; Exit loop if there is no more keys to loop on
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_loop_done
    StrCpy $WixMode 1
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
    Goto compare_version
  wix_loop_done:

  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  ; Compare this installar version with the existing installation
  ; and modify the messages presented to the user accordingly
  compare_version:
  StrCpy $R4 "$(older)"
  ${If} $WixMode = 1
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "$(unknown)" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0
  ; Reinstalling the same version
  ${If} $R0 = 0
    StrCpy $R1 "$(alreadyInstalledLong)"
    StrCpy $R2 "$(addOrReinstall)"
    StrCpy $R3 "$(uninstallApp)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(chooseMaintenanceOption)"
  ; Upgrading
  ${ElseIf} $R0 = 1
    StrCpy $R1 "$(olderOrUnknownVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    StrCpy $R3 "$(dontUninstall)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ; Downgrading
  ${ElseIf} $R0 = -1
    StrCpy $R1 "$(newerVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "$(dontUninstall)"
    !else
      StrCpy $R3 "$(dontUninstallDowngrade)"
    !endif
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ${Else}
    Abort
  ${EndIf}

  ; Skip showing the page if passive
  ;
  ; Note that we don't call this earlier at the begining
  ; of this function because we need to populate some variables
  ; related to current installed version if detected and whether
  ; we are downgrading or not.
  ${If} $PassiveMode = 1
    Call PageLeaveReinstall
  ${Else}
    nsDialogs::Create 1018
    Pop $R4
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

    ${NSD_CreateLabel} 0 0 100% 24u $R1
    Pop $R1

    ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
    Pop $R2
    ${NSD_OnClick} $R2 PageReinstallUpdateSelection

    ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
    Pop $R3
    ; Disable this radio button if downgrading and downgrades are disabled
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $R0 = -1 ${|} EnableWindow $R3 0 ${|}
    !endif
    ${NSD_OnClick} $R3 PageReinstallUpdateSelection

    ; Check the first radio button if this the first time
    ; we enter this page or if the second button wasn't
    ; selected the last time we were on this page
    ${If} $ReinstallPageCheck <> 2
      SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
      SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}

    ${NSD_SetFocus} $R2
    nsDialogs::Show
  ${EndIf}
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ; If migrating from Wix, always uninstall
  ${If} $WixMode = 1
    Goto reinst_uninstall
  ${EndIf}

  ; In update mode, always proceeds without uninstalling
  ${If} $UpdateMode = 1
    Goto reinst_done
  ${EndIf}

  ; $R0 holds whether same(0)/upgrading(1)/downgrading(-1) version
  ; $R1 holds the radio buttons state:
  ;   1 => first choice was selected
  ;   0 => second choice was selected
  ${If} $R0 = 0 ; Same version, proceed
    ${If} $R1 = 1              ; User chose to add/reinstall
      Goto reinst_done
    ${Else}                    ; User chose to uninstall
      Goto reinst_uninstall
    ${EndIf}
  ${ElseIf} $R0 = 1 ; Upgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${ElseIf} $R0 = -1 ; Downgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${EndIf}

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $WixMode = 1
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ${IfThen} $UpdateMode = 1 ${|} StrCpy $R1 "$R1 /UPDATE" ${|} ; append /UPDATE
      ${IfThen} $PassiveMode = 1 ${|} StrCpy $R1 "$R1 /P" ${|} ; append /P
      StrCpy $R1 "$R1 _?=$4" ; append uninstall directory
      ExecWait '$R1' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ; User cancelled wix uninstaller? return to select un/reinstall page
      ${If} $WixMode = 1
      ${AndIf} $0 = 1602
        Abort
      ${EndIf}

      ; User cancelled NSIS uninstaller? return to select un/reinstall page
      ${If} $0 = 1
        Abort
      ${EndIf}

      ; Other erros? show generic error message and return to select un/reinstall page
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${EndIf}
  reinst_done:
FunctionEnd

; 3. Choose install directory page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_DIRECTORY

; 4. Installation page (auto-closes on completion, never stuck on Next/Finish)
!insertmacro MUI_PAGE_INSTFILES

; Uninstaller Pages
; 1. Confirm uninstall page
Var UninstOptionRadio1
Var UninstOptionRadio2
Var UninstOptionRadio3
Var UninstOptionState

Function un.MyCustomPage
  ; Default to Normal so $UninstOptionState is always initialised
  StrCpy $UninstOptionState 1

  ; Skip custom page in passive/update mode
  ${If} $PassiveMode = 1
    Abort
  ${EndIf}
  ${If} $UpdateMode = 1
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

  !insertmacro MUI_HEADER_TEXT "Uninstall ${PRODUCTNAME}" "We're sorry to see you go! Choose how to handle your local data."

  ${NSD_CreateLabel} 0 0 100% 24u "Please select a removal option. Remember, Send2Me is fully local, meaning your files and history are only stored on this device."
  Pop $0

  ${NSD_CreateRadioButton} 10u 30u 90% 24u "Option 1: Keep My Data (Normal)$\r$\nRemoves the app, but keeps your history, settings, and identity."
  Pop $UninstOptionRadio1
  ${NSD_Check} $UninstOptionRadio1

  ${NSD_CreateRadioButton} 10u 60u 90% 24u "Option 2: Delete App & Data$\r$\nRemoves the app and all local transfer history (%APPDATA%\send2me)."
  Pop $UninstOptionRadio2

  ${NSD_CreateRadioButton} 10u 90u 90% 24u "Option 3: Total Wipe (Irreversible)$\r$\nRemoves everything, including your cryptographic identity and registry keys."
  Pop $UninstOptionRadio3

  nsDialogs::Show
FunctionEnd

Function un.MyCustomPageLeave
  ; Read radio state and update $UninstOptionState
  ${NSD_GetState} $UninstOptionRadio1 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UninstOptionState 1
  ${EndIf}
  ${NSD_GetState} $UninstOptionRadio2 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UninstOptionState 2
  ${EndIf}
  ${NSD_GetState} $UninstOptionRadio3 $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $UninstOptionState 3
    ; Require explicit confirmation before Total Wipe proceeds
    MessageBox MB_ICONEXCLAMATION|MB_YESNO|MB_DEFBUTTON2 \
      "WARNING: Irreversible Action!$\r$\n$\r$\nTotal Wipe will permanently delete:$\r$\n• Your cryptographic identity key$\r$\n• All trusted devices$\r$\n• Complete transfer history$\r$\n• Application settings$\r$\n$\r$\nAre you absolutely sure you want to proceed?" \
      IDYES total_wipe_confirmed
    ; User said No — revert to Normal and stay on the page
    StrCpy $UninstOptionState 1
    ${NSD_Check} $UninstOptionRadio1
    ${NSD_Uncheck} $UninstOptionRadio3
    Abort
    total_wipe_confirmed:
  ${EndIf}
FunctionEnd

UninstPage custom un.MyCustomPage un.MyCustomPageLeave

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES



;Languages
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_RESERVEFILE_LANGDLL
  !include ".\English.nsh"

Function .onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\${PRODUCTNAME}"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif
FunctionEnd


Section EarlyChecks
  ; Abort silent installer if downgrades is disabled
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
    ; If downgrading
    ${If} $R0 = -1
      System::Call 'kernel32::AttachConsole(i -1)i.r0'
      ${If} $0 <> 0
        System::Call 'kernel32::GetStdHandle(i -11)i.r0'
        System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
        FileWrite $0 "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif

SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        DetailPrint "$(webview2Downloading)"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          DetailPrint "$(webview2DownloadSuccess)"
        ${Else}
          DetailPrint "$(webview2DownloadError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        Goto install_webview2
      !endif

      Goto webview2_done

      install_webview2:
        DetailPrint "$(installingWebview2)"
        ; $6 holds the path to the webview2 installer
        ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
        ${If} $1 = 0
          DetailPrint "$(webview2InstallSuccess)"
        ${Else}
          DetailPrint "$(webview2InstallError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
      webview2_done:
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Create Developer Info file dynamically
  FileOpen $0 "$INSTDIR\developer_info.txt" w
  FileWrite $0 "Developer: Gaurav Patil$\r$\n"
  FileWrite $0 "Portfolio: https://gauravpatil.site$\r$\n"
  FileWrite $0 "App: Send2Me$\r$\n"
  FileWrite $0 "Domain: https://send2me.eu.cc$\r$\n"
  FileClose $0

  ; Write License dynamically
  FileOpen $0 "$INSTDIR\LICENSE_AGREEMENT.txt" w
  FileWrite $0 "SEND2ME END USER LICENSE AGREEMENT$\r$\n"
  FileWrite $0 "Developer: Gaurav Patil$\r$\n"
  FileWrite $0 "Domain: https://send2me.eu.cc$\r$\n$\r$\n"
  FileWrite $0 "By installing this software, you agree to the following terms:$\r$\n"
  FileWrite $0 "1. You assume 100% legal responsibility for the files you transfer.$\r$\n"
  FileWrite $0 "2. No cloud storage is provided; data is exclusively local and peer-to-peer.$\r$\n"
  FileWrite $0 "3. TAMPERING CLAUSE: Modifying, reverse-engineering, or tampering with the binaries or installation files will immediately revoke your license to use this software. If tampering is detected, the license is null and void.$\r$\n"
  FileClose $0

  ; Write Security Notice
  FileOpen $0 "$INSTDIR\SECURITY_NOTICE.txt" w
  FileWrite $0 "SECURITY & TAMPERING WARNING$\r$\n$\r$\n"
  FileWrite $0 "This software is digitally protected. Any unauthorized modification to the executable files, installation files, or cryptographic identity files is strictly prohibited.$\r$\n$\r$\n"
  FileWrite $0 "Tampering will result in the immediate revocation of the software license.$\r$\n"
  FileClose $0

  ; Copy resources

  ; Copy external binaries

  ; Create file associations

  ; Register deep links

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  ; Purge any obsolete/duplicate bundle-ID uninstall keys
  DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.send2me.app"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.send2me.app"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.send2me.app"

  ; Persist consent choices so the app and uninstaller can read them
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "ConsentTermsAccepted" $ConsentTermsAccepted
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "ConsentTelemetryOptIn" $ConsentTelemetryOptIn

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  ; Create Start Menu Shortcuts
  CreateDirectory "$SMPROGRAMS\${PRODUCTNAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 "" "" "${PRODUCTNAME}"
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 "" "" "${PRODUCTNAME}"
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"

  ; Create Desktop Shortcut Unconditionally
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 "" "" "${PRODUCTNAME}"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"

  ; Register Windows startup auto-start (by default ON, matching CP, Downex, ScheduleMe)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" '"$INSTDIR\${MAINBINARYNAME}.exe" --autostart'

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ; Always auto-close installation page on completion (frictionless zero-click finish, matching CP & Downex)
  SetAutoClose true
SectionEnd

Function .onInstSuccess
  ; Automatically launch Send2Me in clean detached mode (zero-click finish, never stuck on Next/Finish)
  ${If} $UpdateMode <> 1
    nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
  ${EndIf}
FunctionEnd

Function un.onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Section Uninstall
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Delete the app directory and its content from disk
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"
  Delete "$INSTDIR\developer_info.txt"
  Delete "$INSTDIR\crash_reporter.bat"
  Delete "$INSTDIR\LICENSE_AGREEMENT.txt"
  Delete "$INSTDIR\SECURITY_NOTICE.txt"

  ; Delete resources

  ; Delete external binaries

  ; Delete app associations

  ; Delete deep links


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  ; Clean up Firewall rules
  DetailPrint "Removing Firewall Exception..."
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Send2Me (In)"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Send2Me (Out)"'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Send2Me"'

  RMDir "$INSTDIR"

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcuts
    !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
    RMDir "$SMPROGRAMS\${PRODUCTNAME}"
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Send2Me"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Send2Me"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.send2me.app"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.send2me.app"
  DeleteRegKey HKCU "Software\Send2Me"

  ${If} ${RunningX64}
    SetRegView 32
    DeleteRegKey HKCU "${UNINSTKEY}"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Send2Me"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.send2me.app"
    SetRegView 64
  ${EndIf}

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  ; Logic for Delete Data (2) and Total Wipe (3)
  ; Real data directory: %APPDATA%\Roaming\send2me  (dirs::config_dir() + "send2me")
  ; NOT %APPDATA%\com.send2me.app — that path is never written by the app.
  ${If} $UninstOptionState >= 2
  ${AndIf} $UpdateMode <> 1
    ; Clear the install location and consent values from registry
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"

    ; Clear the install language from registry
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    SetShellVarContext current
    ; Remove the actual app data folder used by all Rust crates (settings, history, trusted_devices, identity.key)
    RmDir /r "$APPDATA\send2me"
    ; Also remove any suffix-variant dirs created during development/testing
    RmDir /r "$APPDATA\send2me-dev"
  ${EndIf}

  ; Logic for Total Wipe (3)
  ${If} $UninstOptionState == 3
  ${AndIf} $UpdateMode <> 1
    ; Remove all manufacturer registry keys
    DeleteRegKey HKCU "Software\${MANUFACTURER}"
    DeleteRegKey HKLM "Software\${MANUFACTURER}"
    ; Remove any Tauri WebView2 user-data cache the app may have created
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
    RmDir /r "$APPDATA\${BUNDLEID}"
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; Launch official uninstalled page in default browser
  ${If} $UpdateMode <> 1
    ExecShell "open" "https://send2me.eu.cc/uninstalled"
  ${EndIf}

  ; Auto-close uninstaller upon completion (frictionless zero-click finish, never stuck on Next/Close)
  SetAutoClose true
SectionEnd

Function un.onUninstSuccess
  ; Silent, clean completion - zero browser spam
FunctionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd
Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  CreateDirectory "$SMPROGRAMS\${PRODUCTNAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 "" "" "${PRODUCTNAME}"
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}\${PRODUCTNAME}.lnk"
  CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 "" "" "${PRODUCTNAME}"
  !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd
