@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0server.py"
) else (
  python "%~dp0server.py"
)
if errorlevel 1 pause
