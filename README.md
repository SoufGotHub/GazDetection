# GazDetection — Détection de gaz

Application web de surveillance de gaz en temps réel, avec tableau de bord, historique et réglages des seuils d’alerte. Elle se connecte à un capteur (ex. ESP32) via **Firebase Realtime Database**.

---

## Fonctionnalités

- **Tableau de bord** : lecture en direct, courbe d’évolution (Chart.js), statut OK / WARN / ALERT
- **Historique** : consultation des mesures passées
- **Paramètres** : configuration des seuils d’avertissement et d’alerte
- **Firebase** : synchronisation temps réel des données (device `esp32_01`)

---

## Stack technique

| Technologie        | Usage                    |
|--------------------|--------------------------|
| **Angular 21**     | Frontend (standalone)    |
| **Firebase**       | Realtime Database, Auth |
| **Chart.js**       | Graphiques               |
| **Firebase Functions** | Backend (Node 24)  |
| **Angular SSR**    | Rendu côté serveur       |

---

## Prérequis

- **Node.js** 20+ (recommandé 24 pour les Cloud Functions)
- **npm** 11+
- Un projet **Firebase** avec Realtime Database activée

---

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/SoufGotHub/GazDetection.git
cd GazDetection
```

### 2. Installer les dépendances de l’application

```bash
cd app/gas-monitor
npm install
```

### 3. Configurer Firebase

- Crée un projet sur [Firebase Console](https://console.firebase.google.com/)
- Active **Realtime Database**
- Dans le projet Angular, configure Firebase (par ex. `src/environments/` ou `app.config.ts`) avec tes clés :
  - `apiKey`, `authDomain`, `databaseURL`, `projectId`, etc.

### 4. (Optionnel) Cloud Functions

```bash
cd app/gas-monitor/functions
npm install
```

Déploiement :

```bash
cd app/gas-monitor
firebase deploy --only functions
```

---

## Lancer l’application

### Mode développement

Depuis `app/gas-monitor` :

```bash
npm start
```

L’app est disponible sur **http://localhost:4200**.

### Build de production

```bash
npm run build
```

Les artefacts sont dans `dist/`.

### Tests

```bash
npm test
```

---

## Structure du projet

```
detectionDeGaz/
├── README.md
├── .gitignore
└── app/
    ├── package.json
    └── gas-monitor/
        ├── angular.json
        ├── firebase.json
        ├── package.json
        ├── src/
        │   ├── app/
        │   │   ├── dashboard/     # Tableau de bord + graphique
        │   │   ├── history/       # Historique des mesures
        │   │   ├── settings/      # Seuils warn/alert
        │   │   ├── layout/        # Layout principal
        │   │   ├── services/      # GasService (Firebase)
        │   │   ├── app.config.ts
        │   │   └── app.routes.ts
        │   ├── main.ts
        │   └── ...
        └── functions/             # Firebase Cloud Functions
            ├── package.json
            └── index.js
```

---

## Modèle de données (Realtime Database)

- **Device** : `devices/esp32_01/`
  - `latest` : dernière mesure (`ts`, `adc`, `index`, `status`, `warn`, `alert`)
  - `history` : liste des mesures pour les courbes
  - `config` : `warn`, `alert` (seuils)

---

## Scripts principaux

| Commande        | Description              |
|-----------------|--------------------------|
| `npm start`     | Serveur de dev (port 4200) |
| `npm run build` | Build production         |
| `npm test`      | Tests unitaires          |
| `npm run watch` | Build en mode watch      |

---

## Licence

Projet personnel / éducatif. Adapte la licence selon ton usage.

---

## Auteur

**SoufGotHub** — [GitHub](https://github.com/SoufGotHub)
