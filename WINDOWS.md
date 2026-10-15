# Soundcrossing — Windows autonome

## Première utilisation — Windows 10/11, PC Intel ou AMD 64 bits

1. Copiez `Soundcrossing-Windows-x64.zip` sur le PC de la salle.
2. Clic droit sur le ZIP → « Extraire tout ». Choisissez par exemple Documents.
3. Ouvrez le dossier Soundcrossing extrait.
4. Double-cliquez sur « Lancer Soundcrossing.bat ».

Le navigateur habituel ouvre l’application automatiquement. Python est déjà inclus dans le dossier : rien à installer, aucune commande à saisir. Internet n’est pas nécessaire pour utiliser l’application.

Gardez la fenêtre de lancement ouverte pendant l’événement. Vous pouvez la réduire. La fermer arrête le programme ; vos inscriptions et résultats restent enregistrés.

Ne lancez pas le programme directement depuis l’archive ZIP. Gardez tout le dossier Soundcrossing ensemble, y compris le sous-dossier runtime. Vous pouvez créer un raccourci du fichier « Lancer Soundcrossing.bat » sur le bureau.

## Les utilisations suivantes

Double-cliquez sur le même lanceur. Si le programme est déjà ouvert, il retrouve le serveur actif et ouvre l’application. Si le navigateur ne s’ouvre pas, entrez http://127.0.0.1:8767/ dans sa barre d’adresse.

## Mettre à jour depuis GitHub, sans retélécharger le ZIP

À faire une seule fois sur le PC :
1. Installez Git depuis https://git-scm.com/download/win en gardant les options par défaut.
2. Ouvrez « Invite de commandes », puis tapez `cd %USERPROFILE%\Documents` et `git clone https://github.com/NG-droid/soundcrossing-hyrox.git Soundcrossing-GitHub`.
3. Copiez le sous-dossier `runtime` du ZIP déjà extrait dans le nouveau dossier `Soundcrossing-GitHub` (sinon, installez Python depuis python.org).
4. Lancez désormais l’application avec « Lancer Soundcrossing.bat » de ce nouveau dossier.

Ensuite, à chaque nouvelle version publiée sur GitHub : double-cliquez sur « Mettre a jour Soundcrossing.bat », puis rechargez la page du navigateur. Les inscriptions et résultats sont conservés, car ils restent dans le navigateur à l’adresse http://127.0.0.1:8767/.

## Retrouver vos participants et résultats

Les données sont enregistrées dans le navigateur de ce PC, pour l’adresse http://127.0.0.1:8767/. Utilisez le même navigateur et son même profil. Évitez la navigation privée.

Pour transférer votre liste depuis le Mac :
1. Dans l’application du Mac, Paramètres → Sauvegarder un fichier.
2. Copiez ce fichier JSON sur le PC Windows.
3. Ouvrez Soundcrossing sur Windows, puis Paramètres → Restaurer un fichier.

Le ZIP du programme ne contient aucune inscription. Copier le programme seul ne copie pas les données du navigateur. Après chaque événement, exportez une sauvegarde JSON et conservez-la séparément.

## État de vérification

La version incluse est Python 3.14.8, distribution portable officielle python.org, avec sa licence. L’archive téléchargée a été vérifiée avec son empreinte SHA-256 officielle. Le programme et les ressources ont été vérifiés sur Mac. Le lancement de ce paquet n’a pas encore été testé sur un vrai PC Windows.

Ce paquet est destiné aux PC Windows 10/11 64 bits Intel/AMD. Une autre architecture ou une ancienne version de Windows nécessite une version adaptée.
