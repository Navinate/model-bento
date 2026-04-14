# Auth/Login Fixes — Design Spec

Two bugs discovered on production after Railway deploy. Both block sign-in flow.

## Bug 1: `/auth/login` has no styling

**Symptom:** Login page at `https://model-bento-production.up.railway.app/auth/login` renders as unstyled HTML — Tailwind classes present in source but no CSS applied.

**Root cause:** `src/pages/auth/login.astro` (and `callback.astro`, `logout.astro`) use Tailwind classes but don't import `src/styles/global.css`. Tailwind's JIT compiler only generates CSS for classes used in files that reach the stylesheet import graph. Other pages (`index.astro`, `explore.astro`, etc.) import `global.css` individually; the auth pages were missed.

**Fix:** Add `import '../styles/global.css'` to `src/layouts/BaseLayout.astro`. Every page that uses `BaseLayout` — including auth pages — now inherits the import. Prevents the bug from recurring on future pages. Existing per-page imports in other files can stay (deduped by Vite) or be removed in a follow-up cleanup.

## Bug 2: GitHub sign-in redirects to `https://localhost/api/auth/error?error=Configuration`

**Symptom:** Clicking "Sign in with GitHub" redirects to a `localhost` URL with Auth.js's generic `Configuration` error — the OAuth handshake never reaches GitHub.

**Root cause:** Auth.js doesn't know the canonical production URL and can't trust Railway's proxy headers. It falls back to `localhost` when generating the OAuth redirect URL.

**Fix:** Set two env vars on the Railway `model-bento` service:

- `AUTH_URL=https://model-bento-production.up.railway.app` — canonical site URL Auth.js should use when generating redirect URLs.
- `AUTH_TRUST_HOST=true` — tells Auth.js to trust `x-forwarded-*` headers from Railway's edge proxy.

Redeploy to pick up the new env vars.

## Verification

1. `curl -sS https://model-bento-production.up.railway.app/auth/login | grep -o "href=\"[^\"]*\\.css\""` — confirms a CSS link is present in the HTML (or that Tailwind-generated styles are inlined in the `<head>`).
2. Open `/auth/login` in a browser — page renders with card, button styled with Apple aesthetic (rounded corners, dark button).
3. Click "Sign in with GitHub" — browser navigates to `github.com/login/oauth/authorize?...`, NOT to a `localhost` error.
4. Complete OAuth — redirected back to `/generate` (original `callbackUrl`) with an authenticated session.
