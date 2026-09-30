# Bêta Android connectée — préparation, pas lancement public

Le dossier `native-server` fournit les routes attendues par `mobile`. Le serveur historique à la racine reste indépendant. Les comptes et soldes de cette bêta ne sont PAS ceux du site ChatGPT. Le garage reste local au téléphone.

## Hébergement à préparer après vérification du service Render existant

Créer un service séparé pour éviter de casser l’API historique. Réglages :

- Dépôt : Gaalster/cardrive-api ; branche : android-preview.
- Root Directory : native-server.
- Runtime : Node ; NODE_VERSION : 24.19.0.
- Build Command : npm ci ; Start Command : npm start.
- Health Check Path : /health (doit renvoyer service: cardrive-native, version: 1).
- Une seule instance. SQLite nécessite un disque persistant monté sur /var/data ; DATABASE_PATH=/var/data/cardrive.sqlite. Render facture les services avec disque : vérifier le tarif avant création. Sans disque, les comptes disparaissent aux redéploiements.
- ENABLE_PAYMENTS=false. Ne pas renseigner Stripe pour cette étape.
- ANTHROPIC_API_KEY : saisir la clé dans les variables secrètes du serveur seulement.
- ANTHROPIC_MODEL : modèle disponible pour le compte Anthropic.
- PUBLIC_URL : origine HTTPS du nouveau service.

Documentation : https://render.com/docs/disks et https://render.com/docs/configure-environment-variables

## APK connecté (seulement après serveur disponible)

1. Expo > projet CarDriveTCG > Environment variables : environnement Preview, EXPO_PUBLIC_API_URL = origine HTTPS du nouveau serveur, sans chemin. Cette URL est publique, aucune clé secrète dans EXPO_PUBLIC_*.
2. Build from GitHub : branche android-preview ; dossier mobile ; Android ; profil connected-preview ; environnement Preview ; soumission automatique désactivée.
3. Installer l’APK, créer un compte via la boutique, prendre une photo identifiable : reconnaissance réelle et compteur de 5 à 4.
4. Tester photo non identifiable : aucun débit. Fermer/rouvrir et se reconnecter : même solde. Tester sans réseau : erreur lisible.
5. Vérifier le solde après redémarrage du serveur. En cas de délai dépassé, actualiser le compte avant de recommencer.

## Avant une bêta publique / Google Play

Ce serveur est un socle pour tests privés. Il reste notamment : protection contre création abusive de comptes, récupération et vérification d’email, suppression de compte, sauvegarde/restauration SQLite testée, débit idempotent en cas de reprise réseau, limites adaptées au proxy, synchronisation du garage, raccordement support, politique de confidentialité et identité légale. Les notifications sociales ne sont pas encore intégrées.

Les achats sont bloqués côté serveur et APK. Ne pas activer ENABLE_PAYMENTS avant séparation test/production, validation des webhooks et du cycle complet abonnement/remboursement, puis choix d’une intégration de paiement conforme au canal de distribution Android. Le profil production reste bloqué volontairement.
