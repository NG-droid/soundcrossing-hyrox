# Soundcrossing — Windows autonome

## Première utilisation — Windows 10/11, PC Intel ou AMD 64 bits

1. Téléchargez `Soundcrossing-Windows-x64.zip` depuis https://github.com/NG-droid/soundcrossing-hyrox/releases/tag/windows (ou copiez-le sur le PC de la salle).
2. Clic droit sur le ZIP → « Extraire tout ». Choisissez par exemple Documents.
3. Ouvrez le dossier Soundcrossing extrait.
4. Double-cliquez sur « Lancer Soundcrossing.bat ».

Le navigateur habituel ouvre l’application automatiquement. Python est déjà inclus dans le dossier : rien à installer, aucune commande à saisir. Internet n’est pas nécessaire pour utiliser l’application.

Gardez la fenêtre de lancement ouverte pendant l’événement. Vous pouvez la réduire. La fermer arrête le programme ; vos inscriptions et résultats restent enregistrés.

Ne lancez pas le programme directement depuis l’archive ZIP. Gardez tout le dossier Soundcrossing ensemble, y compris le sous-dossier runtime. Vous pouvez créer un raccourci du fichier « Lancer Soundcrossing.bat » sur le bureau.

## Les utilisations suivantes

Double-cliquez sur le même lanceur. Si le programme est déjà ouvert, il retrouve le serveur actif et ouvre l’application. Si le navigateur ne s’ouvre pas, entrez http://127.0.0.1:8767/ dans sa barre d’adresse.

## Mises à jour automatiques

Rien à faire : à chaque lancement, si Internet est disponible, Soundcrossing vérifie s’il existe une nouvelle version et l’installe avant d’ouvrir l’application. Sans Internet, la version actuelle démarre normalement. Les inscriptions et résultats sont conservés : la mise à jour ne touche pas au dossier des données.

La dernière version se télécharge toujours ici : https://github.com/NG-droid/soundcrossing-hyrox/releases/tag/windows

## Retrouver vos participants et résultats

Chaque modification est enregistrée dans le navigateur et, en double, dans le fichier Documents\Soundcrossing\session.json de ce PC (la version précédente est gardée dans session-precedente.json). Si le navigateur a effacé ses données, la session est rechargée depuis ce fichier au lancement suivant. La fenêtre noire de Soundcrossing doit rester ouverte pendant la session : c’est elle qui écrit le fichier.

Pour transférer votre liste depuis le Mac :
1. Dans l’application du Mac, Paramètres → Sauvegarder un fichier.
2. Copiez ce fichier JSON sur le PC Windows.
3. Ouvrez Soundcrossing sur Windows, puis Paramètres → Restaurer un fichier.

Le ZIP du programme ne contient aucune inscription. Copier le programme seul ne copie pas les données du navigateur. Après chaque événement, exportez une sauvegarde JSON et conservez-la séparément.

## État de vérification

La version incluse est Python 3.14.8, distribution portable officielle python.org, avec sa licence. L’archive téléchargée a été vérifiée avec son empreinte SHA-256 officielle. Le programme et les ressources ont été vérifiés sur Mac. Le lancement de ce paquet n’a pas encore été testé sur un vrai PC Windows.

Ce paquet est destiné aux PC Windows 10/11 64 bits Intel/AMD. Une autre architecture ou une ancienne version de Windows nécessite une version adaptée.
