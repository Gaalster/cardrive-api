const base = require('./app.json');
module.exports = () => {
 const profile = process.env.EAS_BUILD_PROFILE;
 if (profile === 'production') throw new Error('Publication bloquée : connecter les comptes Android au serveur réel et valider les achats avant publication. Utilise preview pour tester les écrans et la caméra.');
 return {...base.expo, name: profile === 'preview' ? 'CarDrive Test' : base.expo.name};
};
