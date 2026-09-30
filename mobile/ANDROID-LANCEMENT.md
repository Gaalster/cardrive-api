# CarDrive Android — test 0.3.0
Éditeur affiché : Gaalster. Identifiant proposé : com.gaalster.cardrivetcg.

## Préparé
Caméra native, garage, cartes et boutique de démonstration. Profil EAS preview au format APK, nom CarDrive Test, microphone bloqué, accès au support web dans le navigateur. Aucune clé secrète dans le téléphone.

## Limites
Les photos ne sont pas réellement analysées dans cette version Android. Les crédits et achats sont fictifs. Le compte local Android n'est pas relié au compte web. Le support nécessite la connexion au site privé. Cette archive contient le code, pas un APK compilé.

## Compilation (compte Expo nécessaire)
Dans ce dossier sur un ordinateur :
```
npm ci
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```
Le projet est configuré avec le projectId fourni : 37b2d75f-2653-4456-8652-d184308cc60e. Se connecter au compte propriétaire ; les droits et le slug doivent encore être vérifiés auprès d’Expo. Pour le premier build, EAS peut générer la signature Android ; conserver celle-ci pour les futures mises à jour. Les frais éventuels dépendent de l'offre Expo.

Ouvrir ensuite le lien de compilation depuis Android et télécharger l'APK. Autoriser ponctuellement l'installation depuis le navigateur. Après installation, aucun PC allumé ni Expo Go n'est nécessaire.

## Test téléphone
1. Vérifier le bandeau DÉMO.
2. Refuser puis autoriser la caméra.
3. Prendre une photo et créer une carte démo.
4. Fermer et rouvrir : vérifier la conservation du garage.
5. Simuler une recharge et vérifier le solde fictif.
6. Ouvrir le support dans le navigateur.

## Avant publication réelle
- Relier Android à l'identité web : le site utilise une identité fournie par son hébergement, alors que le client natif attend un jeton Bearer. Les deux ne sont pas interchangeables.
- Utiliser le même serveur pour crédits, reconnaissance et abonnements ; reprise sans double débit.
- Intégrer les achats numériques Google Play ou un programme alternatif applicable. Stripe web seul n'établit pas la conformité Google Play.
- Finaliser confidentialité, suppression de compte, identité de l'éditeur et support.
- Tester les fonctions réelles sur appareil, compiler l'AAB puis utiliser la piste de test Google Play.

Le profil production est bloqué dans app.config.js jusqu'à la réalisation de ces intégrations, pour éviter de publier une démo ou une application sans serveur.

Sources : https://docs.expo.dev/build-reference/apk/ ; https://docs.expo.dev/build/setup/ ; https://support.google.com/googleplay/android-developer/answer/9858738?hl=fr
