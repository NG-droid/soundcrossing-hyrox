# Soundcrossing — départ, arrivée, résultats

## Windows : version autonome recommandée

Utilisez `Soundcrossing-Windows-x64.zip` pour un PC Windows 10/11 Intel ou AMD 64 bits. Clic droit → Extraire tout → ouvrir le dossier Soundcrossing → double-cliquer `Lancer Soundcrossing.bat`. Python est inclus : aucune installation séparée et aucun accès Internet nécessaires. Gardez la fenêtre de lancement ouverte. Guide dédié : [WINDOWS.md](WINDOWS.md). Le paquet est préparé et contrôlé sur Mac ; son lancement Windows reste à tester sur le PC de la salle.

## Autre archive : version Mac / source avec Python installé

1. Décompressez entièrement `Soundcrossing.zip` dans un dossier que vous garderez. Ne lancez pas directement depuis le ZIP.
2. Python 3 est nécessaire. S’il est absent, installez-le depuis [python.org](https://www.python.org/downloads/). Sur Windows, cochez « Add Python to PATH ».
3. **Mac :** double-cliquez `Lancer Soundcrossing.command`. **Windows :** double-cliquez `Lancer Soundcrossing.bat`.
4. Le navigateur s’ouvre sur `http://127.0.0.1:8767/`. Gardez la fenêtre de lancement ouverte. Fermer cette fenêtre arrête l’application ; les inscriptions restent enregistrées.

Pour les prochaines utilisations, le même double-clic suffit. Le fonctionnement est hors connexion, une fois Python installé. La version Mac a été vérifiée ici ; le lanceur Windows est fourni mais n’a pas été exécuté sur Windows.

Si le navigateur ne s’ouvre pas, copiez `http://127.0.0.1:8767/` dans sa barre d’adresse. Utilisez toujours la même adresse, le même navigateur et le même profil. `localhost` et `127.0.0.1` correspondent à deux espaces de stockage distincts.

## Pendant l’événement

- Créez l’événement avec son nom, sa date et le format de l’événement : Solo, Duo ou Solo + Duo. Un événement Solo accepte uniquement des solos ; un événement Duo uniquement des duos ; Solo + Duo accepte les deux.
- « Ajouter un participant » est disponible à côté de la liste et en bas à droite, même après défilement.
- Le format est fixé par l’événement. Pour Solo + Duo, choisissez Solo ou Duo à l’inscription. Cliquez sur **H** ou **F** au-dessus du nom de chaque personne. Le bouton choisi devient rouge. La catégorie se calcule automatiquement : Solo H/F, Duo HH/FF ou **HF** pour un mixte. F + H et H + F donnent le même format HF. Les deux noms restent affichés au même niveau.
- Renseignez le départ ; saisissez l’arrivée séparément après la course. Choisissez le sélecteur Heure d’arrivée ou les parties heures / minutes / secondes du Temps total. « Arrivée maintenant » remplit l’heure actuelle en mode arrivée, sans enregistrer tout seul. Vérifiez les horaires calculés puis choisissez « Enregistrer le résultat » ou « Enregistrer + photo finish ».
- Tous les participants de la date sélectionnée apparaissent ensemble, dans l’ordre de départ. Les boutons de format et « Arrivées à saisir » filtrent rapidement la liste. Un événement Duo affiche seulement HH/FF/HF ; Solo affiche H/F ; Solo + Duo affiche tous les formats.
- L’onglet Classements présente un classement séparé pour chaque format. Les ex æquo partagent leur rang (1, 2, 2, 4).
- Paramètres → Photo finish : choisissez **Club**, **Épuré** ou **Podium**. « Photo finish » ouvre un résultat sans boutons visibles. Échap ou le coin supérieur gauche permet de revenir au tableau à la même position.

## Résultats, forfait et classement

Ouvrez **Saisir le résultat**. **Heure d’arrivée** utilise le même sélecteur horaire que **Heure de départ** : heures, minutes et secondes se règlent directement, sans saisir les séparateurs. **Temps total** présente trois parties, heures / minutes / secondes, dans un champ de même style. Par exemple 1 heure, 0 minute, 30 secondes donne 01:00:30 ; l’arrivée est calculée depuis le départ. Les heures peuvent aller jusqu’à 48 pour préserver les anciennes durées. Vérifiez l’aperçu puis enregistrez. « Arrivée maintenant » remplit le sélecteur d’arrivée sans enregistrer tout seul. Aucune case « après minuit » : pour une arrivée manuelle le jour suivant, utilisez le temps total.

**Forfait** conserve l’inscription sans temps ni rang. **Modifier le statut → Remettre en course** corrige ce choix ; **Annuler** rétablit la dernière modification. Un résultat déjà enregistré n’est retiré qu’après confirmation. Les anciens abandons restent conservés et s’affichent comme forfaits.

Les classements restent **provisoires** tant qu’une inscription attend son arrivée. Ils deviennent **définitifs** lorsque toutes les inscriptions affichées pour la journée et les formats de l’événement ont un résultat ou un forfait. La photo n’affiche aucun rang avant cela. Les nouvelles inscriptions ou remises en course rendent à nouveau les résultats provisoires.

Les trois modèles photo placent au centre le logo, le nom de l’événement, sa date complète, les participants et un seul temps en gros.

## Où sont les données ?

Les inscriptions, horaires, résultats, préférences et les 15 dernières modifications sont enregistrés automatiquement dans le **stockage du navigateur sur cet ordinateur**. Ils ne sont pas enregistrés dans le dossier du programme ou dans le ZIP. Aucun compte et aucune connexion internet ne sont nécessaires.

Fermer puis rouvrir l’application conserve ces données. En revanche, effacer les données du navigateur, utiliser un autre profil ou la navigation privée peut les rendre indisponibles. Le mode privé ne convient pas à une journée de course.

**Après chaque événement : Paramètres → Sauvegarder un fichier.** Gardez ce fichier JSON dans un endroit sûr. Les fichiers Excel servent à la liste et aux résultats ; le JSON conserve toute la session, les événements, les préférences et l’historique.

## Changer d’ordinateur ou de navigateur

1. Sur l’ancien ordinateur : Paramètres → Sauvegarder un fichier.
2. Copiez le dossier décompressé du programme et la sauvegarde JSON.
3. Lancez le programme sur le nouvel ordinateur.
4. Paramètres → Restaurer un fichier → choisissez votre JSON et confirmez. Une sauvegarde de la session déjà présente est téléchargée avant le remplacement.

Copier seulement le dossier du programme ne copie pas les participants.

Un nouvel événement demande un choix explicite : aucun format n’est présélectionné. Le format actuel est affiché sous son nom et dans l’inscription. Pour corriger un événement existant : **crayon près du nom → Duo, Solo ou Solo + Duo → Enregistrer**. Les inscriptions déjà présentes sont conservées ; un changement incompatible est refusé.

## Excel

Dans **Paramètres → Fichiers de l’événement**, « Modèle Excel » fournit les colonnes **Format**, **Participant 1**, **Participant 2**, **Heure de départ**. « Format du fichier » affiche un exemple et les consignes dans l’application. Le modèle est adapté au format de l’événement : trois exemples Duo HH/FF/HF, deux exemples Solo H/F ou les cinq pour Solo + Duo. Remplacez ces exemples par vos inscriptions, une ligne par solo ou duo. Gardez les en-têtes en première ligne, sans titre au-dessus. Noms et prénoms dans la même cellule ; Participant 2 vide pour un solo. Départ au format 09:00 ou 09:00:30. Aucun dossard ni résultat à renseigner dans ce fichier. Un fichier Solo + Duo peut contenir tous les formats ; un import contenant un solo dans un événement Duo (ou l’inverse) est refusé. Importer → vérifier les correspondances et les lignes → Ajouter. Les formats abrégés H/F/HH/FF/HF sont également acceptés. Un format absent doit être corrigé avant l’import ; les doublons de même format, mêmes noms et même départ sont ignorés.

Les anciens solos sans catégorie sont conservés sous « Solo à préciser ». Modifiez l’inscription pour choisir H ou F. Les anciens temps finaux sont conservés sans inventer d’heure d’arrivée.

## Export final et podiums

Quand chaque inscription a un résultat ou un forfait, le bouton **Paramètres → CSV final** devient disponible. Le fichier contient tous les résultats et forfaits de la journée pour les formats de l’événement, même si une recherche ou un filtre est actif. Rang par format, noms, départ, arrivée, temps total, statut, événement et dates ; encodage UTF-8 avec accents, séparateur point-virgule pour Excel. Le CSV contient les données, sans mise en page.

Dans **Classements**, chaque format possède son classement. Le podium final devient disponible dès que les résultats sont complets. Les ex æquo partagent la même place.

**Top 3 final**, sous le tableau, ouvre le choix de catégorie, puis un podium en plein écran avec logo, événement, date, noms et temps. Si une catégorie est déjà filtrée, son podium s’ouvre directement. Le premier est au centre sur la marche la plus haute. Les forfaits ne figurent pas sur le podium ; les ex æquo sont conservés et les places sans résultat ne sont pas attribuées.

**Une seule pression sur Échap** ferme la photo ou le podium et revient directement au tableau à la même position. Sur tactile, touchez le coin supérieur gauche. Le bouton du podium final reste indisponible tant qu’une inscription attend son résultat.
