# Railway Deployment Setup — Design Spec

## Goal

Set up Model Bento on Railway from scratch: create the project, provision Postgres and Redis, configure GitHub OAuth, set environment variables, create `railway.toml`, deploy, run migrations, and verify.

## Prerequisites

- Railway CLI installed and authenticated (logged in as Trey)
- GitHub account with access to github.com/settings/developers
- Anthropic API key (to be filled in manually)
- GitHub user ID for admin: `17831684`

## Architecture

```
Railway Project: model-bento
├── model-bento (Astro app service)    ← deployed from this repo
├── Postgres                           ← Railway-managed, auto-injects DATABASE_URL
└── Redis                              ← Railway-managed, auto-injects REDIS_URL
```

Single environment (production). Railway-generated domain initially, custom domain can be added later.

## Steps

### 1. Create Railway project

```bash
railway init
```

Creates a new project. Name it `model-bento`. This also links the current directory to the project.

### 2. Add Postgres

```bash
railway add --database postgres
```

Railway provisions a Postgres 16 instance and auto-injects `DATABASE_URL` into the app service's environment.

### 3. Add Redis

```bash
railway add --database redis
```

Railway provisions a Redis 7 instance and auto-injects `REDIS_URL` into the app service's environment.

### 4. Generate Railway domain

```bash
railway domain
```

Generates a public URL like `model-bento-production.up.railway.app`. This URL is needed for:
- `PUBLIC_SITE_URL` env var
- GitHub OAuth callback URL

### 5. Create GitHub OAuth App

Manual step — done by the user on GitHub:

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Model Bento
   - **Homepage URL**: `https://<railway-domain>`
   - **Authorization callback URL**: `https://<railway-domain>/api/auth/callback/github`
4. Click "Register application"
5. Copy the **Client ID**
6. Generate and copy a **Client Secret**

These produce `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

### 6. Set environment variables

Railway auto-sets `DATABASE_URL` and `REDIS_URL` from the database plugins. The remaining 6 variables are set manually:

```bash
railway variables set AUTH_SECRET=$(openssl rand -hex 32)
railway variables set PUBLIC_SITE_URL=https://<railway-domain>
railway variables set ADMIN_GITHUB_IDS=17831684
```

The following 3 are set by the user when ready:

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-...
railway variables set GITHUB_CLIENT_ID=...
railway variables set GITHUB_CLIENT_SECRET=...
```

### 7. Create `railway.toml`

Configures build and start commands for the Astro Node standalone app:

```toml
[build]
builder = "nixpacks"
buildCommand = "bun install && bun run build"

[deploy]
startCommand = "node dist/server/entry.mjs"
healthcheckPath = "/"
healthcheckTimeout = 300
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

The Astro Node adapter outputs to `dist/server/entry.mjs` in standalone mode.

### 8. Deploy

```bash
railway up
```

Pushes the current directory to Railway. Railway builds with Nixpacks (detects Node/Bun), runs the build command, and starts the server.

### 9. Run database migrations

After the first deploy (so the service can access `DATABASE_URL`):

```bash
railway run bunx drizzle-kit migrate
```

Applies the Drizzle migration (`drizzle/0000_thin_morph.sql`) against the production Postgres.

### 10. Smoke test

Open the Railway-generated URL in a browser. Verify:
- Landing page loads at `/`
- `/explore` renders (empty, no models yet)
- `/m/fake/model` returns 404
- `/sitemap.xml` returns valid XML

## Environment Variables Summary

| Variable | Source | When |
|----------|--------|------|
| `DATABASE_URL` | Auto-injected by Railway Postgres plugin | Step 2 |
| `REDIS_URL` | Auto-injected by Railway Redis plugin | Step 3 |
| `AUTH_SECRET` | Generated via `openssl rand -hex 32` | Step 6 |
| `PUBLIC_SITE_URL` | Railway-generated domain | Step 6 |
| `ADMIN_GITHUB_IDS` | `17831684` | Step 6 |
| `ANTHROPIC_API_KEY` | User fills in manually | Step 6 |
| `GITHUB_CLIENT_ID` | From GitHub OAuth app | Step 6 |
| `GITHUB_CLIENT_SECRET` | From GitHub OAuth app | Step 6 |

## Verification Criteria

- `railway status` shows linked project with 3 services
- `railway variables` shows all 8 env vars set on the app service
- Landing page loads at the Railway domain
- `/explore` returns 200
- `/sitemap.xml` returns XML
- GitHub OAuth login redirects correctly (once OAuth creds are set)
