@echo off
:: ==============================================================================
:: AURA PRINT PRO — WINDOWS PRINT AGENT LAUNCHER & SUPERVISOR WATCHDOG
:: File: agent/start-agent.bat
:: Platform: Windows 10 / 11 (64-bit & 32-bit)
:: Owner: Sabir Ansari
:: ==============================================================================

title AURA Print Pro — Counter Print Agent Daemon
chcp 65001 >nul
color 0B

echo.
echo  ================================================================
echo        AURA PRINT PRO — AUTOMATED BACKGROUND PRINT AGENT         
echo          Engineered for Indian CSC Centres ^& Xerox Hubs         
echo  ================================================================
echo.

:: 1. CHECK FOR NODE.JS RUNTIME
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in your Windows PATH!
    echo.
    echo Please install Node.js (LTS version) from:
    echo https://nodejs.org/
    echo.
    echo After installing, restart this batch file.
    echo.
    pause
    exit /b 1
)

:: 2. VERIFY WORKING DIRECTORY
cd /d "%~dp0"

:: 3. VERIFY CONFIGURATION FILE
if not exist "config.json" (
    color 0C
    echo [ERROR] Configuration file 'config.json' was not found in:
    echo %cd%
    echo.
    echo Please ensure config.json exists with your shopId and agentToken.
    echo.
    pause
    exit /b 1
)

:: 4. CHECK NODE MODULES AND AUTO-INSTALL IF MISSING
if not exist "node_modules\" (
    echo [INFO] First-time setup detected: Installing required packages...
    call npm install --no-audit --no-fund
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo [ERROR] Failed to install npm dependencies. Check internet connection.
        pause
        exit /b 1
    )
    echo [SUCCESS] Dependencies installed successfully.
    echo.
)

:: 5. CHECK FOR SUMATRAPDF PRINT ENGINE
set "SUMATRA_FOUND=0"
if exist "C:\Program Files\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "C:\Program Files (x86)\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "%LOCALAPPDATA%\SumatraPDF\SumatraPDF.exe" set "SUMATRA_FOUND=1"
if exist "bin\SumatraPDF.exe" set "SUMATRA_FOUND=1"

if "%SUMATRA_FOUND%"=="0" (
    color 0E
    echo [WARNING] SumatraPDF.exe was not detected in common program folders!
    echo [WARNING] Silent background printing requires SumatraPDF.
    echo Download free from: https://www.sumatrapdfreader.org/free-pdf-reader
    echo.
    timeout /t 3 >nul
    color 0B
)

:: 6. WATCHDOG LOOP (SUPERVISOR)
:AGENT_LOOP
cls
echo  ================================================================
echo        AURA PRINT PRO — ACTIVE COUNTER PRINT AGENT DAEMON        
echo  ================================================================
echo  Status:       RUNNING (Listening for cloud print jobs)
echo  Working Dir:  %cd%
echo  Started At:   %date% %time%
echo.
echo  * Do NOT close this window during shop working hours.
echo  * Press Ctrl + C to stop the print agent manually.
echo  ================================================================
echo.

node print-agent.js

:: IF THE PROCESS EXITS UNEXPECTEDLY
set "EXIT_CODE=%ERRORLEVEL%"
color 0C
echo.
echo [ALARM] Print Agent stopped unexpectedly with Exit Code: %EXIT_CODE%
echo [INFO] Initiating crash recovery watchdog in 5 seconds...
echo (Press Ctrl+C now if you intentionally stopped the agent)
echo.

timeout /t 5 /nobreak >nul
color 0B
goto AGENT_LOOP
