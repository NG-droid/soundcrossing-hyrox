# Soundcrossing — Windows autonome

## Première utilisation — Windows 10/11, PC Intel ou AMD 64 bits

1. Téléchargez `Soundcrossing-Windows-x64.zip` depuis https://github.com/NG-droid/soundcrossing-hyrox/releases/tag/windows (ou copiez-le sur le PC de la salle).
2. Clic droit sur le ZIP → « Extraire tout ». Choisissez par exemple Documents.
3. Ouvrez le dossier Soundcrossing extrait.
4. Double-cliquez sur « Soundcrossing.exe » (l’icône au logo Soundcrossing).

Le navigateur habituel ouvre l’application automatiquement. Aucune fenêtre noire n’apparaît : Soundcrossing reste en petite icône près de l’horloge, en bas à droite de l’écran (si vous ne la voyez pas, cliquez sur la petite flèche ^ à côté de l’horloge). Python est déjà inclus dans le dossier : rien à installer, aucune commande à saisir. Internet n’est pas nécessaire pour utiliser l’application.

Au tout premier lancement, Windows peut afficher « Windows a protégé votre ordinateur » : cliquez sur « Informations complémentaires », puis « Exécuter quand même ». Le programme n’est pas signé par un éditeur payant, c’est pour cela que Windows prévient une fois.

Ne lancez pas le programme directement depuis l’archive ZIP. Gardez tout le dossier Soundcrossing ensemble, y compris le sous-dossier runtime. Pour l’avoir sur le bureau : clic droit sur « Soundcrossing.exe » → « Afficher d’autres options » (Windows 11) → « Envoyer vers » → « Bureau (créer un raccourci) ».

## Pendant l’événement, et pour arrêter

Laissez Soundcrossing en marche pendant toute la session : c’est lui qui enregistre la copie sur l’ordinateur.

- Clic sur l’icône près de l’horloge : rouvre l’application dans le navigateur.
- Clic droit sur l’icône → « Quitter Soundcrossing » : arrête le programme. Vos inscriptions et résultats restent enregistrés. Tant qu’il n’est pas relancé, le témoin de sauvegarde des pages encore ouvertes passe au rouge.

Si Soundcrossing s’arrête tout seul ou ne démarre pas, un message l’explique. Le détail est dans le fichier soundcrossing-journal.txt du dossier Soundcrossing.

## Les utilisations suivantes

Double-cliquez sur le même Soundcrossing.exe. S’il est déjà en marche, il ouvre simplement l’application. Si le navigateur ne s’ouvre pas, entrez http://127.0.0.1:8767/ dans sa barre d’adresse.

« Lancer Soundcrossing.bat » reste dans le dossier : il ouvre désormais Soundcrossing.exe, donc un ancien raccourci vers ce fichier continue de marcher.

## Vous utilisiez déjà « Lancer Soundcrossing.bat » avec la fenêtre noire

Rien à faire : la mise à jour automatique ajoute Soundcrossing.exe et remplace le .bat. Il faut en général deux lancements avec Internet (le premier met à jour le programme de mise à jour, le second ajoute Soundcrossing.exe). Ensuite, le même raccourci démarre sans fenêtre noire. Vous pouvez aussi télécharger de nouveau le ZIP et remplacer l’ancien dossier : vos données sont ailleurs (Documents\Soundcrossing) et ne sont pas touchées.

## Mises à jour automatiques

Rien à faire : à chaque lancement, si Internet est disponible, Soundcrossing vérifie s’il existe une nouvelle version et l’installe avant d’ouvrir l’application. Sans Internet, la version actuelle démarre normalement. Les inscriptions et résultats sont conservés : la mise à jour ne touche pas au dossier des données.

La dernière version se télécharge toujours ici : https://github.com/NG-droid/soundcrossing-hyrox/releases/tag/windows

## Retrouver vos participants et résultats

Chaque modification est enregistrée dans le navigateur et, en double, dans le fichier Documents\Soundcrossing\session.json de ce PC (la version précédente est gardée dans session-precedente.json). Si le navigateur a effacé ses données, la session est rechargée depuis ce fichier au lancement suivant. Soundcrossing doit rester en marche pendant la session (icône près de l’horloge) : c’est lui qui écrit le fichier.

Pour transférer votre liste depuis le Mac :
1. Dans l’application du Mac, Paramètres → Sauvegarder un fichier.
2. Copiez ce fichier JSON sur le PC Windows.
3. Ouvrez Soundcrossing sur Windows, puis Paramètres → Restaurer un fichier.

Le ZIP du programme ne contient aucune inscription. Copier le programme seul ne copie pas les données du navigateur. Après chaque événement, exportez une sauvegarde JSON et conservez-la séparément.

## État de vérification

La version incluse est Python 3.14.8, distribution portable officielle python.org, avec sa licence. L’archive téléchargée a été vérifiée avec son empreinte SHA-256 officielle. Le programme et les ressources ont été vérifiés sur Mac. Le lancement de ce paquet n’a pas encore été testé sur un vrai PC Windows. Soundcrossing.exe a été essayé avec Wine (Windows simulé) : démarrage sans fenêtre, icône, réouverture, arrêt du serveur avec le lanceur.

Ce paquet est destiné aux PC Windows 10/11 64 bits Intel/AMD. Une autre architecture ou une ancienne version de Windows nécessite une version adaptée.
