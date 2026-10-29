@echo off
REM Optional local server for the Tender Monitoring Dashboard (listens on this computer only).
REM Requires Python 3. Alternatively, just double-click index.html.
cd /d "%~dp0"
echo Starting local server at http://127.0.0.1:8080/  (press Ctrl+C to stop)
start "" /min cmd /c "timeout /t 2 >nul & start "" http://127.0.0.1:8080/index.html"
where py >nul 2>nul && (py -3 -m http.server 8080 --bind 127.0.0.1 & goto :eof)
where python >nul 2>nul && (python -m http.server 8080 --bind 127.0.0.1 & goto :eof)
echo Python 3 was not found. Open index.html directly instead.
pause
