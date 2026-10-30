Unicode true
!include "MUI2.nsh"

!define APP_NAME "biu"
!define APP_VERSION "1.7.0"
!define APP_EXE "biu.exe"
!define APP_DIR "release/win-unpacked"

Name "${APP_NAME}"
OutFile "release/biu-Setup-1.7.0-x64.exe"
InstallDir "$LOCALAPPDATA\Programs\biu"
InstallDirRegKey HKCU "Software\biu" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
BrandingText "biu"

VIProductVersion "1.7.0.0"
VIAddVersionKey "ProductName" "biu"
VIAddVersionKey "FileDescription" "biu Music Player"
VIAddVersionKey "FileVersion" "1.7.0"
VIAddVersionKey "ProductVersion" "1.7.0"
VIAddVersionKey "CompanyName" "Hanversion"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Hanversion"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "运行 biu"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Section "biu" SecMain
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall biu.exe"
  WriteRegStr HKCU "Software\biu" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu" "DisplayName" "biu"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu" "Publisher" "Hanversion"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu" "UninstallString" '"$INSTDIR\Uninstall biu.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu" "NoRepair" 1
  CreateShortcut "$DESKTOP\biu.lnk" "$INSTDIR\${APP_EXE}"
  CreateDirectory "$SMPROGRAMS\biu"
  CreateShortcut "$SMPROGRAMS\biu\biu.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\biu\Uninstall biu.lnk" "$INSTDIR\Uninstall biu.exe"
  SetOutPath "$INSTDIR"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\biu.lnk"
  Delete "$SMPROGRAMS\biu\biu.lnk"
  Delete "$SMPROGRAMS\biu\Uninstall biu.lnk"
  RMDir "$SMPROGRAMS\biu"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\biu"
  DeleteRegKey HKCU "Software\biu"
  RMDir /r "$INSTDIR"
SectionEnd
