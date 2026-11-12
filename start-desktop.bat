@echo off
title Discord / TeamSpeak - Desktop Launcher
echo ========================================================
echo Discord / TeamSpeak (Tauri Rust) Masaustu Baslatiliyor...
echo ========================================================

:: 1. Arka plan Backend sunucusunu baslat
echo [1/2] Backend sunucusu baslatiliyor (Port 4000)...
start "Discord Backend Server" /min cmd /c "npm.cmd run dev:server"

:: 2. Tauri masaustu uygulamasini baslat
echo [2/2] Rust Tauri Masaustu Arayuzu aciliyor...
echo (Ilk acilista Rust dosyalari derlenecegi icin kisa bir sure bekletebilir)
echo ========================================================
npm.cmd run dev:desktop

pause
