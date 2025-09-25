@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo    Grade Analysis System - Starting
echo ==========================================
echo.

echo Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found
    echo Attempting to install Node.js automatically...
    echo.
    
    REM Download and install Node.js
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v18.17.1/node-v18.17.1-x64.msi' -OutFile 'node-installer.msi'"
    if exist "node-installer.msi" (
        echo Installing Node.js silently...
        msiexec /i node-installer.msi /qn
        echo Waiting for installation to complete...
        timeout /t 30 /nobreak
        
        REM Check if installation was successful
        where node >nul 2>&1
        if %errorlevel% neq 0 (
            echo ERROR: Node.js installation failed
            echo Please install Node.js manually from https://nodejs.org/
            del node-installer.msi 2>nul
            pause
            exit /b 1
        ) else (
            echo OK: Node.js has been installed successfully
            del node-installer.msi 2>nul
        )
    ) else (
        echo ERROR: Failed to download Node.js installer
        echo Please install Node.js manually from https://nodejs.org/
        pause
        exit /b 1
    )
) else (
    echo OK: Node.js is installed
)

echo Checking dependencies...
node -e "try { require('express'); console.log('Express: OK'); } catch (e) { console.log('Express: MISSING'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo Dependencies missing, auto-installing...
    echo Setting up mirror registry for faster downloads...
    set PUPPETEER_SKIP_DOWNLOAD=true
    set npm_config_registry=https://registry.npmmirror.com
    npm config set registry https://registry.npmmirror.com
    npm install express multer xlsx chart.js fs-extra cors --save
    
    echo.
    echo Rechecking dependencies...
    node -e "try { require('express'); console.log('Express: NOW OK'); } catch (e) { console.log('Installation: FAILED'); process.exit(1); }"
    if %errorlevel% neq 0 (
        echo Dependency installation failed, please check network
        pause
        exit /b 1
    )
)

echo Checking files...
if not exist "public\index.html" (
    echo WARNING: public\index.html does not exist
) else (
    echo OK: public\index.html exists
)

if not exist "server.js" (
    echo ERROR: server.js does not exist
    pause
    exit /b 1
) else (
    echo OK: server.js exists
)

echo.
echo ==========================================
echo           Starting Server
echo ==========================================
echo.
echo Server starting at: http://localhost:3001
echo Open the above URL in your browser
echo Press Ctrl+C to stop the server
echo.

node server.js
pause