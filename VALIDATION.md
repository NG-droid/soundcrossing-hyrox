# Libellés de création cohérents (V4.9.1) — 14 octobre 2026

- Session sans événement : « Créer un événement » à tous les points d’entrée. Dès qu’un événement existe, le bouton d’en-tête indique « Nouvel événement », même si sa liste de participants est encore vide. Libellé HTML initial cohérent avec le rendu.
- QA HTTP 8769 isolée : démarrage vide contrôlé, création d’un événement fictif Duo depuis l’en-tête, puis bascule vers « Nouvel événement » constatée. Capture aperçus/demarrage-coherent-v4-9-1.jpg inspectée. Aucun accès aux inscriptions réelles.
- Compilation stricte réussie ; archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Rafraîchissement manuel nécessaire pour l’onglet file://.

---

# Interface de course simplifiée (V4.9) — 13 octobre 2026

- Ajout flottant et ajout dupliqué dans l’en-tête supprimés ; ajout conservé près de la liste. Édition d’événement remplacée par un crayon avec libellé accessible, près du titre. Slogans de bas de page et répétition du podium au-dessus du classement supprimés.
- Top 3 final déplacé sous le tableau, avec choix des catégories et présentation plein écran conservés. Modèle Excel, aide au format et exports Excel/CSV regroupés dans Paramètres, avec contexte de l’événement et portée explicite de l’export. Import et annulation restent dans le tableau. Sélecteur d’événement masqué si une seule course existe.
- QA HTTP 8768 isolée : crayon ouvre le bon événement ; aide Excel depuis Paramètres limitée à HH/FF/HF pour Duo ; fermeture de l’aide revient à Paramètres ; CSV final réellement téléchargé et relu (5 inscriptions fictives, 3 résultats et 2 forfaits). Bouton sous le tableau ouvre le choix de catégorie puis le podium HH. Course incomplète : CSV et podium désactivés, explication dans Paramètres. Journaux sans erreur ni avertissement.
- Contrôle mobile 390 × 844 : ajout, crayon et podium accessibles ; aucun bouton flottant ni débordement horizontal de page (390 px). Tableau défilant conservé. Captures aperçus/interface-epuree-v4-9.jpg, parametres-fichiers-v4-9.jpg et interface-mobile-v4-9.jpg, aperçu principal et mobile inspectés visuellement.
- 48 tests métier et compilation stricte réussis ; archives locale et Windows reconstruites, trois tests de distribution Windows réussis. Lancement natif Windows à vérifier sur PC. Aucun changement des schémas ou inscriptions réelles ; rafraîchir manuellement l’onglet file://.

---

# Podium Soundcrossing, accents métalliques (V4.8) — 13 octobre 2026

- Présentation refaite : fond clair, marches noires mates, accents or/argent/bronze sur les rangs, bordures et temps ; logo et repères rouges Soundcrossing. Laurier, médaillon et grandes surfaces en dégradé retirés. Composant de rang partagé entre les podiums du classement et le plein écran.
- QA HTTP 8768 avec inscriptions fictives : logo, événement, date, catégorie, noms et trois temps contrôlés visuellement ; marches 2/1/3, première plus haute et bas commun, aucun débordement vertical en 2560 × 1440 (hauteur visible et contenu : 1440 px). Retour au classement après Échap vérifié. Capture : aperçus/podium-soundcrossing-v4-8.jpg.
- 48 tests métier et compilation stricte réussis. Archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Exécution native sur PC Windows à vérifier sur le PC cible.
- Aucun changement des calculs, classements, schémas ou données réelles. L’onglet utilisateur file:// nécessite une actualisation manuelle.

---

# Sélecteur horaire harmonisé (V4.7) — 13 octobre 2026

