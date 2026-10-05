const base = require('./app.json');
module.exports = () => {
 const profile = process.env.EAS_BUILD_PROFILE;
 if (profile === 'production') throw new Error('Publication bloquée : connecter les comptes Android au serveur réel et valider les achats avant publication. Utilise preview pour tester les écrans et la caméra.');
 if (['connected-preview','play-internal'].includes(profile)) {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url || !/^https:\/\/[^/]+\/?$/.test(url)) throw new Error('Renseigne EXPO_PUBLIC_API_URL avec l’origine HTTPS du serveur dans l’environnement Expo Preview.');
 }
 if (process.env.EXPO_PUBLIC_ADS_LIVE === 'true') throw new Error('Publicités réelles bloquées : configurer les identifiants AdMob, le consentement et valider la récompense signée avant activation.');
 return {...base.expo, name: profile === 'preview' ? 'CarDrive Test' : base.expo.name};
};
