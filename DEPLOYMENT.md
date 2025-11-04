# Deployment Configuration

## Environment Variables

This app requires the following environment variables to be set:

### Firebase Configuration

- `VITE_FIREBASE_API_KEY` - Firebase API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID

### Netlify Deployment

1. Go to Netlify Dashboard → Your Site → Site settings → Environment variables
2. Add each variable from `.env.example`
3. Redeploy the site

### Local Development

1. Copy `.env.example` to `.env.local`
2. Fill in your Firebase credentials
3. Run `npm run dev`

**Important:** Never commit `.env.local` to Git! It's already in `.gitignore`.
