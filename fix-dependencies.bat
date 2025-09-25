@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo    Quick Fix Dependencies
echo ==========================================
echo.

echo Installing complete dependency packages...
npm install

echo.
echo ==========================================
echo Fix completed! Restart the application
echo ==========================================
pause
