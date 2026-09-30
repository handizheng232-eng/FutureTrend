@echo off
chcp 65001 >nul
cd /d "%~dp0"
python refresh_data.py
if errorlevel 1 (
  echo.
  echo 数据刷新失败，请查看上方错误。
  pause
  exit /b 1
)
echo.
echo 数据刷新完成。
pause
