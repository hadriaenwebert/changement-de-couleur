# Changement de Couleur — jeu multijoueur en ligne

Chaque joueur joue sur son téléphone. Le serveur Node.js (WebSocket) gère la partie :
les mains des autres joueurs ne sont **jamais** envoyées aux clients.

```
server.js     serveur HTTP + WebSocket (salles, reconnexion, nettoyage)
game.js       règles du jeu (autorité côté serveur)
www/          client mobile (servi par le serveur ET embarqué dans les apps)
test.js       test automatique : 3 joueurs jouent une partie complète
```

## 1. Essayer en local

```bash
npm install
npm start            # http://localhost:3000
npm test             # joue une partie complète à 3 joueurs
```
Ouvre `http://localhost:3000` dans plusieurs onglets (ou sur ton téléphone via l’IP de ton PC).

## 2. Mettre le serveur en ligne (obligatoire pour jouer à distance)

Le plus simple : un hébergeur Node.js gratuit ou peu cher (Render, Railway, Fly.io…).
Exemple avec **Render** :
1. Mets ce dossier sur GitHub.
2. Render → *New Web Service* → ton dépôt.
3. Build command : `npm install` — Start command : `npm start`.
4. Tu obtiens une URL du type `https://mon-jeu.onrender.com`.

Ouvre cette URL sur n’importe quel téléphone : le jeu fonctionne déjà dans le navigateur
(« Ajouter à l’écran d’accueil » pour une icône). Test de santé : `/healthz`.

> Les salles sont gardées en mémoire : un redémarrage du serveur les efface.
> Sur l’offre gratuite de Render, le serveur s’endort après inactivité (premier chargement lent).

## 3. Créer les apps Android et iPhone (Capacitor)

1. Dans `www/config.js`, mets l’URL de ton serveur : `window.CDC_SERVER = 'wss://mon-jeu.onrender.com';`
2. Change `appId` dans `capacitor.config.json` (ex. `fr.tonnom.changementdecouleur`).
3. Installe et génère les projets natifs :
   ```bash
   npm run cap:init     # ajoute Capacitor + les plateformes android et ios
   npm run cap:sync     # recopie www/ dans les apps (à refaire après chaque modification)
   ```
4. **Android** : installe Android Studio, puis `npm run cap:android` → Build → Generate Signed Bundle (.aab).
   Publication : compte Google Play Console (25 $, une fois).
5. **iPhone** : il faut un **Mac avec Xcode**, puis `npm run cap:ios` → Product → Archive.
   Publication : compte Apple Developer (99 $/an) et validation App Store.

## Ce que je n’ai pas pu faire à ta place
- Compiler et signer les apps, créer les comptes développeur, passer la validation des stores.
- Tester sur de vrais téléphones. Le serveur est testé automatiquement (`npm test`), pas les apps natives.
- Ajouter icône et écran de lancement (outil conseillé : `@capacitor/assets`).
