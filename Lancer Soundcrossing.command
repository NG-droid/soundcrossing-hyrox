#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  print 'Python 3 est nécessaire. Installez-le depuis https://www.python.org/downloads/ puis relancez ce fichier.'
  read '?Appuyez sur Entrée pour fermer.'
  exit 1
fi
python3 server.py
result=$?
if (( result != 0 )); then
  read '?Le lancement a échoué. Appuyez sur Entrée pour fermer.'
fi
exit $result
