@echo off
title Soundcrossing - Gardez cette fenetre ouverte
cd /d "%~dp0"
if exist "runtime\python.exe" (
  "runtime\python.exe" -I "%~dp0server.py"
  if errorlevel 1 (
    echo Le lancement a echoue. Verifiez que le dossier est entierement decompresse.
    pause
  )
  exit /b
)
py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>&1
if not errorlevel 1 (
  py -3 server.py
  if errorlevel 1 pause
  exit /b
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" >nul 2>&1
if not errorlevel 1 (
  python server.py
  if errorlevel 1 pause
  exit /b
)
echo Python 3 est necessaire. Installez-le depuis https://www.python.org/downloads/
echo Pendant l'installation, cochez Add Python to PATH. Relancez ensuite ce fichier.
pause
