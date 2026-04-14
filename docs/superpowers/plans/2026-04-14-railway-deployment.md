# Railway Deployment Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Model Bento on Railway with Postgres, Redis, GitHub OAuth, environment variables, and a working deploy.

**Architecture:** Single Railway project with 3 services — the Astro app, Railway-managed Postgres, and Railway-managed Redis. Railway auto-injects database connection strings. The app deploys from the current directory via `railway up`.

**Tech Stack:** Railway CLI, Astro 5 (Node adapter), PostgreSQL, Redis, Drizzle ORM, Auth.js (GitHub OAuth)

---

### Task 1: Create Railway Project

**Files:** None (CLI only)

- [ ] **Step 1: Create the project**

```bash
railway init -n model-bento
```

Expected: Railway creates the project and links the current directory. Output includes project ID and a confirmation message.

- [ ] **Step 2: Verify the project is linked**

```bash
railway status
```

Expected: Shows the `model-bento` project with the production environment. Should show the project name and environment.

---

### Task 2: Provision Postgres

**Files:** None (CLI only)

- [ ] **Step 1: Add Postgres database**

```bash
railway add --database postgres
```

Expected: Railway provisions a Postgres instance. Output confirms the database was added. This auto-injects `DATABASE_URL` into the app service's environment.

- [ ] **Step 2: Verify DATABASE_URL is set**

```bash
railway variables
```

Expected: `DATABASE_URL` appears in the variable list with a `postgresql://...` connection string. If the CLI asks which service to show variables for, select the app service (not the Postgres service).

---

### Task 3: Provision Redis

**Files:** None (CLI only)

- [ ] **Step 1: Add Redis database**

```bash
railway add --database redis
```

Expected: Railway provisions a Redis instance. Output confirms the database was added. This auto-injects `REDIS_URL` into the app service's environment.

- [ ] **Step 2: Verify REDIS_URL is set**

```bash
railway variables
```

Expected: Both `DATABASE_URL` and `REDIS_URL` appear in the variable list. `REDIS_URL` has a `redis://...` connection string.

---

### Task 4: Generate Railway Domain

**Files:** None (CLI only)

- [ ] **Step 1: Generate a railway-provided domain**

```bash
railway domain
```

Expected: Outputs a URL like `model-bento-production.up.railway.app`. Copy this URL — it's needed for `PUBLIC_SITE_URL` and the GitHub OAuth callback.

- [ ] **Step 2: Record the domain**

Save the generated domain. It will be referenced as `<RAILWAY_DOMAIN>` in subsequent steps.

---

### Task 5: Set Auto-Generated Environment Variables

**Files:** None (CLI only)

These variables don't depend on the GitHub OAuth app and can be set immediately.

- [ ] **Step 1: Set AUTH_SECRET**

```bash
railway variable set AUTH_SECRET=$(openssl rand -hex 32)
```

Expected: Variable set confirmation. This generates a random 64-character hex string for Auth.js session signing.

- [ ] **Step 2: Set PUBLIC_SITE_URL**

```bash
railway variable set PUBLIC_SITE_URL=https://<RAILWAY_DOMAIN>
```

Replace `<RAILWAY_DOMAIN>` with the domain from Task 4. Do NOT include a trailing slash.

Expected: Variable set confirmation.

- [ ] **Step 3: Set ADMIN_GITHUB_IDS**

```bash
railway variable set ADMIN_GITHUB_IDS=17831684
```

Expected: Variable set confirmation.

- [ ] **Step 4: Verify all variables so far**

```bash
railway variables
```

Expected: Shows `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `PUBLIC_SITE_URL`, and `ADMIN_GITHUB_IDS`.

---

### Task 6: Create GitHub OAuth App

**Files:** None (manual step on github.com)

This task is done entirely by the user in a browser.

- [ ] **Step 1: Open GitHub OAuth settings**

Go to: https://github.com/settings/developers

Click "OAuth Apps" in the left sidebar, then "New OAuth App".

- [ ] **Step 2: Fill in the OAuth app form**

| Field | Value |
|-------|-------|
| Application name | `Model Bento` |
| Homepage URL | `https://<RAILWAY_DOMAIN>` |
| Authorization callback URL | `https://<RAILWAY_DOMAIN>/api/auth/callback/github` |

Replace `<RAILWAY_DOMAIN>` with the domain from Task 4.

Click "Register application".

- [ ] **Step 3: Copy the Client ID**

The Client ID is shown on the app page immediately after creation. Copy it.

- [ ] **Step 4: Generate and copy Client Secret**

Click "Generate a new client secret". Copy the secret immediately — GitHub only shows it once.

- [ ] **Step 5: Set GitHub OAuth variables on Railway**

