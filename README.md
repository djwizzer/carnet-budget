# Carnet de budget

Appli web de budget personnel, installable sur Android (et iPhone). Gratuite, sans compte, sans serveur :
tes données restent sur ton téléphone.

**Ouvrir l'appli :** https://djwizzer.github.io/carnet-budget/
Sur Android, dans Chrome : menu ⋮ → **Installer l'application**.

## Fonctions

- **Import de relevés** PDF (BoursoBank testé, autres banques françaises en général) et CSV, plusieurs fichiers à la fois.
  - Contrôle automatique : solde de début + opérations = solde de fin.
  - Doublons détectés, revue avant ajout.
- **Classement automatique** par catégorie, avec apprentissage : corrige une fois, l'appli retient le commerçant.
- **Catégories personnalisables** : nom, couleur, type (dépense, revenu, interne), budget mensuel.
- **Règles** « si le libellé contient… → catégorie ».
- **Budgets** par catégorie, avec alertes à 85 % et en cas de dépassement.
- **Opérations** : recherche (texte ou montant), filtres, modification, ajout manuel, notes, suppression avec annulation.
- **Analyse** : revenus et dépenses sur 12 mois, évolution par catégorie, comparaison avec le mois précédent, top commerçants, paiements récurrents, taux d'épargne.
- **Virements internes** (livret, épargne, entre tes comptes) exclus des revenus et des dépenses.
- **Sauvegarde Google Drive** automatique (copie quotidienne gardée 30 jours) et restauration.
- **Sauvegarde fichier** (partage vers Drive, mail…) et **export CSV** pour Excel.
- **Code de verrouillage**, thème clair / sombre, fonctionne hors connexion.

## Configurer Google Drive

Une fois, dans [Google Cloud Console](https://console.cloud.google.com/) :
1. Crée un projet, active **Google Drive API**.
2. Configure l'écran de consentement OAuth (audience Externe) et ajoute ton adresse Gmail en **utilisateur test**.
3. Crée un **ID client OAuth** de type *Application Web* avec l'origine `https://djwizzer.github.io`.
4. Colle l'ID client dans l'appli : Réglages → Sauvegarde → Configurer Google Drive.

L'appli utilise le droit `drive.file` : elle ne voit que les fichiers qu'elle crée.

## Structure

- `index.html`, `styles.css` : interface
- `js/parser.js` : lecture des relevés PDF (pdf.js) et CSV
- `js/drive.js` : sauvegarde Google Drive
- `js/app.js` : application
- `sw.js`, `manifest.webmanifest` : installation et mode hors ligne