- Départ et arrivée : même sélecteur natif type=time, step=1, taille 12 px, graisse 600, hauteur minimale 42 px, sans masque texte spécifique ni API de sélection incompatible avec type=time.
- Temps total : trois parties numériques heures/minutes/secondes, séparateurs fixes, même bordure et typographie. Validation explicite heures 0–48, minutes/secondes 0–59, entiers positifs et durée non nulle. Anciennes durées préremplies ; durées >24h conservées. Mode inactif masqué et désactivé, pas de blocage par required sur un champ caché.
- QA isolée HTTP 8768 : comparaison effective des types, steps et styles des deux horaires ; arrivée 10:23:00 sauvegardée depuis départ 09:00 ; durée 1h/0min/30s prévisualisée et sauvegardée ; minutes 60 refusées, formulaire conservé ; durée 25:00:00 sauvegardée et réouverte correctement, puis exemple remis à 01:00:30. Capture actuelle dans le sélecteur natif vérifiée sans enregistrement. Journaux sans erreur ni avertissement.
- Captures aperçus/arrivee-native-v4-7.jpg et duree-segments-v4-7.jpg, vérifiées visuellement. Aucun accès aux données du fichier utilisateur ; actualisation de l’onglet file:// nécessaire.
- Archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Lancement natif Windows toujours à vérifier sur le PC cible.
- 48 tests métier et compilation réussis. Les deux tests du masque retiré sont remplacés par les scénarios de saisie en trois parties, secondes, valeurs vides, entiers, limites et durées 25h/48h. Données et modes de résultat persistés conservés.

---

# Retour direct et podium final en plein écran (V4.6) — 13 octobre 2026

- Cause corrigée : Échap pouvait quitter le plein écran natif sans livrer keydown à l’application. Fermeture partagée pour photo/podium, écoute de fullscreenchange, masquage immédiat et restauration du focus/défilement après stabilisation du viewport. Sortie native, clavier et zone tactile traités par la même fonction.
- Bouton Top 3 final et choix de catégorie ; catégorie filtrée et boutons par carte ouvrent directement son podium. Logo, nom/date d’événement, catégorie, noms et temps, marches 2/1/3. Grille étirée avec marges supérieures différentes : première marche toujours plus haute, y compris avec contenus variables. Toutes les personnes ex æquo de rang ≤ 3 sont conservées, forfaits exclus, places sans résultat non attribuées.
- QA isolée HTTP 8768 : vrai plein écran confirmé par sélecteur :fullscreen pour photo-screen et podium-screen ; une seule touche native Échap ferme chaque affichage et revient au classement. Test de retour à position stable : 474 px avant et après. Fermeture tactile/bouton également vérifiée. Choix de catégorie HH disponible, FF/HF sans résultats classés désactivés ; lancement direct depuis filtre HH vérifié.
- Géométrie des marches : haut du 1er 626 px, 2e 716 px, 3e 756 px ; bas commun 1149 px. Capture complète aperçus/podium-plein-ecran-v4-6.jpg, vérifiée visuellement. Événement Solo + Duo avec résultats incomplets : bouton final désactivé, podium masqué. Journaux sans erreur ni avertissement.
- Archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Lancement natif sur PC Windows toujours à vérifier.
- 48 tests métier et compilation réussis ; nouveau test critique couvrant catégorie, résultat incomplet, ex æquo, rangs manquants, forfait et exclusion d’un rang 4. Données de l’onglet file:// utilisateur non manipulées ; actualisation manuelle nécessaire.
- Un rechargement du navigateur de test a laissé les scripts non initialisés sans erreur ; reprise dans un nouvel onglet HTTP réussie, session de test intacte. Aucun contournement du protocole file://.

---

# Saisie guidée des horaires et durées (V4.5) — 13 octobre 2026

