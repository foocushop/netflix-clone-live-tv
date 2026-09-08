@echo off  
title Netflix Clone Online  
start /b node server.js  
timeout /t 2 /nobreak >nul  
cloudflared.exe tunnel --url http://127.0.0.1:8080 
