@echo off
title Soundcrossing - Mise a jour
cd /d "%~dp0"
where git >nul 2>&1
if errorlevel 1 (
  echo Git n'est pas installe sur ce PC.
  echo Installez-le depuis https://git-scm.com/download/win avec les options par defaut, puis relancez ce fichier.
  pause
  exit /b 1
)
if not exist ".git" (
  echo Ce dossier n'a pas ete recupere avec git clone : la mise a jour automatique est impossible ici.
  echo Suivez la section "Mettre a jour depuis GitHub" de WINDOWS.md.
  pause
  exit /b 1
)
echo Recuperation de la derniere version depuis GitHub...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo La mise a jour a echoue. Verifiez la connexion Internet, puis relancez ce fichier.
  echo Vos inscriptions et resultats ne sont pas touches : ils restent dans le navigateur.
  pause
  exit /b 1
)
echo.
echo Soundcrossing est a jour. Si l'application est ouverte, rechargez la page du navigateur.
echo Vos inscriptions et resultats sont conserves.
pause