- Champ de résultat HH:MM:SS avec insertion des séparateurs pendant la frappe, gros chiffres et clavier numérique mobile. Le curseur reste à la position de correction ; suppression arrière/avant d’un séparateur supprime le chiffre adjacent. Valeur sélectionnée à l’ouverture pour la remplacer rapidement.
- Heure d’arrivée 102300 → 10:23:00 ; temps total 010030 → 01:00:30. Quatre chiffres HHMM complètent les secondes à 00 : 0100 → 01:00:00, pas une minute. Les saisies incomplètes invitent à continuer, sans afficher une erreur dès le premier chiffre. Trop de chiffres, minutes/secondes hors limites, heure ≥24 ou durée >48h refusés, sans troncature ni écriture. Collage des unités précédemment acceptées conservé.
- QA isolée HTTP 8768 : saisies caractère par caractère 102300 et 010030, aperçus et sauvegardes corrects ; remplacement des heures au milieu du champ avec sélection clavier, curseur conservé ; Backspace sur séparateur effectif ; 0100 sauvegardé en 1h puis rechargé ; sept chiffres refusés et correction par collage 1h00min30s sauvegardée en 01:00:30. Journaux sans erreur ni avertissement. Aucun accès aux données réelles de l’onglet file://.
- Captures : aperçus/heure-guidee-v4-5.jpg et temps-guide-v4-5.jpg. L’onglet utilisateur nécessite une actualisation manuelle.
- Archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Exécution native Windows à vérifier sur le PC cible.
- 47 tests métier et compilation réussis, dont deux tests critiques pour masque/curseur et normalisation des deux modes.

---

# Saisie flexible, forfait unique et CSV final (V4.4) — 13 octobre 2026

- Un seul choix actif « Forfait ». Ancien statut abandoned lisible et affiché comme Forfait, départ historique conservé ; aucun changement des inscriptions réelles. Case du lendemain retirée du formulaire.
- Deux modes explicites et mémorisés : heure d’arrivée (`10h00`, `10:00:30`) ou temps total (`1h00min30s`, `01:00:30`). La durée calcule l’arrivée depuis le départ ; aperçu avant sauvegarde. Anciennes durées sans arrivée reprises en mode durée. Arrivées et dates anciennes conservées. Une heure avant le départ est refusée sans inventer un passage au lendemain ; saisir la durée pour une arrivée manuelle le jour suivant. Capture actuelle toujours disponible, y compris sa date.
- CSV final uniquement lorsque chaque inscription a un résultat ou un forfait. Toutes les inscriptions compatibles de la journée, indépendamment des filtres/recherche, triées par format et rang ; forfaits sans rang ni temps. UTF-8 BOM, séparateur point-virgule, guillemets et retours échappés, neutralisation des formules des champs texte.
- Podiums top 3 visibles dans Classements uniquement une fois les résultats complets ; rangs 2/1/3, noms des duos au même niveau, ex æquo de rang ≤ 3 inclus.
- QA isolée HTTP 8768 : 10h00 → 1h depuis 9h ; 1h00min30s → 10:00:30 et 01:00:30 sauvegardés. Rechargement et réouverture en mode Temps total vérifiés. Heure 08h00 depuis départ 09h15 refusée sans écriture. Nouveau participant en attente désactive CSV et masque podium, puis saisie du résultat les réactive. Capture actuelle vérifiée sans sauvegarder. Journaux sans erreur ni avertissement.
- CSV réellement téléchargé puis relu : 3 résultats classés 1/2/3 et 2 forfaits ; accents et secondes conservés. Export sous filtre HF identique octet pour octet à l’export complet. Captures aperçus/saisie-temps-v4-4.jpg et podiums-v4-4.jpg. Aucun accès aux données du fichier utilisateur ; actualisation de l’onglet file:// nécessaire.
- Archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Lancement natif Windows toujours à vérifier sur le PC cible.
- 45 tests métier et compilation réussis, dont 5 nouveaux tests : deux modes, durée après minuit/erreurs, reprise du mode, encodage CSV et export final contraignant.

---

# Photo centrée et statuts de course (V4.3) — 13 octobre 2026

