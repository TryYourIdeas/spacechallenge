# Troubleshooting

Problems met while operating Layer Explorer, with cause and fix. For everyday
use see [manual.md](manual.md); for configuration see [config.md](config.md).

## Vercel

### Production deployment failed: `framework` should be equal to one of the allowed values

- **Symptom:** Vercel emails "Production deployment failed" (commit `0d21b78`)
  with `The vercel.json schema validation failed ... framework should be equal
  to one of the allowed values`. No build runs.
- **Cause:** `frontend/vercel.json` set `"framework": "nuxt"`, which is not a
  valid Vercel framework identifier.
- **Fix:** remove the `framework` key. Vercel detects Nuxt from `package.json`,
  so `vercel.json` only needs `installCommand` and `buildCommand`. Fixed in
  commit `b648080`; the next deployment became **Ready**.
- **Lesson:** validate `vercel.json` against its `$schema` before pushing, and
  do not guess identifiers.

### The site loads but `/readyz` returns the HTML page and `/api/layers` returns 404

- **Symptom:** the map page works, yet API and health routes answer with the
  SPA HTML or a 404.
- **Cause:** the live site was an old build made before the server routes and
  `vercel.json` existed. Failed deployments never replace it, so the old
  version kept being served and looked like a working but "static" site.
- **Check:** in the Vercel dashboard open **Deployments** and compare the
  latest commit with the one marked Production. Then run
  `curl -s https://spacechallenge-gamma.vercel.app/readyz` (expect JSON).
- **Fix:** fix the failing build (read its log) and push again.

### Reading deployment state without the dashboard

Compare `Last-Modified` from `curl -sI <url>/` with the time of your latest
push. An older value means the newest push has not been published.

### Settings worth checking when a build fails

- **Root Directory** is `frontend` (the app is in a subfolder).
- **Build command** is `npm run build:server`. The default `npm run build` runs
  `nuxt generate`, which produces static files without the API.
- **Node.js Version** is 22 (Nuxt 4 needs a recent Node; nothing in the repo
  pins it).
- **`DATABASE_URL`** is set for Production and Preview. After changing a
  variable, redeploy for it to take effect.
- The lockfile `frontend/package-lock.json` is committed.
