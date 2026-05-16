@echo off
:: Compile build/windivert-helper/main.cpp -> wirechar-divert.exe
:: Requires Visual Studio (or Build Tools) with C++ workload.

setlocal EnableDelayedExpansion

set "ROOT=%~dp0.."
set "HELPER_DIR=%~dp0windivert-helper"
set "WINDIVERT_DIR=%~dp0windivert"
set "OUT_EXE=%HELPER_DIR%\wirechar-divert.exe"

if not exist "%WINDIVERT_DIR%\WinDivert.lib" (
  echo [build-helper] ERROR: WinDivert SDK not found in %WINDIVERT_DIR%
  echo [build-helper]   Run: node build\download-windivert.js
  exit /b 1
)
if not exist "%HELPER_DIR%\main.cpp" (
  echo [build-helper] ERROR: helper source not found
  exit /b 1
)

:: vswhere lives under Program Files (x86) regardless of OS bitness
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" set "VSWHERE=%ProgramFiles%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo [build-helper] vswhere.exe not found. Install Visual Studio Build Tools:
  echo [build-helper]   https://visualstudio.microsoft.com/downloads/
  exit /b 1
)

:: Find a VS install with VC tools (skip preview versions if both present)
set "VSPATH="
for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
  set "VSPATH=%%i"
)
if not defined VSPATH (
  echo [build-helper] No VS install with C++ tools found.
  echo [build-helper] Install "Desktop development with C++" workload via VS Installer.
  exit /b 1
)

set "VCVARS=%VSPATH%\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" (
  echo [build-helper] vcvars64.bat not found under %VSPATH%
  exit /b 1
)

echo [build-helper] Using VS at: %VSPATH%
call "%VCVARS%" >nul 2>&1

echo [build-helper] Compiling...
pushd "%HELPER_DIR%"
cl /nologo /std:c++17 /O2 /EHsc /MT ^
   /I "%WINDIVERT_DIR%\include" ^
   main.cpp ^
   /link /OUT:"%OUT_EXE%" ^
   "%WINDIVERT_DIR%\WinDivert.lib" ^
   ws2_32.lib
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" (
  echo [build-helper] Compilation FAILED rc=%RC%
  exit /b %RC%
)
if not exist "%OUT_EXE%" (
  echo [build-helper] Output not produced: %OUT_EXE%
  exit /b 1
)

for %%S in ("%OUT_EXE%") do set "SIZE=%%~zS"
echo [build-helper] OK -^> %OUT_EXE%  ^(size: %SIZE% bytes^)

endlocal & exit /b 0