- Photo : grand logo centré, événement et date complète sur leurs propres lignes, noms de même importance, un seul temps. Suppression du second temps en lettres. Trois thèmes conservés.
- Statuts `abandoned` et `withdrawn` : validations interdisant arrivée ou durée, aucun classement ni photo ; le forfait retire le départ enregistré, l’abandon conserve le départ. Inscription, noms et départ prévu conservés. Modification et annulation réversibles.
- Résultats définitifs uniquement lorsque chaque inscription de la journée, dans la famille du format sélectionné, est arrivée, abandonnée ou forfait. Les événements partageant cette journée/famille participent au contrôle, conformément au classement du jour. Toute inscription remise en attente rend le classement provisoire. Photo sans rang avant complétude, tableau et export explicitement provisoires/définitifs.
- QA HTTP 8768 isolée : photo sans rang avec un duo en attente ; abandon et forfait enregistrés, rechargés ; rang apparaît ensuite ; annulation du forfait et remise en course rendent de nouveau les résultats provisoires. Statuts exclus du classement. Export Excel réellement téléchargé et relu : Arrivé/Abandon/Forfait, résultats définitifs, aucun rang/temps/arrivée pour les non-finisseurs.
- Vérification visuelle des trois thèmes : aperçus/photo-centree-v4-3.jpg, photo-club-v4-3.jpg, photo-podium-v4-3.jpg. Géométrie mobile 390×844 : logo, noms et temps dans le cadre, hauteur de contenu 844, aucun débordement. Capture mobile du navigateur non exploitable ; aucun succès de capture native mobile revendiqué. Vue des statuts : aperçus/statuts-abandon-forfait-v4-3.jpg.
- Archives locale et Windows reconstruites ; trois tests de distribution Windows réussis. Lancement natif sur PC Windows toujours à vérifier.
- 40 tests métier passent, dont quatre nouveaux scénarios critiques sur statuts, classement provisoire/définitif, événements voisins et sauvegarde/historique. Aucun accès aux données de l’onglet utilisateur file:// ; actualisation manuelle nécessaire. Pas de modification des données réelles.

---

# Choix du format explicite et guide Excel (V4.2) — 13 octobre 2026

- Cause corrigée : Solo + Duo était présélectionné à la création. Aucun format sélectionné désormais ; radio obligatoire et contrôle explicite à la soumission. Modification d’un événement existant conserve son choix.
- Format affiché sous le titre, dans le sélecteur et dans le formulaire d’inscription ; accès « Modifier l’événement / son format ». Aucun changement automatique des événements ou participants existants.
- QA isolée sur HTTP 8768 : création sans choix bloquée ; Duo → deux noms, aucun choix Solo/Duo, filtres HH/FF/HF ; Solo → un nom, aucun sélecteur, filtres H/F ; Solo + Duo → deux choix et cinq filtres. Rechargement conserve le format. Journaux sans erreur ni avertissement.
- Guide « Format du fichier ? » adapté à la famille d’événement, colonnes et instructions ; modèle Duo téléchargé depuis l’application, relu puis présenté à l’import : trois lignes, zéro doublon, zéro erreur. Aucune importation effectuée. Copie livrée : livraison/soundcrossing-modele-duo.xlsx.
- Captures : aperçus/inscription-duo-v4-2.jpg et aperçus/guide-excel-v4-2.jpg. Aucun accès aux données du fichier utilisateur ; son onglet file:// nécessite une actualisation manuelle.
- 36 tests métier et compilation réussis ; archives reconstruites ; 3 tests de distribution Windows réussis. Le lancement natif Windows reste à vérifier sur le PC cible.

---

# Arrivée rapide et photo directe (4.1)

