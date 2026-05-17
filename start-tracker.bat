@echo off
REM AI Course Tracker launcher.
REM   - Starts the local tracker server (server.js) if it isn't already running.
REM   - Opens the course hub in your default browser.
REM   - The server auto-shuts down ~60 seconds after you close the last tracker tab.
REM
REM Point your desktop shortcut at this file instead of the .html.

cd /d "%~dp0"

REM Detect whether port 3000 is already serving. netstat returns 0 if it finds a match.
netstat -ano -p tcp | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  echo Starting AI Course Tracker server on http://localhost:3000 ...
  start "AI Course Tracker Server" /min cmd /c "node server.js"
  REM Give Node a moment to bind the port before the browser hits it.
  timeout /t 2 /nobreak >nul
) else (
  echo Tracker server already running. Skipping start.
)

REM Open the hub. Add ?w=N to the URL or change to a worksheet HTML to deep-link.
start "" "http://localhost:3000/"
