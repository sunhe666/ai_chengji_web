@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Startup Diagnostic Test
echo =====================

echo Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js not installed
    pause
    exit /b 1
) else (
    echo Node.js is installed
)

echo Checking dependencies...
node -e "try { require('express'); console.log('Express: OK'); } catch (e) { console.log('Express: MISSING'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo Dependencies missing, auto-installing...
    echo.
    set PUPPETEER_SKIP_DOWNLOAD=true
    npm install express multer xlsx chart.js fs-extra cors --save
    
    echo.
    echo Rechecking dependencies...
    node -e "try { require('express'); console.log('Express: NOW OK'); } catch (e) { console.log('Installation: FAILED'); process.exit(1); }"
    if %errorlevel% neq 0 (
        echo Dependency installation failed, please check network
        echo Or manually run: auto-install-windows.bat
        pause
        exit /b 1
    )
)

echo Checking files...
if not exist "public\index.html" (
    echo public\index.html does not exist
) else (
    echo public\index.html exists
)

if not exist "server.js" (
    echo server.js does not exist
) else (
    echo server.js exists
)

echo.
echo Starting server...
echo Please observe startup messages, then manually open browser to http://localhost:3001
echo.
node server.js
pause