- Bouton « Arrivée maintenant » : capture des secondes et du jour réel, brouillon uniquement, heure modifiable. Saisie manuelle et enregistrement normal toujours disponibles. « Enregistrer + photo finish » ouvre la photo uniquement après sauvegarde réussie.
- Temps total affiché en grand ; pas de notification de sauvegarde ni de commandes visibles sur la photo. Fermeture par Échap ou coin supérieur gauche, focus et position dans le tableau rétablis après le redimensionnement du plein écran. Attente bornée à 500 ms pour une géométrie différente.
- Archives Mac/source et Windows 4.1 reconstruites ; trois tests de distribution passent. Exécution native Windows à vérifier sur le PC cible.
- 36 tests métier passent : secondes, absence de mutation lors de la capture, lendemain réel, départ futur, ancien événement, horloge invalide, nuit de changement d’heure et heure répétée ambiguë refusée. Schéma de sauvegarde V4 inchangé.
- QA isolée 8768 : duo HF ajouté pour le jour affiché ; capture de l’heure, fermeture sans sauvegarde → aucun résultat enregistré. Départ 14:00, arrivée manuelle 15:03 → 01:03:00. Bouton combiné → photo à 01:03:00 sans notification. Heure 13:00 refusée, aucune photo ouverte. Correction 15:03:30 → 01:03:30, annulation → 01:03:00.
- Le premier essai de retour plein écran remontait la liste à 0 px. Correction : attendre la restitution de la hauteur de la liste avant le défilement. Vérification finale sur photo seule et sauvegarde + photo : position 396 px avant et après Échap.
- Contrôle à 390 × 844 : formulaire complet lisible, boutons accessibles, capture pleine largeur ; document 390 px sans débordement horizontal. Vue réduite réinitialisée après l’essai. Aucun avertissement/erreur dans les journaux navigateur.
- Captures fictives : `aperçus/arrivee-rapide-v4.jpg`, `photo-apres-arrivee-v4.jpg`, `arrivee-mobile-v4.jpg`. Aucune inscription ou résultat réel modifié ; aucun accès à l’onglet file://.

---

# Contrôles complémentaires des formats

- Modèles téléchargés dans l’interface puis relus avec SheetJS : Duo HH/FF/HF uniquement (3 lignes), Solo H/F uniquement (2 lignes).
- Import du modèle Solo dans l’événement Duo : 2 erreurs explicites, 0 inscription ajoutable, bouton d’import désactivé. Aucune donnée de participant modifiée.
- Tentative de conversion d’un événement contenant des duos vers Solo : sauvegarde refusée. Message amélioré : « Des duos sont déjà inscrits à cet événement. Choisissez Solo + Duo pour les conserver. »
- Compilation et 32 tests métier réussis ; archives reconstruites ; trois tests de distribution Windows réussis. Le lancement natif Windows reste à vérifier sur le PC cible.

---

# Formats d’événement contraignants (V4) — 12 octobre 2026

- Duo : filtres HH/FF/HF uniquement, ajout directement à deux personnes, aucun sélecteur Solo/Duo. Solo : filtres H/F uniquement, une personne, aucun sélecteur. Solo + Duo : toutes les familles et choix à l’inscription.
- Liste du jour et classements limités à la famille du format sélectionné ; les autres inscriptions restent dans leur événement et ne sont pas supprimées. Les filtres masqués ne peuvent pas rester actifs après changement de format ou restauration.
- Modèles Excel adaptés et imports incompatibles refusés ; contraintes vérifiées également par validation de session et sauvegarde V4, pas seulement par masquage des boutons.
- `Race.format` remplace la préférence `defaultFormat` de V3. V1/V2/V3 restent lisibles. Un ancien événement comportant des inscriptions contraires à sa préférence est migré en Solo + Duo pour conserver chaque participant et résultat. Historiques migrés également ; format incompatible refusé pour les écritures V4.
- 32 tests métier réussis : formats stricts, imports, filtres, migration compatible et invariance HF ; trois tests de distribution Windows réussis. Anciennes sauvegardes réelles V3 relues : inscriptions, horaires, temps et historique conservés.
- Navigateur de test HTTP 8768 : vérification des trois interfaces ; inscription d’un duo HF réussie dans un événement Duo ; journaux sans erreur ni avertissement. Captures : `aperçus/filtres-duo-v4.jpg` et `aperçus/inscription-duo-v4.jpg`.
- L’onglet utilisateur ouvert via file:// n’a pas été manipulé : le navigateur a refusé ce protocole pour l’automatisation. Aucune tentative de contournement. Les fichiers de l’application sont mis à jour ; actualisation manuelle de cet onglet nécessaire. Aucun accès ou reset de ses données effectué.
- Archives Mac/source et Windows reconstruites avec les règles V4. Premier lancement Windows reste à vérifier sur le PC cible.

---

# Inscription Solo/Duo et boutons H/F — 12 octobre 2026

