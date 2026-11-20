@echo off
rem TDE Clip - instalator dla Windows. Dwuklik.
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install-windows.ps1"
echo.
pause