```bash
railway variable set GITHUB_CLIENT_ID=<paste-client-id>
railway variable set GITHUB_CLIENT_SECRET=<paste-client-secret>
```

Replace the placeholders with the values from steps 3 and 4.

Expected: Variable set confirmations for both.

---

### Task 7: Set Anthropic API Key

**Files:** None (CLI only)

- [ ] **Step 1: Set the API key**

```bash
railway variable set ANTHROPIC_API_KEY=<paste-your-key>
```

Replace `<paste-your-key>` with your Anthropic API key (starts with `sk-ant-`).

Expected: Variable set confirmation.

- [ ] **Step 2: Verify all 8 variables are set**

```bash
railway variables
```

Expected: All 8 variables present: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `PUBLIC_SITE_URL`, `ADMIN_GITHUB_IDS`, `ANTHROPIC_API_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

---

### Task 8: Create railway.toml

**Files:**
- Create: `railway.toml`

- [ ] **Step 1: Create the configuration file**

Create `railway.toml` in the project root:

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

Notes:
- `bun install && bun run build` installs dependencies and runs the Astro production build
- `node dist/server/entry.mjs` is the Astro Node standalone adapter output
- Healthcheck hits `/` (the landing page) with a 5-minute timeout for first deploy
- Auto-restarts on failure up to 10 times

- [ ] **Step 2: Commit**

```bash
git add railway.toml
git commit -m "Add railway.toml for deployment config"
```

---

### Task 9: Deploy to Railway

**Files:** None (CLI only)

- [ ] **Step 1: Push the deploy**

```bash
railway up
```

This uploads the current directory to Railway. Railway detects the Nixpacks builder, installs Bun, runs `bun install && bun run build`, and starts the server.

Expected: Build logs stream to the terminal. Look for:
- `bun install` completing successfully
- `astro build` completing with no errors
- The deploy URL printed at the end

This may take 2-5 minutes on first deploy.

- [ ] **Step 2: Verify the deploy succeeded**

```bash
railway status
```

Expected: Shows the app service with a "Success" or active deployment status.

---

### Task 10: Run Database Migrations

**Files:** None (CLI only)

- [ ] **Step 1: Apply Drizzle migrations against production Postgres**

```bash
railway run bunx drizzle-kit migrate
```

`railway run` executes the command locally but with the Railway environment variables injected (including `DATABASE_URL`). This applies `drizzle/0000_thin_morph.sql` which creates the `users`, `models`, `bento_pages`, and `source_texts` tables.

Expected: Output confirms migration applied successfully. Something like "1 migration applied".

- [ ] **Step 2: Verify tables exist**

```bash
railway run node -e "
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);
sql\`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'\`.then(rows => {
  console.log('Tables:', rows.map(r => r.table_name).join(', '));
  sql.end();
});
"
```

Expected: Output includes `users`, `models`, `bento_pages`, `source_texts`.

If the `require` syntax doesn't work due to ESM, use:

```bash
railway connect postgres
```

Then in the psql shell:

```sql
\dt
```

Expected: Lists the 4 tables. Type `\q` to exit.

---

### Task 11: Smoke Test

**Files:** None (browser + CLI)

- [ ] **Step 1: Test landing page**

Open `https://<RAILWAY_DOMAIN>/` in a browser.

Expected: The Model Bento landing page renders with the hero section, search bar, and "Create a bento page" CTA.

- [ ] **Step 2: Test explore page**

Open `https://<RAILWAY_DOMAIN>/explore`

Expected: Page renders with "Explore Models" heading and an empty state (no models yet).

- [ ] **Step 3: Test 404**

Open `https://<RAILWAY_DOMAIN>/m/fake/nonexistent`

Expected: Returns 404 status (blank page or 404 page).

- [ ] **Step 4: Test sitemap**

Open `https://<RAILWAY_DOMAIN>/sitemap.xml`

Expected: Returns XML with `<urlset>` containing at least the `/` and `/explore` URLs.

- [ ] **Step 5: Test GitHub OAuth redirect**

Open `https://<RAILWAY_DOMAIN>/generate`

Expected: Redirects to GitHub OAuth login page (since you're not authenticated). After authorizing, you should be redirected back to `/generate`.

---

## Post-Setup Notes

**To add a custom domain later:**

```bash
railway domain your-domain.com
```

Railway will output the DNS records (CNAME) to add at your registrar. After DNS propagates, update:

```bash
railway variable set PUBLIC_SITE_URL=https://your-domain.com
```

And update the GitHub OAuth app's Homepage URL and Callback URL at https://github.com/settings/developers.

**To view logs:**

```bash
railway logs
```

**To redeploy after code changes:**

```bash
railway up
```

Or set up GitHub integration via `railway open` → Settings → connect GitHub repo for automatic deploys on push.