- Événement : nouveau format d’inscription par défaut Solo / Duo / Solo + Duo (`defaultFormat`). Persisté dans les sauvegardes et l’historique ; MIXED pour les anciennes données. Préremplit le formulaire sans restreindre les autres formats ou imports dans la journée.
- Inscription : H/F au-dessus de chaque nom, choix exclusif rouge, participant 2 visible en Duo. Deux colonnes de même taille sur ordinateur, empilement sur mobile. Catégorie calculée, aucun choix HH/FF/HF supplémentaire. `gender1`/`gender2` sauvegardés ; aucun genre n’est attribué d’après le nom.
- Libellé final : **HF** pour H + F et F + H, dans formulaire, liste, filtres, classement, photo et Excel. Anciennes catégories HF intactes. Les anciens mixtes sans ordre connu gardent leurs boutons H/F non sélectionnés jusqu’à modification explicite.
- 30 tests métier passent, dont les deux ordres mixtes, H/H, F/F, solos H/F, choix incomplet refusé, cohérence catégorie/personnes, anciennes sauvegardes, format par défaut et imports compatibles.
- Parcours navigateur isolé 8768 : événement Duo → Duo prérempli, F1/H2 enregistrés et conservés après rechargement ; H1/F2 inscrit ensuite ; H/F manquant pour participant 2 refusé avec message explicite. Deux résultats dans le même classement HF : H1/F2 1 h rang 1, F1/H2 1 h 03 rang 2. Un événement Solo préremplit Solo et cache le second participant ; F1 donne Solo F. Excel téléchargé et relu : catégorie HF dans les deux lignes et champs H/F par personne corrects.
- Capture `aperçus/inscription-hf-v3.jpg` : exemple fictif, F1/H2 sélectionnés en rouge, format Duo HF. Capture `aperçus/evenement-format-v3.jpg` : choix du format dans l’événement.
- Session réelle exportée dans `sauvegardes/avant-boutons-hf.json` avant rechargement. La liste avait été vidée par l’utilisateur dans l’interface : aucun ancien participant réinséré. Deux événements et l’historique conservés ; comparaison des noms, horaires, durées, catégories et liens d’événement de chaque instantané avant/après validation réussie. Saisie en cours préservée lors de l’actualisation finale.
- Archives Mac/source et Windows reconstruites avec le libellé HF final et les nouveaux boutons. Trois tests de distribution Windows passent ; premier lancement Windows reste à vérifier sur le PC cible, comme indiqué dans le guide.

---

# Distribution Windows autonome — 12 octobre 2026

- Livrable : `livraison/Soundcrossing-Windows-x64.zip` (12 730 286 octets, environ 12,7 Mo). Destiné à Windows 10/11 Intel/AMD 64 bits. Aucun participant inclus.
- Python 3.14.8 embarquable AMD64 téléchargé depuis la distribution officielle python.org ; SHA-256 `a93abe456ab01bd96d7a085b3cdb6566b3063f4241360d114142fbdb07f0a310` conforme à la page de release. Runtime, DLLs, licence et configuration isolée inclus sans modification. Cache local exclu du versionnement et de l’accès HTTP.
- Lanceur Windows : priorité au binaire `runtime/python.exe` en mode isolé. Pas de dépendance au PATH, à un Python installé ou au gestionnaire Python Windows dans l’archive autonome. Le programme s’utilise par décompression complète puis double-clic sur `Lancer Soundcrossing.bat` ; fenêtre de lancement à garder ouverte. Pas d’installateur système ni d’exécutable Soundcrossing compilé.
- Trois tests de distribution passent : intégrité de chaque fichier du runtime comparée au ZIP officiel, format PE x64 et modules standard requis ; absence de sauvegardes/sources/dépendances de développement ; serveur réellement lancé depuis un dossier extrait avec espaces et accents, ressources HTTP 200 et fichiers internes HTTP 404. Test exécuté sur Mac avec son interpréteur, sans toucher au serveur 8767 ou aux données réelles.
- Les 27 tests métier passent encore. L’archive Mac/source est reconstruite avec le guide Windows ; l’aide des Paramètres distingue la distribution Windows autonome du lanceur Mac nécessitant Python installé.
- Guide simple fourni dans l’archive en `LISEZ-MOI.txt`, compatible Bloc-notes. Provenance du runtime et limite de validation dans `DISTRIBUTION.json`.
- **Non vérifié :** exécution du binaire Windows, ouverture du navigateur et premier lancement sur un PC Windows réel. Aucun Wine ou ordinateur Windows disponible dans cette session. Aucun succès Windows n’est revendiqué ; faire cette vérification sur le PC de la salle.

