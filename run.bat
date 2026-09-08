@echo off
chcp 65001 > nul
title Netflix Clone - Propulsé par Rust

echo ========================================================
echo   🍿 NETFLIX CLONE - PROPULSÉ PAR RUST (AXUM + TOKIO)
echo ========================================================
echo.

where cargo >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] Compilateur Rust & Cargo détectés.
    echo [INFO] Démarrage du serveur web Axum & Moteur de streaming...
    echo.
    set RUSTFLAGS=-C link-self-contained=yes
    cargo run
    pause
    exit /b 0
)

echo [ATTENTION] Rust (cargo) n'est pas encore installé sur votre système Windows.
echo.
echo Vous avez 2 options pour lancer le projet :
echo.
echo 1) Installer Rust automatiquement (Recommandé pour exécuter le code Rust natif) :
echo    Ouvrez un terminal et tapez :
echo    winget install Rustlang.Rustup
echo    (ou téléchargez l'installateur officiel sur https://rustup.rs/)
echo.
echo 2) Lancer la prévisualisation instantanée immédiate (Node.js) :
echo    Appuyez sur n'importe quelle touche pour lancer le serveur local de test...
echo.
pause

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    node server.js
) else (
    echo Veuillez installer Rust ou Node.js pour démarrer le serveur.
    pause
)
