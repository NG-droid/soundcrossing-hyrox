# Soundcrossing — Événements & résultats Hyrox

Guide organisateur : [DEMARRER.md](DEMARRER.md). Pour Windows 10/11 x64 : `livraison/Soundcrossing-Windows-x64.zip`, Python intégré, guide [WINDOWS.md](WINDOWS.md). Pour Mac / version source : `livraison/Soundcrossing.zip`, Python installé nécessaire.

## Télécharger depuis GitHub

Les archives prêtes à utiliser se trouvent dans les [versions du projet](https://github.com/NG-droid/soundcrossing-hyrox/releases/latest). Sur Windows, téléchargez **Soundcrossing-Windows-x64.zip** ; l’archive « Source code » ne contient pas le Python intégré.

Le dépôt conserve le code et son historique. Les sauvegardes des participants, captures, dépendances et archives générées sont exclues du suivi Git. Les résultats restent dans le navigateur utilisé pour l’application ; ils ne sont pas synchronisés avec GitHub.

## Fonctionnement actuel (V4)

- Un événement possède un nom, une date et un `format` (SOLO, DUO ou MIXED) ; le format appartient à chaque inscription : Solo H/F, Duo HH/FF/HF. Les inscriptions et imports doivent respecter le format de l’événement. La vue du jour réunit les participants compatibles avec ce format ; Solo + Duo réunit tous les participants.
- Liste triée par départ, filtres de format en un clic, arrivées à compléter, ajout près du tableau. Classement séparé par format et par date, avec ex æquo (1, 2, 2, 4).
- Départ + arrivée = temps total ; pas de chrono en direct. Correction, retrait du résultat et annulation (15 étapes) disponibles.
- Trois modèles photo sans commandes visibles, logo Soundcrossing, deux noms de duo au même niveau. Échap ou coin supérieur gauche pour quitter.
- Sauvegarde/restauration et préférences photo regroupées dans Paramètres. Données dans le navigateur à `http://127.0.0.1:8767/`, copiées à chaque modification par `server.py` dans `~/Documents/Soundcrossing/session.json` (ou `SOUNDCROSSING_DATA`) et rechargées au démarrage si le navigateur les a perdues ou si la copie disque est plus récente. Une sauvegarde JSON est nécessaire pour changer d’ordinateur.
- Imports Excel/CSV avec format par ligne, prévisualisation, validation intégrale, contrôle de doublons (mêmes noms, même format, même événement, même heure). Modèle Excel, consignes et exports regroupés dans Paramètres. Import et annulation restent près du tableau.
- Création d’événement : format obligatoire sans présélection. Format affiché sous le titre, dans le sélecteur et à l’inscription. Paramètres → « Format du fichier » présente les colonnes et exemples Excel compatibles avec l’événement sélectionné.
- Forfait : inscription conservée, sans arrivée, temps ou rang ; remise en course et annulation possibles. Statuts persistés dans la sauvegarde et inclus dans l’export Excel de la liste.
- Classements provisoires jusqu’à ce que chaque inscription de la journée et de la famille affichée ait une arrivée, un forfait. Rang sur la photo uniquement une fois les résultats complets ; ajouter ou remettre une inscription en course rend les classements provisoires.
- Photo finish : bloc centré avec grand logo, nom d’événement, date complète, noms de même importance et temps unique. Les trois thèmes partagent cette disposition.
- Podium final par catégorie : marches noires 2/1/3, accents or/argent/bronze, logo et repères rouges Soundcrossing, noms et temps. Accessible par « Top 3 final » sous le tableau ; Échap revient directement à la liste.

## Corrections de fiabilité (V4.10)

Un formulaire dont l’inscription ou l’événement a changé depuis son ouverture refuse la sauvegarde : fermez-le puis rouvrez-le pour récupérer la version à jour. Les modifications de participants sans lien avec le formulaire restent autorisées. Le mode de saisie du résultat est conservé lors d’une correction de nom.

La correction horaire d’une arrivée enregistrée après minuit peut revenir au jour du départ lorsque la nouvelle heure est après le départ. Pour une nouvelle arrivée après minuit ou une durée supérieure à 24 h, utilisez Temps total. La restauration reste possible après suppression du stockage, tout en refusant de remplacer une session plus récente apparue après la demande de confirmation.

## Migration et protection

Les sauvegardes V1/V2/V3 sont lues et migrées en V4 : les anciennes courses de formats différents sont réunies par date. Les ids des inscriptions, les noms, départs, arrivées, temps, statuts et les instantanés d’historique sont préservés. Les titres précédents restent dans `previousTitles`. Un solo sans catégorie garde une catégorie vide et apparaît « Solo à préciser » ; aucune catégorie n’est devinée. Une arrivée inconnue reste vide.

Clé de stockage conservée : `pace.hyrox.session.v1` ; copie de récupération : suffixe `.recovery`. Le choix de l’événement est mémorisé séparément avec `.event`. Chaque modification vérifie l’état précédent pour éviter d’écraser une modification faite dans une autre fenêtre. Une écriture refusée par le navigateur n’est pas appliquée ; les plus anciennes étapes d’historique peuvent être retirées si le quota est atteint. La copie de récupération reste dans le même navigateur et ne remplace pas un export JSON.

Dates/heures dans le fuseau local de l’ordinateur. Arrivée après minuit explicite, durée positive et au plus 48 h ; heures inexistantes lors du changement d’heure refusées. Une date comportant des départs enregistrés ne peut pas être déplacée : créer un autre événement.

Le serveur n’écoute que sur `127.0.0.1` et sert une liste explicite de ressources publiques ; les sauvegardes, sources et dossiers internes ne sont pas accessibles par HTTP. `/data` (Hyrox) et `/data/wod` (WOD) lisent et écrivent uniquement les copies disque `session.json` et `wod.json` ; une écriture à la fois, et une version plus ancienne que celle du disque est refusée (409) ; l’écriture exige l’hôte `127.0.0.1:8767`, l’origine de l’application et un corps JSON. Les données ne sont pas envoyées à un service distant. Logo : [origine](assets/ORIGINE.md).

## Développement / reprise

Interface sans framework. `src/models.ts` définit les types, `src/core.ts` la validation et les calculs, `src/app.ts` l’interface et la persistance. TypeScript en mode strict, fichiers générés dans `dist/` conservés pour utiliser l’application sans installation. `styles.css`, `club.css` et `index.html` portent la présentation. Serveur local Python standard.

```sh
npm ci
npm test
npm run pack-local
npm run pack-windows
/usr/bin/python3 server.py --no-open
```

Après toute modification des sources TypeScript, reconstruire avec `npm run build`. Tests métier dans `tests/core.test.cjs`. Les calculs et le parsing ne dépendent pas du navigateur ; les parcours interface doivent aussi être testés au navigateur, notamment fermeture/rechargement, import avec doublons, annulation et écran photo.

SheetJS Community Edition **0.20.3** est intégrée localement dans `vendor/`, licence Apache 2.0 jointe. Source officielle : [distribution standalone](https://docs.sheetjs.com/docs/getting-started/installation/standalone/). TypeScript **7.0.2** est uniquement une dépendance de développement : [documentation officielle](https://www.typescriptlang.org/download/).

## Distribution Windows autonome

`scripts/package_windows.py` assemble uniquement les ressources publiques et le runtime officiel embarquable Python 3.14.8 AMD64, téléchargé depuis python.org et vérifié contre le SHA-256 de la page de release. `runtime-cache/` garde le ZIP officiel hors versionnement. Le lanceur préfère `runtime/python.exe` en mode isolé et ne dépend donc pas des installations Python, du PATH ou du gestionnaire Windows. Les licences et la provenance sont incluses. Pas de copie de participants dans la distribution.

Cette approche suit la [documentation Python sur la distribution embarquée](https://docs.python.org/3.14/using/windows.html#the-embeddable-package). Elle produit une archive sans installateur : `Soundcrossing.exe` (petit lanceur C compilé par la CI avec MinGW, source `windows/lanceur.c`) démarre `runtime/python.exe server.py --lanceur` sans fenêtre de console, écrit ses messages dans `soundcrossing-journal.txt` et reste en icône près de l’horloge (Ouvrir / Quitter). `Lancer Soundcrossing.bat` reste en secours et passe la main au .exe. L’icône se régénère avec `python3 scripts/icone_windows.py`. Les tests de distribution vérifient le binaire x64, l’intégrité des fichiers, la bibliothèque standard requise et le serveur servi depuis un dossier extrait avec espaces/accents. Ils ne prouvent pas le lancement sur Windows ; cette validation doit se faire sur le PC cible.

## Inscription par personne

Boutons H/F pour chaque nom ; sélection rouge, catégorie déduite, duo mixte affiché HF dans la liste, le classement, la photo et Excel indépendamment de l’ordre. Les champs `gender1` et `gender2` sont conservés dans les sauvegardes. La catégorie mixte reste HF quel que soit l’ordre des deux personnes ; MF est également accepté comme alias à l’import. Les anciens HH/FF permettent de retrouver les choix H/F ; l’ordre H/F des anciens mixtes reste inconnu et demande un choix explicite à la modification. Aucun genre n’est déduit des noms. L’export Excel inclut les choix H/F connus.

## Format contraignant de l’événement (V4)

Le champ `format` remplace la préférence `defaultFormat` de V3 ; les anciennes préférences Solo/Duo sont reprises comme format d’événement. Si un ancien événement contient déjà des inscriptions d’un autre format, il devient MIXED pendant la migration, sans supprimer ni modifier les participants ou résultats. La migration s’applique aussi aux instantanés d’annulation. Les écritures V4 valident le format de chaque entrée ; les événements fixes cachent le sélecteur à l’inscription et les filtres de l’autre famille. Les imports et modèles Excel suivent la même règle. Modifier le format d’un événement contenant des inscriptions incompatibles est refusé.

## Arrivée rapide (4.1)

`arrivalNow` capture les secondes de l’horloge et le jour réel, sans modifier les données. Utilisable le jour du départ ou le lendemain ; départ futur, événement plus ancien, horloge invalide et heure répétée ambiguë sont refusés. Les différences de date utilisent les jours calendaires pour rester correctes lors du changement d’heure.

Le bouton capture uniquement le brouillon. La soumission valide puis persiste avant d’ouvrir la photo ; aucune photo ne s’ouvre en cas d’erreur. Le temps total est affiché en grand. La notification d’enregistrement n’est pas affichée sur la photo ; une notification déjà visible est masquée à son ouverture. La fermeture attend le retour aux dimensions de la liste avant de restaurer le défilement et le focus, avec un délai maximal de 500 ms pour un navigateur ne revenant pas aux mêmes dimensions. Schéma de sauvegarde V4 conservé.

## Résultats et export (V4.4)

Deux modes explicites : arrivée (`10h00`) ou durée (`1h00min30s`). `Entry.resultMode` conserve le mode ; validation et reprise des anciennes durées sans arrivée. Le temps total calcule l’arrivée depuis le départ. La case du lendemain est retirée ; les arrivées existantes et captures automatiques conservent leur date, sans roulement automatique d’une heure antérieure au départ.

Un seul statut actif « Forfait » ; `abandoned` demeure lisible comme Forfait pour préserver les sauvegardes et départs historiques. CSV final refusé tant qu’une inscription reste en attente, export complet indépendant des filtres, trié par format et rang. UTF-8 BOM, point-virgule, échappement et neutralisation des formules dans les champs texte. Podiums visibles uniquement quand les résultats sont complets ; les ex æquo de rang ≤ 3 sont tous affichés.

## Saisie guidée (V4.5)

Champ de résultat avec clavier numérique, masque HH:MM:SS pendant la frappe et caret conservé. Heures/minutes/secondes depuis 6 chiffres, HHMM depuis 4 chiffres (secondes 00) pour les deux modes. Cette normalisation UI évite d’interpréter 01:00 comme une minute en mode durée ; le parseur des imports historiques reste inchangé. Collage 10h00/1h00min30s conservé et normalisé à la sortie du champ. Saisies trop longues ou hors limites refusées sans troncature ni écriture.

## Podiums en plein écran et retour direct (V4.6)

Bouton Top 3 final : choix de catégorie ou accès direct si un filtre est actif ; accès sous le tableau, sans aperçu de podium supplémentaire sur la page. `podiumFor` vérifie les résultats complets et la compatibilité des catégories, conserve tous les ex æquo de rang ≤ 3 et exclut les forfaits. Écran avec logo, événement, date et marches 2/1/3 ; le premier reste le plus haut, même quand les cartes ont des hauteurs de contenu différentes.

Photo et podium partagent la fermeture, le retour du focus et la position de défilement. `fullscreenchange` ferme l’affichage à la sortie du plein écran natif : une seule pression sur Échap suffit même si le navigateur consomme l’événement clavier. Le clavier reste utilisable si la demande de plein écran est refusée. Référence : https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenchange_event.

## Sélecteurs horaires harmonisés (V4.7)

Départ et arrivée utilisent le même input time avec step=1 et les mêmes styles (12 px, graisse 600, hauteur minimale 42 px). Le masque de saisie V4.5 est retiré. La durée utilise trois entrées numériques dans un champ de même style : heures 0–48, minutes et secondes 0–59. Les champs masqués sont désactivés pour ne pas bloquer la validation du mode actif ; seul le champ heures de la durée est obligatoire, les parties vides minutes/secondes valent 00. Les anciennes durées >24h restent lisibles et modifiables sans restriction liée à une heure du jour. Référence native : https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/time.