---

# Validation V3 — Soundcrossing, 12 octobre 2026

- Compilation TypeScript stricte et 27 tests métier réussis : départ/arrivée, minuit explicite, secondes, formats, import de cinq formats dans un événement, doublons, classement par catégorie/date, ex æquo, migrations V1/V2/V3, préférences photo.
- Navigateur isolé sur 8768 : exemple mixte de 6 départs ; ajout de Claire Test en Solo F à 08:45, arrivée à 09:39:30 → 00:54:30 ; classement séparé par chacun des cinq formats. HH : Hugo/Tom 57 min rang 1, Jules/Paul 61 min rang 2. Boutons de formats, arrivées à saisir et retour au tri par départ vérifiés.
- Modèle Excel téléchargé puis réimporté dans l’interface : cinq formats reconnus, 4 nouvelles vagues acceptées, 1 doublon ignoré, 0 erreur. Import appliqué puis annulé : retour aux 7 inscriptions de test.
- Préférences photo conservées après rechargement ; photos Club, Épuré et Podium inspectées. Deux noms du duo au même niveau, aucun bandeau de commandes, sortie par Échap et bouton invisible du coin supérieur gauche vérifiées. Le plein écran du navigateur dépend de sa prise en charge ; la photo couvre toujours la page.
- Capture et contrôle à 390 × 844 : date visible en grand, ajout flottant, navigation sans barre latérale. Largeur de document 390 px pour viewport 390 px ; le tableau garde son défilement interne horizontal. Un rechargement pendant le changement de viewport a interrompu le chargement des scripts dans l’outil de navigateur ; un nouvel onglet a chargé la même session correctement. Pas de perte de données observée.
- Sauvegarde/restauration par Paramètres testée sur l’origine isolée : 7 inscriptions, 6 résultats et modèle Podium conservés. Journal navigateur sans erreur ni avertissement lors des parcours de test.
- Session réelle sauvegardée avant migration dans `sauvegardes/avant-evenement-v3.json` (hors distribution). Après mise à jour, export `sauvegardes/session-soundcrossing-v3.json` relu : 4 inscriptions, tous les noms, horaires, temps, statuts et les 15 instantanés d’historique identiques. Trois anciennes courses regroupées en un événement du jour ; seuls les liens d’événement changent. Solos sans catégorie conservés comme « à préciser ».
- Serveur 8767 redémarré et interface réelle rechargée : logo HTTP 200, sources internes HTTP 404, lancement répété reconnaît le serveur déjà actif. Programme laissé ouvert pour l’utilisateur.
- Archive `livraison/Soundcrossing.zip` validée : 14 fichiers de runtime, licence et provenance du logo, aucun participant ou fichier de développement, intégrité ZIP et permission exécutable du lanceur Mac vérifiées. Syntaxe des lanceurs Mac vérifiée ; Windows non exécuté sur ce Mac. Python 3 requis et documenté dans `DEMARRER.md`.
- Preuves visuelles : `aperçus/soundcrossing-v3.jpg`, `photo-club-v3.jpg`, `photo-blanc-v3.jpg`, `photo-podium-v3.jpg`, `mobile-v3.jpg`. Données fictives uniquement dans les captures photo/mobile.

---

# Validation — 12 octobre 2026

## V2 — heures de départ / arrivée et classement

