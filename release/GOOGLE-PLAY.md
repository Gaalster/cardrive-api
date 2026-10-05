# CarDrive TCG — préparation Google Play

Éditeur choisi : Kévin de Oliveira (Gaalster). Application : com.gaalster.cardrivetcg.
État : préparation technique, pas encore publiée ni prête pour une ouverture publique.

## Modifications prêtes
- Suppression Android avec mot de passe et confirmation SUPPRIMER ; effacement des données locales.
- Page publique du serveur /delete-account : connexion au compte Android puis suppression, sans ChatGPT.
- Support public /support : création de ticket, lien secret de suivi et réponse consultable. Aucun e-mail envoyé.
- Administration /support-admin : compte Android explicitement autorisé via SUPPORT_ADMIN_ACCOUNT_ID.
- Tickets supprimés à 90 jours lors de l'accès au service ou au démarrage.
- Profil Expo play-internal : AAB signé pour Google Play, service réel, achats désactivés, publicités désactivées pour cette version. Les profils de test précédents restent disponibles.
- Parcours boutique nettoyé : plus de gestion Stripe affichée lorsque les achats natifs sont désactivés.

## Blocage avant déploiement du serveur
Render Free perd sa base SQLite locale lors des redéploiements/redémarrages. Ne pas changer la branche du service actuel sans plan de conservation ou accord explicite de réinitialisation des comptes de test.
Deux solutions : service avec disque persistant (payant), ou migration vers une base externe durable (nécessite un compte de base de données et une adaptation du code).
Aucune ressource payante n'a été créée.

Configuration du serveur après choix du stockage :
- PUBLIC_URL=https://cardrive-native.onrender.com
- ENABLE_PAYMENTS=false
- DATABASE_PATH : chemin de la base sur le stockage persistant réel ; une variable seule ne crée pas de disque.
- SUPPORT_ADMIN_ACCOUNT_ID : UUID du compte Android de l'éditeur, relevé de manière privée depuis la base. Ne pas publier cet identifiant dans l'app et ne pas utiliser une valeur client comme autorisation.
Sans administrateur configuré, les nouvelles demandes de support reçoivent une erreur explicite plutôt qu'être acceptées sans destinataire.
Les comptes avec un historique Stripe sont orientés vers le support : ne jamais effacer silencieusement des obligations financières ou un abonnement actif.

## Validation avant test fermé
1. Vérifier que le compte et les crédits survivent à un redémarrage et un déploiement.
2. Vérifier sauvegarde/restauration sur un environnement de test et traiter la suppression dans les sauvegardes.
3. Tester création de compte, connexion, scan réussi/échoué, quota du jour et redémarrage de l'app.
4. Créer un compte jetable : suppression depuis l'app puis depuis /delete-account ; reconnexion refusée et autres comptes inchangés.
5. Créer un ticket anonyme, répondre via /support-admin, vérifier la réponse avec le lien privé. Tester une fausse clé : accès refusé.
6. Finaliser confidentialité : lien vers le nouveau support, suppression, durées effectives, prestataires/transferts vérifiés. La page publique actuelle décrit encore la bêta précédente.
7. Préparer une adresse de contact développeur pour la fiche Google Play ; le formulaire de support ne remplace pas tous les champs demandés par Google.

## Génération du fichier
Une fois le serveur déployé et les tests ci-dessus effectués : Expo > Build from GitHub > branche play-release-prep > dossier mobile (minuscules) > Android > profil play-internal > environnement Preview. Laisser la soumission automatique désactivée.
Le profil produit un .aab, pas un APK installable directement. Il doit être importé dans Google Play Console, canal test interne d'abord. Le build EAS distant n'a pas été lancé par cette préparation.
Le profil production conserve son verrou : son activation exige encore la clôture des points ci-dessus. Le nouveau profil n'autorise pas les achats ni les publicités réelles.

## Fiche proposée (à relire)
Nom : CarDrive TCG
Description courte : Photographiez des voitures et créez votre collection de cartes automobiles.
Description :
Avec CarDrive TCG, transformez vos découvertes automobiles en cartes à collectionner. Photographiez un véhicule, lancez son identification par intelligence artificielle et enrichissez votre garage personnel.
Cinq scans gratuits sont disponibles chaque jour. La reconnaissance nécessite une connexion internet et un compte CarDrive. Les résultats de l'IA peuvent comporter des erreurs. Le garage est conservé sur votre appareil et n'est pas encore synchronisé entre appareils.
Cette première version ne propose pas d'achat intégré.

Visuels à fournir : captures réelles du compte, de la caméra, d'un résultat et du garage ; icône et visuel de présentation conformes aux formats affichés par Play Console. Ne pas présenter le social/synchronisation comme disponibles.
Déclarations Données : compte (email), photos transmises à Anthropic, identifiants/authentification et données de fonctionnement. Vérifier le comportement effectif du SDK AdMob embarqué même si l'interface de cette version est désactivée. Ne pas déclarer « aucune donnée collectée ».

## Accès et publication
Se connecter à Google Play Console et terminer identité, informations développeur, fiche, sécurité des données, classification et accès pour les examinateurs. Un compte d'examen et des instructions de connexion doivent être préparés, jamais commis au dépôt.
Si le compte personnel est soumis à l'exigence 12 testeurs / 14 jours, lancer ensuite le test fermé Google Play et conserver les retours. Un APK Expo installé manuellement ne remplace pas ce test.
La production nécessite une demande puis l'acceptation de Google ; aucun délai de publication garanti.

Sources vérifiées :
https://support.google.com/googleplay/android-developer/answer/14151465?hl=fr
https://support.google.com/googleplay/android-developer/answer/13327111?hl=fr
https://docs.expo.dev/build/eas-json/
https://render.com/docs/free
