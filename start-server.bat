@echo off
title QMath Local Server - DUNG DONG CUA SO NAY
cd /d "%~dp0"

echo ========================================================
echo   QMATH - LOCAL SERVER
echo   Trang web: http://localhost:8080
echo   LUU Y: Giu nguyen cua so nay trong luc test.
echo          Dong cua so = tat server.
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js tren may.
    echo Cai dat tai: https://nodejs.org roi chay lai file nay.
    pause
    exit /b 1
)

rem Mo trinh duyet sau 2 giay (cho server kip khoi dong)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080/dashboard.html"

node local-server.js

echo.
echo [!] Server da dung (co the cong 8080 dang bi chiem boi cua so khac).
pause