- Compilation stricte et 25 tests réussis : calcul des horaires avec secondes, arrivée le lendemain explicite, cohérence des résultats sauvegardés, migration, doublons, classement de cinq résultats, ex æquo et séparation Solo / HH / FF / HF par date.
- Parcours vérifiés sur une origine locale isolée pour préserver les données de l’utilisateur : création d’une course avant les inscriptions, format fixé au niveau de la course, import de cinq duos HH avec noms et départs uniquement, puis saisie des cinq arrivées.
- Classement obtenu : 55 min, 58 min, 1 h, 1 h 03 min, 1 h 08 min, rangs 1 à 5. Le format FF ne récupère aucun de ces résultats HH.
- Correction d’une arrivée : nouveau meilleur temps à 50 min, passage au rang 1. Annulation : classement précédent rétabli.
- Départ 23:40 et arrivée 00:43 : refus sans indication de lendemain, résultat 1 h 03 min avec cette indication. Correction du départ à 23:30 : résultat recalculé à 1 h 13 min.
- Export Excel réellement téléchargé et relu : cinq résultats, rangs 1 à 5, colonnes de départ, arrivée et temps total cohérentes.
- Aucun champ de dossard ni de temps final dans l’inscription ; aucun élément de chrono défilant dans l’interface. Les noms des deux membres d’un duo ont la même taille et le même poids visuel.
- Session utilisateur rechargée sur son adresse habituelle après export d’une sauvegarde : quatre inscriptions, trois courses et trois anciens résultats préservés. Les noms, identifiants, départs enregistrés, durées et statuts existants ont été comparés avec la sauvegarde précédente. Les arrivées inconnues restent vides.
- Console sans erreur lors du contrôle final. Capture du classement fictif : `aperçus/classement-hh-v2.jpg`.

Les tests d’interface sont effectués dans le navigateur Codex ; aucune course réelle ni validation sur appareil mobile physique. Le classement porte sur les courses du format et du jour sélectionnés, pas sur des dates différentes. La sauvegarde indépendante reste nécessaire pour récupérer les données après suppression du stockage du navigateur.

## Historique — validation V1

## Résultat vérifié

- Compilation TypeScript stricte réussie.
- 13 tests métier réussis : durées, heures Excel, reprise après rechargement / passage de minuit, résultats figés, solos / duos, états incohérents, doublons, import, sauvegarde et aller-retour Excel / CSV avec accents et zéros initiaux.
- Application servie en HTTP local : réponse 200 sur `127.0.0.1:8767`.
- Parcours vérifiés dans le navigateur Codex : liste d’exemple (6 départs / 9 athlètes), arrivée et écran photo plein écran, commandes masquées et retour par Échap, ajout manuel d’un duo HF avec temps `1h03min`, annulation de cet ajout, rechargement avec conservation de la liste et du chrono actif.
- CSV vérifié dans l’interface : un doublon ignoré et un duo ajouté avec son temps final. Annulation de l’import vérifiée. Duo incomplet : message d’erreur et confirmation d’import désactivée.
- Modèle `.xlsx` réellement téléchargé puis réimporté : en-têtes reconnus, trois doublons détectés, aucune erreur.
- Sauvegarde `.json` réellement téléchargée, nouvelle session créée, puis restauration : six départs retrouvés, résultats et départ du chrono actif conservés.
- Affichage contrôlé à 390 × 844 : création, tableau horizontal, focus chrono et accès à sauvegarde / restauration / nouvelle session / aide.
- Aucun avertissement ou erreur dans la console lors du contrôle final.

## État livré

Liste vide prête à accueillir les données réelles. Exemple accessible via le bouton de test. Fichiers compilés fournis, aucune installation de dépendance nécessaire pour utiliser l’app sur ce Mac. Captures dans `aperçus/` ; `photo-finish-demo.jpg` présente des noms et temps fictifs.

## Limites de cette validation

Contrôles effectués dans le navigateur Codex ; pas de validation sur appareil mobile physique ou sur tous les navigateurs. Pas de session de course réelle, de chronométrage officiel, de test sur 3 000 départs en simultané ni de simulation de quota de stockage rempli. Le chrono dépend de l’horloge du Mac. La suppression des données du navigateur nécessite une sauvegarde indépendante pour récupérer la session.
