# calendar-poussin

## Frontend

The app is now a shared scheduling interface with:

- Desktop: monthly calendar grid
- Mobile: single-day vertical timeline with swipe navigation
- Dual timezone display (Montreal and Paris)
- Busy-event creation stored in UTC
- Shared free-window visualization
- Google-auth gate before accessing the calendar UI

Run frontend:

```bash
npm run dev
```

## Express + Google Auth

1. Create a Google OAuth 2.0 Web Client in Google Cloud Console.
2. Add this authorized redirect URI:

```text
http://localhost:4000/auth/google/callback
```

3. Fill in your Google credentials in `.env`.
4. Start the server:

```bash
npm run dev:server
```

Optional frontend env:

```text
VITE_API_URL=http://localhost:4000
```

### Auth routes

- `GET /auth/google` starts Google login.
- `GET /auth/google/callback` handles Google callback.
- `GET /auth/user` returns the logged-in user (or 401).
- `POST /auth/logout` logs out the current user.
- `GET /health` quick health check.

## Deploy gratuit (simple et fiable)

Le plus simple pour ce projet est de deployer frontend + backend ensemble sur **un seul service Render** (meme domaine), pour eviter les soucis de cookies/session entre 2 domaines.

### 1) Preparer Google OAuth

Dans Google Cloud Console (OAuth Web application), ajoute:

- Authorized JavaScript origin: `https://<ton-app>.onrender.com`
- Authorized redirect URI: `https://<ton-app>.onrender.com/auth/google/callback`

### 2) Creer le service Render

- Connecte ton repo GitHub sur Render.
- Type: **Web Service** (Node).
- Build Command: `npm install && npm run build`
- Start Command: `npm run server`

### 3) Variables d'environnement (Render)

Configure:

- `NODE_ENV=production`
- `PORT=10000` (ou laisse Render injecter son PORT)
- `CLIENT_ORIGIN=https://<ton-app>.onrender.com`
- `VITE_API_URL=` (laisser vide pour utiliser le meme domaine en prod)
- `GOOGLE_CLIENT_ID=...`
- `GOOGLE_CLIENT_SECRET=...`
- `GOOGLE_CALLBACK_URL=https://<ton-app>.onrender.com/auth/google/callback`
- `SESSION_SECRET=<une longue valeur aleatoire>`

### 4) Deployer

- Clique **Manual Deploy** ou push sur la branche connectee.
- Verifie `https://<ton-app>.onrender.com/health` puis la connexion Google.

## Calendar data model

Events use UTC storage:

```json
{
  "id": "string",
  "title": "string",
  "startUTC": "ISO string",
  "endUTC": "ISO string",
  "createdBy": "canada | france"
}
```
