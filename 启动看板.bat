@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" /b pythonw "%~dp0serve.py"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/"
exit /b 0
