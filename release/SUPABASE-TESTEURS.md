# Supabase gratuit — testeurs CarDrive

## État vérifié
Le serveur prend en charge Supabase Postgres. Les 18 tests locaux réussissent, dont les accès refusés aux rôles publics, les quotas, la conservation des sessions après redémarrage, la suppression, le support et les récompenses publicitaires signées. Ces tests ne remplacent pas la vérification du projet cloud.
Le 5 octobre 2026, la connexion Supabase voit l’organisation CarDriveTCG mais aucun projet. Aucun service payant créé et aucune bascule du serveur actuel effectuée.

## 1. Créer la base
Créer un projet dans CarDriveTCG sur l’offre Free et choisir une région européenne disponible. Vérifier le coût avant création. Appliquer le script `native-server/supabase/001_cardrive.sql` via la migration Supabase. Le script ne supprime pas les données existantes.
Les comptes utilisent l’authentification CarDrive du serveur, pas Supabase Auth. Les tables sont privées ; seule la clé serveur peut appeler la fonction SQL. Ne jamais donner un accès public à cette fonction.

## 2. Préserver les données actuelles
Avant tout redéploiement Render, récupérer la base SQLite existante depuis le service en cours. Un redéploiement du service gratuit peut la perdre. Ne pas changer de branche avant cette récupération ou une décision explicite de repartir avec des comptes de test neufs.
L’import des anciens comptes/crédits n’est pas automatique. Les historiques Stripe ne sont pas pris en charge par cette version Supabase destinée aux tests gratuits. Aucun historique de paiement ne doit être effacé pour faciliter la migration.

## 3. Configurer le serveur
Dans Render > cardrive-native > Environment, ajouter :

| Variable | Valeur |
| --- | --- |
| DATABASE_DRIVER | supabase |
| SUPABASE_URL | URL HTTPS du projet Supabase |
| SUPABASE_SECRET_KEY | nouvelle clé serveur commençant par sb_secret_ |
| ENABLE_PAYMENTS | false |
| PUBLIC_URL | https://cardrive-native.onrender.com |

La clé reste exclusivement dans Render. Ne pas la mettre dans Expo, le code, une capture ou un message. Une clé publique ne fonctionne pas. Conserver les variables IA existantes.
Après préservation des données, déployer la branche play-release-prep, dossier native-server, Node 24, installation npm ci, démarrage npm start.
Le serveur refuse de démarrer si Supabase est mal configuré ; il ne revient pas silencieusement à SQLite.

## 4. Vérifier en ligne
- GET /health doit répondre avec database: supabase.
- Créer un compte de test : 5 scans gratuits ; un scan réussi en retire 1.
- Redémarrer Render, se reconnecter : compte et solde conservés.
- Créer puis supprimer un compte jetable ; sa session et sa reconnexion doivent être refusées.
- Créer le compte éditeur et relever son UUID depuis la base de façon privée. Définir SUPPORT_ADMIN_ACCOUNT_ID dans Render pour activer la réception du support.
- Ouvrir /support, créer un ticket, répondre depuis /support-admin et lire la réponse avec le lien privé.
- Tester une sauvegarde et sa restauration avant d’ouvrir les tests à tous.

## 5. Google Play
Suivre GOOGLE-PLAY.md pour générer l’AAB avec le profil play-internal et l’importer en test interne. Ce profil désactive achats et publicités. Les scans IA restent facturés par le fournisseur IA même avec un hébergement gratuit.
Le garage et les photos restent sur le téléphone : cette migration concerne comptes, sessions, crédits et support.
