@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo    Quick Fix for Dependencies
echo ==========================================
echo.

echo Installing core dependencies...
echo This will solve "Cannot find module express" error
echo.

REM Set environment variables to skip problematic downloads
set PUPPETEER_SKIP_DOWNLOAD=true
set npm_config_registry=https://registry.npmmirror.com

echo Installing basic dependencies...
npm install express multer xlsx chart.js fs-extra cors pdf-lib --save

echo.
echo Installing Chart.js server rendering (if possible)...
npm install chartjs-node-canvas --save

echo.
echo Testing installation results...
node -e "try { require('express'); console.log('Express: INSTALLED'); } catch (e) { console.log('Express: MISSING'); process.exit(1); }"

if %errorlevel% equ 0 (
    echo.
    echo Dependencies fixed successfully!
    echo You can now run start.bat to launch the program
) else (
    echo.
    echo Fix failed, possible reasons:
    echo 1. Network connection issue
    echo 2. npm configuration issue
    echo 3. Permission issue
    echo.
    echo Suggestions:
    echo 1. Check network connection
    echo 2. Run this script as administrator
    echo 3. Try running auto-install-windows.bat
)

echo.
pause
