# Refonte visuelle CarDrive — 7 octobre 2026

- Accueil : collection récente, bouton scanner, solde serveur et accès profil.
- Compte : accessible depuis l’en-tête ; connexion, déconnexion, suppression et support conservés. Les commandes du compte ne sont plus dupliquées dans la boutique des utilisateurs connectés.
- Garage : photos plus grandes, textes sans troncature du modèle, badge séparé, filtres français sur plusieurs lignes, grille adaptative.
- Défis : onglets quotidiens, hebdomadaires et mensuels ; calculs et validations inchangés.
- Palette anthracite/or, textes secondaires contrastés, icônes natives sans dépendance supplémentaire.
- Aucune donnée illustrative de la maquette intégrée. Les photos restent celles du garage.

Validation : syntaxe JSX, export Metro web, export Android/Hermes et test d’isolation des comptes. L’aperçu navigateur local est bloqué (ERR_BLOCKED_BY_CLIENT) ; validation visuelle sur Android encore nécessaire.

Pour diffuser aux testeurs : construire mobile avec le profil EAS `play-internal`, depuis `play-release-prep`, puis charger le nouvel AAB dans la piste de test existante. Ce profil incrémente automatiquement le versionCode et garde les publicités et achats natifs désactivés. L’export Metro n’est pas un AAB signé.

Vérifier sur appareil : navigation profil/accueil, scan réel, ajout garage, filtres et détail, trois périodes de défis, déconnexion/reconnexion, police agrandie et écran étroit. Ne pas supprimer un vrai compte pendant la validation.
