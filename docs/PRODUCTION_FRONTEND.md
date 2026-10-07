# Production Frontend Source of Truth

## Canonical production host

Smart Money Tracker's canonical frontend is:

**https://smart-money-tracker-v2.netlify.app**

Use this address for production validation, screenshots, testing, bookmarks, and user-facing references.

## Hosting roles

- **Netlify** — canonical production frontend.
- **GitHub** — source repository and deployment source.
- **Render** — production Node/Express backend at `https://smart-money-tracker-09ks.onrender.com`.
- **Firebase / Firestore** — authentication and application data.
- **Vercel** — historical/secondary deployment only. It is not the production source of truth and may lag behind `main`.

## Deployment configuration

The repository root `netlify.toml` defines the frontend production build:

- Base: `frontend`
- Build command: `npm run build`
- Publish directory: `frontend/dist`
- Node: 22

## Release verification

For frontend changes:

1. Merge the validated change to `main`.
2. Confirm the Netlify production deploy completes.
3. Validate the canonical Netlify URL.
4. Do not treat a stale Vercel deployment as a production regression.

## Future custom domain

If Smart Money Tracker becomes a shared or commercial product, attach the custom domain to the canonical Netlify production site. The hosting provider URL should then become an implementation detail rather than a user-facing address.
