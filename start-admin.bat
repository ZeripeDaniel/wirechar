@echo off
cd /d "%~dp0"
echo Starting WIRECHAR as Administrator...
powershell -Command "Start-Process -FilePath '.\node_modules\.bin\electron.cmd' -ArgumentList '.' -Verb RunAs"
