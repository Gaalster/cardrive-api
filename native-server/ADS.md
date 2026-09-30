# Publicités Android

État : SDK installé avec identifiants Google de TEST. Bannière pour compte gratuit connecté, hors caméra. Vidéo facultative dans Boutique. Aucun crédit réel pour une vidéo de démonstration. Les comptes Premium ne montent pas ces composants.

Le consentement UMP précède l’initialisation du SDK. En cas d’absence de consentement permettant les requêtes ou d’erreur, aucune publicité n’est chargée. L’utilisateur peut revoir ses choix dans la boutique. Tester sur APK physique ; l’export JS seul ne valide pas la compilation native.

## Activation réelle (pas encore faite)

1. Créer l’application Android com.gaalster.cardrivetcg dans AdMob et configurer le message de confidentialité UMP.
2. Fournir les identifiants PUBLICS application (~), bannière (/) et récompense (/). Aucune clé secrète nécessaire.
3. Configurer la récompense du bloc vidéo : quantité 1 ; nom scan. Callback SSV : https://cardrive-native.onrender.com/ads/ssv.
4. Définir ADMOB_REWARDED_UNIT_ID sur Render. Le serveur crée un ticket lié au compte ; il vérifie la signature ECDSA Google, le bloc, la récompense et l’unicité avant d’ajouter 1 crédit.
5. Remplacer l’App ID Google de test dans app.json. Configurer EXPO_PUBLIC_ADMOB_BANNER_ID. Retirer le blocage explicite des annonces réelles dans app.config.js uniquement après contrôle de ces paramètres et du consentement, puis définir EXPO_PUBLIC_ADS_LIVE=true pour la build dédiée.
6. Valider les callbacks avec les outils AdMob : valide +1, doublon +0, signature invalide +0, vidéo interrompue +0. Le client ne crédite jamais lui-même le compte. Actualiser le solde après réception.
7. Vérifier les écrans avec annonce, sans annonce disponible, hors réseau, refus/modification du consentement, compte Pass. Actualiser les déclarations de confidentialité et de publicité Google Play avant diffusion publique.

Limites : le serveur Render gratuit peut dormir et perdre sa base lors d’un redéploiement. Ne pas activer la monétisation publique avant hébergement durable et validation complète. Les vidéos TEST ne prouvent pas une récompense serveur réelle. Aucun revenu ne doit être annoncé avant activation AdMob.
