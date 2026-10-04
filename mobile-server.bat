@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\facsimile.exe" (
  echo Facsimile is not installed in this folder.
  echo Run install.bat first.
  pause
  exit /b 1
)

echo.
echo ============================================
echo      FACSIMILE MOBILE API SERVER
echo ============================================
echo.
echo The API will listen on this PC's network interfaces on port 8765.
echo In the Android app, set Server URL to:
echo.
echo   http://YOUR-PC-LAN-IP:8765
echo.
echo Example: http://192.168.1.50:8765
echo.
echo Windows Firewall may ask for permission. Allow Private networks.
echo Press Ctrl+C to stop the server.
echo.

".venv\Scripts\facsimile.exe" --host 0.0.0.0 --port 8765 --no-browser
