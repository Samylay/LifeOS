# LifeOS App — Setup Guide

## Prerequisites

- Node.js 18+
- npm
- A Firebase project (see below)

## Quick Start

```bash
cd app
cp .env.local.example .env.local
# Fill in your Firebase config values in .env.local
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Environment Variables

Create `app/.env.local` with your Firebase project config:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_custom_domain_or_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Find these values in: Firebase Console → Project Settings → General → Your Apps → Web App config.

## Firebase Setup

### 1. Create Project
- Go to [Firebase Console](https://console.firebase.google.com)
- Create a new project (e.g., "lifeos-app")

### 2. Enable Authentication
- Go to Authentication → Sign-in method
- Enable **Google** provider
- Add authorized domains:
  - `localhost` (for development)
  - Your custom domain (e.g., `lifeos.samylayaida.com`)

### 3. Enable Firestore
- Go to Firestore Database → Create database
- Start in **test mode** (you'll add rules later)
- Choose a region close to you

### 4. Register Web App
- Go to Project Settings → General → Your apps
- Click "Add app" → Web
- Copy the config values to your `.env.local`

### 5. Firestore Security Rules
Once you're ready for production, set these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## Demo Mode

If you don't set any Firebase env vars, the app runs in **demo mode**:
- Auth is bypassed (no login screen)
- All data is stored in React state (lost on refresh)
- Useful for local development and UI iteration

## Deployment (Vercel)

1. Push to GitHub
2. Import the `app/` directory in Vercel
3. Set the root directory to `app`
4. Add all `NEXT_PUBLIC_FIREBASE_*` env vars in Vercel project settings
5. Deploy

### Custom Domain
To use `lifeos.samylayaida.com`:
1. In Vercel: Settings → Domains → Add `lifeos.samylayaida.com`
2. In your DNS: Add a CNAME record:
   - Name: `lifeos`
   - Value: `cname.vercel-dns.com`
3. In Firebase Console: Authentication → Settings → Authorized domains → Add `lifeos.samylayaida.com`

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (hot reload) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
