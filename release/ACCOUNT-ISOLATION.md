# Correction du garage par compte

Le serveur /me renvoie désormais accountId issu de la session vérifiée. Le mobile charge une sauvegarde locale distincte par accountId. Une déconnexion ou une session invalide retire le joueur affiché, les cartes, le score et les fenêtres de progression. Une réponse réseau provenant d’une ancienne session est rejetée.

Les anciennes sauvegardes sans propriétaire restent sur le téléphone, mais ne sont pas importées automatiquement. Elles ne sont visibles dans aucun nouveau compte. Le garage n’est pas encore sauvegardé dans le cloud : une réinstallation peut le perdre.

La suppression d’un compte efface sa sauvegarde et les photos référencées par ses cartes uniquement, sans effacer les autres comptes du téléphone.

Validation locale : test de deux comptes isolés, reconnexion et suppression sélective ; tests serveur ; export Android Metro/Hermes. La vérification sur téléphone reste à faire avec un nouvel APK : branche play-release-prep, dossier mobile, profil connected-preview, environnement Preview. Ne pas choisir preview (démo).

Sur téléphone : A crée une carte ; déconnexion sans score/garage affiché ; B commence vide ; reconnexion A retrouve sa carte ; fermeture/réouverture retrouve seulement le compte connecté. Test de suppression à faire avec B jetable.
