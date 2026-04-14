# Model Bento — Implementation Plan

A public registry of Apple-style bento presentations for AI model cards.
Upload a model card PDF/text → get a beautiful, shareable bento page.

## Architecture

```
Railway Project
├── astro-app/               Astro 5 SSR (Node adapter)
│   ├── Public bento pages   (SSR, cached)
│   ├── GitHub OAuth         (Auth.js)
│   ├── PDF parsing          (pdf-parse)
│   ├── AI extraction        (Anthropic TypeScript SDK)
│   └── OG image generation  (@vercel/og / Satori)
│
├── postgresql               Railway-managed
└── redis                    Railway-managed (cache + sessions)
```

Single-service architecture. Astro handles everything: public pages, auth, PDF
parsing, Claude extraction, OG image generation, and admin. No internal API
boundaries — extraction and parsing are server-side modules called directly
from Astro server actions.

---

## Tech Stack

| Layer            | Choice                          | Notes                                    |
|------------------|---------------------------------|------------------------------------------|
| Framework        | Astro 5 (Node adapter)          | SSR for public pages, static where possible |
| Interactive UI   | React 19 (Astro islands)        | Upload form, preview, dashboard          |
| Styling          | Tailwind CSS v4                 | Apple aesthetic: clean, whitespace, rounded |
| Animations       | Motion One                      | Lightweight, works outside React         |
| Auth             | Auth.js (Astro integration)     | GitHub OAuth only                        |
| PDF Parsing      | pdf-parse                       | Node-native PDF text extraction          |
| AI Extraction    | Anthropic TypeScript SDK        | Sonnet for structured extraction         |
| Charts           | Recharts (React islands)        | SSR-friendly, simple API                 |
| ORM              | Drizzle ORM                     | TypeScript-native, single source of truth |
| Migrations       | drizzle-kit                     | Schema-driven, no raw SQL files          |
| Database         | PostgreSQL (Railway)            | Structured data + JSONB flexibility      |
| Cache            | Redis (Railway)                 | Data-level cache, rate limiting, sessions |
| OG Images        | @vercel/og (Satori)             | SVG→PNG, runs in Node                    |
| Deploy           | Railway                         | Single service + managed Postgres/Redis  |

---

## Route Map

### Public (no auth required)

| Route                          | Description                              |
|--------------------------------|------------------------------------------|
| `/`                            | Landing page — hero, search, featured models |
| `/explore`                     | Browse all published bento pages         |
| `/m/:provider/:model`          | Individual bento page (the core product) |
| `/m/:provider/:model/embed`    | Lightweight embed view (see Embed section) |

### Auth-gated (GitHub OAuth)

| Route                          | Description                              |
|--------------------------------|------------------------------------------|
| `/generate`                    | Upload PDF / paste text → create bento   |
| `/generate/preview`            | Preview before publishing (one-shot)     |
| `/dashboard`                   | List of bentos you've created            |
| `/auth/login`                  | GitHub OAuth redirect                    |
| `/auth/callback`               | OAuth callback handler                   |
| `/auth/logout`                 | Clear session                            |

### Admin-only (Railway admin)

| Route                          | Description                              |
|--------------------------------|------------------------------------------|
| `/admin`                       | Admin dashboard — list all models, stats |
| `/admin/m/:provider/:model`    | Manage a specific model page             |
| `/admin/m/:provider/:model/delete` | Confirm + delete a model page        |
| `/admin/m/:provider/:model/regenerate` | Re-extract + regenerate bento    |
| `/admin/users`                 | Browse all users, see ban status         |
| `/admin/users/:id`             | View user detail + ban/unban             |

---

## Database Schema

```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id     BIGINT UNIQUE NOT NULL,
    username      TEXT NOT NULL,
    avatar_url    TEXT,
    banned_at     TIMESTAMPTZ,             -- null = not banned, set = banned
    banned_reason TEXT,                    -- optional reason shown to user
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE models (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      TEXT NOT NULL,            -- 'anthropic', 'openai', 'meta'
    name          TEXT NOT NULL,            -- 'claude-sonnet-4', 'gpt-4o'
    display_name  TEXT NOT NULL,            -- 'Claude Sonnet 4'
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider, name)
);

CREATE TABLE bento_pages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id      UUID UNIQUE REFERENCES models(id) ON DELETE CASCADE,
    layout        JSONB NOT NULL,           -- card positions, sizes, types
    extracted     JSONB NOT NULL,           -- full extracted model card data (including benchmarks)
    source_type   TEXT NOT NULL DEFAULT 'text', -- 'pdf' or 'text'
    og_image_url  TEXT,
    published_at  TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE source_texts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id      UUID UNIQUE REFERENCES models(id) ON DELETE CASCADE,
    content       TEXT NOT NULL,            -- original PDF-extracted text or pasted text
    created_at    TIMESTAMPTZ DEFAULT now()
);
```

Key design decisions:

- **No `slug` column.** URLs are derived from `provider` + `name` (which have a UNIQUE constraint). Route: `/m/:provider/:model` maps directly to a DB lookup on those two columns. No slug to keep in sync.
- **No `version` column.** Version is part of the model name if relevant (e.g., `claude-sonnet-4`) or lives inside the `extracted` JSONB. Keeps the uniqueness model simple.
- **No `benchmarks` table.** Benchmark data lives inside `bento_pages.extracted` JSONB. Avoids duplication and sync issues. If cross-model benchmark queries are needed later, add a materialized view or use `jsonb_path_query`.
- **Separate `source_texts` table.** Raw PDF text can be large (50+ page model cards). Splitting it out avoids loading multi-page documents on every `bento_pages` query. Only fetched during admin regeneration.
- **`updated_at` on `users` and `bento_pages`.** Tracks when a bento was regenerated and when user records were modified.
- **Cascade deletes** from `models` clean up `bento_pages`, `source_texts`.

### Migrations

Managed by `drizzle-kit`. The Drizzle schema in `src/lib/schema.ts` is the single source of truth. Run `bunx drizzle-kit generate` to create migrations, `bunx drizzle-kit migrate` to apply.

---

## Extraction Services

All extraction logic lives in server-side modules within the Astro app — no separate service.

### PDF Parsing (`src/lib/services/pdf-parser.ts`)

Uses `pdf-parse` to extract raw text from uploaded PDFs. Enforces a **20MB file size limit** at the upload handler level.

### Claude Extraction (`src/lib/services/llm-extractor.ts`)

Sends raw text to Claude (Sonnet) via the Anthropic TypeScript SDK with a structured extraction prompt:

1. **Identity extraction**: Model name, provider — used for deduplication
2. **Metrics extraction**: Parameter counts, context window, benchmark scores
3. **Qualitative extraction**: Capabilities, limitations, safety info, use cases
4. **Highlight selection**: AI picks the 3-5 most impressive/notable stats for hero cards

Claude returns JSON validated against a Zod schema. On validation failure:
- **Retry up to 2 times** with exponential backoff
- If all retries fail, return a clear error to the user ("Extraction failed — try again or paste text instead")
- Log the failure for debugging

### OG Image Generation (`src/lib/services/og-generator.ts`)

Uses `@vercel/og` (Satori) to generate social preview images. Shows model name, provider, and 3 key stats in a mini bento layout. Generated **asynchronously after publish** — the bento page is immediately available with a generic fallback OG image until the custom one is ready.

---

## Bento Layout System

### Card Types

| Card Type       | Size Options  | Content                                  |
|-----------------|---------------|------------------------------------------|
| `hero`          | 2x2           | Model name, provider logo, tagline       |
| `stat`          | 1x1           | Single big number (params, context, etc) |
| `benchmark`     | 2x1 or 1x2    | Score bar or gauge for one benchmark     |
| `chart`         | 2x2           | Radar/bar chart of benchmark category    |
| `capabilities`  | 2x1           | Tag cloud of capabilities                |
| `limitations`   | 1x2 or 2x1    | Callout list of limitations              |
| `highlight`     | 1x1           | Key differentiator, large text           |
| `training`      | 2x1           | Training data cutoff, dataset info       |

### Layout Algorithm

1. Rank extracted data by "impressiveness" (high benchmark scores, large param counts)
2. Assign top items to larger cards (2x2, 2x1)
3. Fill remaining grid with 1x1 stat cards
4. Use CSS Grid with `grid-template-areas` for responsive layout
5. Cards use a 12-column grid on desktop, stack on mobile

### Apple Aesthetic Rules

- Border radius: `1.5rem` on all cards
- Background: subtle gradient or solid muted color per card
- Typography: System font stack, large bold numbers (4-6rem), small labels
- Colors: Muted palette with one accent color derived from provider brand
- Spacing: `1.5rem` gap between cards
- Animation: Cards fade-in with staggered delay on scroll (Motion One)
- Light mode only (for now)

---

## Generation Flow (detailed)

```
User clicks "Generate" (must be logged in)
  │
  ▼
Check users.banned_at for current session user
  │
  ├── BANNED → Show "Account suspended" page with reason, no upload form
  │
  └── NOT BANNED ↓
  │
  ▼
Upload PDF (max 20MB) or paste model card text
  │
  ▼
Astro server action:
  - If PDF: parse via pdf-parse → raw text
  - If text: use directly
  │
  ▼
Send raw text to Claude via llm-extractor
  │
  ├── EXTRACTION FAILED (after retries) → Show error, let user retry
  │
  └── SUCCESS ↓
  │
  ▼
Check if model already exists: SELECT from models WHERE provider = :p AND name = :n
  │
  ├── EXISTS → Show "This model already has a page" + link
  │
  └── NEW → Show preview page with generated bento layout
         │
         ▼
      User clicks "Publish"
         │
         ▼
      Astro server action (single transaction):
        1. INSERT into models
        2. INSERT into bento_pages (layout + extracted JSONB)
        3. INSERT into source_texts (raw text for future regeneration)
        4. Invalidate Redis cache for /explore data
         │
         ▼
      Fire-and-forget: generate OG image, update bento_pages.og_image_url
         │
         ▼
      Redirect to /m/:provider/:model (the published page)
```

---

## Embed View

The embed route (`/m/:provider/:model/embed`) renders a stripped-down version of the bento page designed for iframe embedding:

- No nav, footer, or site chrome
- Compact layout (fewer cards, smaller grid)
- Cards: hero + top 3 stats + benchmark chart (if available)
- Includes a small "View on Model Bento" link at the bottom
- Respects `prefers-color-scheme` from the embedding page
- Sets `X-Frame-Options: ALLOWALL` (only on embed routes)
- Responsive: adapts to iframe container width

---

## Caching Strategy

Cache at the **data level**, not HTML fragments. Astro rendering is fast; the expensive part is the DB query.

| Key Pattern                  | TTL     | Content                     | Invalidated by        |
|------------------------------|---------|-----------------------------|-----------------------|
| `bento:data:{provider}:{name}` | None  | `extracted` + `layout` JSONB | Admin delete/regenerate |
| `explore:models`             | 5 min   | Model list for /explore     | Any publish, delete   |
| `explore:featured`           | 5 min   | Featured models for /       | Any publish, delete   |

Pages are immutable for regular users, so cached data for individual bento pages has no TTL — only invalidated by admin actions. Cache warmed on publish.

---

## SEO & Sharing

### Per bento page (`/m/:provider/:model`)

- **SSR** with aggressive Cache-Control headers (immutable content)
- **Meta tags**: title, description auto-generated from model data
- **Open Graph**: `og:title`, `og:description`, `og:image` (auto-generated or fallback)
- **Twitter Card**: `twitter:card=summary_large_image`
- **Structured data**: JSON-LD `SoftwareApplication` schema
- **Canonical URL**: `https://modelbento.com/m/:provider/:model`

### Sitemap

Auto-generated from the models table. Regenerated on publish/delete.

---

## Admin System

### Admin Identity

Admins are identified by GitHub user ID, configured via environment variable.
No database role column — keeps it simple and controlled at the infrastructure level.

```
ADMIN_GITHUB_IDS=12345,67890    # Comma-separated GitHub user IDs
```

The Astro middleware checks `session.user.github_id` against this list.
Admin routes return 404 (not 403) for non-admins to avoid leaking route existence.

### Admin Capabilities

| Action         | What it does                                                   |
|----------------|----------------------------------------------------------------|
| **Delete**     | Removes model + bento page + source text (CASCADE). Invalidates Redis cache. Frees the provider+name so the model can be re-created by any user. |
| **Regenerate** | Re-runs Claude extraction on the stored `source_texts.content`, replaces `layout` and `extracted` in bento_pages. Invalidates cache + regenerates OG image. Model identity (provider, name) stays the same. |
| **Ban user**   | Sets `banned_at` + optional `banned_reason` on user record. Banned users cannot access `/generate`. Their existing published bento pages remain live. |
| **Unban user** | Clears `banned_at` and `banned_reason`. User regains generation access immediately. |

### Delete Flow

```
Admin visits /admin/m/:provider/:model
  │
  ▼
Clicks "Delete" → confirmation modal ("This is permanent")
  │
  ▼
Astro server action:
  1. DELETE FROM models WHERE provider = :p AND name = :n (CASCADE deletes bento_pages + source_texts)
  2. DELETE Redis key bento:data:{provider}:{name}
  3. Delete OG image from storage
  4. Invalidate /explore cache
  │
  ▼
Redirect to /admin with success toast
```

### Regenerate Flow

```
Admin visits /admin/m/:provider/:model
  │
  ▼
Clicks "Regenerate" → confirmation ("Re-extract and rebuild bento?")
  │
  ▼
Astro server action:
  1. Fetch source_texts.content for this model
  2. Run through llm-extractor (same Claude extraction pipeline)
  3. Claude re-extracts structured data from the original text
  │
  ▼
Show preview of the new bento layout alongside the current one
  │
  ▼
Admin clicks "Confirm Regenerate"
  │
  ▼
Astro server action:
  1. UPDATE bento_pages SET layout = :new, extracted = :new, updated_at = now()
  2. Fire-and-forget: regenerate OG image
  3. DELETE Redis key bento:data:{provider}:{name}
  4. Invalidate /explore cache
  │
  ▼
Redirect to /m/:provider/:model (refreshed page)
```

### Ban / Unban Flow

```
Admin visits /admin/users (searchable user table)
  │
  ▼
Clicks a user row → /admin/users/:id
  │
  ▼
Sees user info: username, avatar, join date, models created, ban status
  │
  ├── NOT BANNED → "Ban User" button
  │     │
  │     ▼
  │   Enter optional reason → confirm
  │     │
  │     ▼
  │   UPDATE users SET banned_at = now(), banned_reason = :reason, updated_at = now()
  │
  └── BANNED → Shows banned_at date + reason, "Unban User" button
        │
        ▼
      Confirm → UPDATE users SET banned_at = NULL, banned_reason = NULL, updated_at = now()
```

Banned users experience:
- `/generate` shows a "Your account has been suspended" page with the reason (if provided)
- `/dashboard` still works (they can see their past creations)
- Their published bento pages remain live and publicly viewable
- They can still log in and browse — only generation is blocked

### Admin UI

The admin dashboard (`/admin`) shows:
- Total models, total users, banned users count, models created today
- Quick links to model management and user management

The model list (`/admin` main table):
- Searchable/filterable table of all models
- Each row links to `/admin/m/:provider/:model`

The model admin page (`/admin/m/:provider/:model`):
- Current bento page (embedded preview)
- Model metadata (creator, created date, source type)
- "Delete" button (red, with confirmation)
- "Regenerate" button (with side-by-side preview before confirming)

The user list (`/admin/users`):
- Searchable table of all users
- Columns: avatar, username, GitHub ID, models created, ban status, join date
- Banned users highlighted with a visual indicator
- Each row links to `/admin/users/:id`

The user detail page (`/admin/users/:id`):
- User profile (avatar, username, GitHub link)
- List of bento pages they've created (links to each)
- Ban status: if banned, shows date + reason
- "Ban User" button (with reason input) or "Unban User" button

---

## Project Structure

```
model-bento/
├── astro.config.mjs
├── package.json
├── drizzle.config.ts
├── tsconfig.json
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro            # HTML shell, meta tags, nav
│   ├── pages/
│   │   ├── index.astro                 # Landing page
│   │   ├── explore.astro               # Browse all models
│   │   ├── m/[provider]/[model].astro  # Bento page (SSR)
│   │   ├── m/[provider]/[model]/embed.astro  # Embed view
│   │   ├── generate.astro              # Upload form (auth-gated)
│   │   ├── dashboard.astro             # User's created bentos
│   │   ├── admin/
│   │   │   ├── index.astro             # Admin dashboard
│   │   │   ├── users/
│   │   │   │   ├── index.astro         # User list with ban status
│   │   │   │   └── [id].astro          # User detail + ban/unban
│   │   │   └── m/[provider]/[model]/
│   │   │       ├── index.astro         # Manage model page
│   │   │       ├── delete.astro        # Delete confirmation
│   │   │       └── regenerate.astro    # Regenerate preview + confirm
│   │   └── auth/
│   │       ├── login.astro
│   │       └── callback.astro
│   ├── components/
│   │   ├── bento/
│   │   │   ├── BentoGrid.tsx           # Main grid layout (React)
│   │   │   ├── HeroCard.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── BenchmarkCard.tsx
│   │   │   ├── ChartCard.tsx
│   │   │   ├── CapabilitiesCard.tsx
│   │   │   ├── LimitationsCard.tsx
│   │   │   └── TrainingCard.tsx
│   │   ├── upload/
│   │   │   ├── UploadForm.tsx          # PDF upload + text paste
│   │   │   └── PreviewPane.tsx         # Live preview before publish
│   │   ├── explore/
│   │   │   ├── ModelGrid.tsx           # Browse grid
│   │   │   └── SearchBar.tsx
│   │   ├── admin/
│   │   │   ├── AdminModelTable.tsx     # Searchable model list
│   │   │   ├── AdminUserTable.tsx      # Searchable user list with ban status
│   │   │   ├── BanUserForm.tsx         # Ban reason input + confirm
│   │   │   ├── DeleteConfirm.tsx       # Delete confirmation modal
│   │   │   └── RegeneratePreview.tsx   # Side-by-side old vs new
│   │   └── shared/
│   │       ├── Nav.astro
│   │       ├── Footer.astro
│   │       └── OGMeta.astro
│   ├── middleware/
│   │   └── admin.ts                    # Admin gate: check ADMIN_GITHUB_IDS, return 404 if not admin
│   ├── lib/
│   │   ├── db.ts                       # Drizzle ORM setup
│   │   ├── schema.ts                   # Drizzle schema (source of truth for DB)
│   │   ├── auth.ts                     # Auth.js config
│   │   ├── admin.ts                    # isAdmin() helper, reads ADMIN_GITHUB_IDS env var
│   │   ├── redis.ts                    # Redis client + cache helpers
│   │   ├── layout-engine.ts            # Bento layout algorithm
│   │   └── services/
│   │       ├── pdf-parser.ts           # pdf-parse wrapper
│   │       ├── llm-extractor.ts        # Claude API structured extraction
│   │       └── og-generator.ts         # @vercel/og image generation
│   └── styles/
│       └── global.css                  # Tailwind base + bento tokens
├── public/
│   └── provider-logos/                 # Anthropic, OpenAI, Meta, etc.
├── railway.toml
├── PLAN.md                             # This file
└── CLAUDE.md
```

---

## Implementation Order

### Progress

- [x] **Phase 1: Foundation** — all steps complete (1.1–1.4), 15 tests passing
- [x] **2.1** — PDF parser ✅
- [x] **2.2** — Claude extraction service ✅
- [x] **2.3** — Model existence check ✅
- [x] **2.4** — Generation server action (wiring) ✅
- [x] **3.1** — Layout engine ✅
- [x] **3.2** — Bento card components ✅
- [x] **3.3** — Theming + responsive grid ✅
- [x] **3.4** — Animations ✅
- [x] **4.1** — Publish transaction ✅
- [x] **4.2** — SSR bento page ✅
- [x] **4.3** — Redis data caching ✅
- [x] **4.4** — Explore page ✅
- [x] **5.1** — OG meta tags ✅
- [ ] **5.2** — OG image generation
- [ ] **Phase 5.3+** — not started

**Current test count: 64 passing** (46 Vitest + 18 Playwright)

### Testing Infrastructure

Set up before Phase 1. All subsequent steps follow red → green → refactor.

- **Vitest** for unit and integration tests
- **Playwright** for E2E browser tests (Phases 4+)
- **Test Postgres database** — separate from dev, wiped between test suites
- **Test fixtures** in `tests/fixtures/`:
  - `sample-model-card.pdf` — a real model card PDF for parser tests
  - `sample-model-card.txt` — the expected text output from that PDF
  - `sample-extracted.json` — a known-good Claude extraction result (for mocking)
  - `sample-layout.json` — a known-good layout engine output
- **Claude mock** — `llm-extractor` accepts an optional client parameter so tests can inject a mock instead of calling the real API

---

### Phase 1: Foundation

**1.1 — Astro project scaffold**

- Build: Initialize Astro 5 with Node adapter, Tailwind v4, React integration, Vitest
- Test (red): `vitest run` exits 0, a placeholder test in `tests/setup.test.ts` passes
- Green: `bun run dev` starts without errors, placeholder test passes, Tailwind classes render in a test page

**1.2 — Drizzle schema + DB connection**

- Build: `src/lib/schema.ts` (all 4 tables), `src/lib/db.ts`, `drizzle.config.ts`
- Test (red):
  ```
  test("can connect to database and run a query")
    → SELECT 1 via Drizzle client — should return successfully

  test("all tables exist after migration")
    → query information_schema.tables for users, models, bento_pages, source_texts

  test("UNIQUE constraint on models(provider, name)")
    → insert two models with same provider+name — second should throw

  test("CASCADE delete from models removes bento_pages and source_texts")
    → insert model + bento_page + source_text, delete model, verify all gone
  ```
- Green: `bunx drizzle-kit generate` produces migration, `bunx drizzle-kit migrate` applies it, all 4 tests pass

**1.3 — Redis connection**

- Build: `src/lib/redis.ts` — client setup, `cacheGet`, `cacheSet`, `cacheDelete` helpers
- Test (red):
  ```
  test("can set and get a cached value")
  test("can delete a cached key")
  test("expired keys return null")
  ```
- Green: all 3 tests pass against test Redis instance

**1.4 — Auth.js with GitHub OAuth**

- Build: `src/lib/auth.ts`, `src/pages/auth/login.astro`, `src/pages/auth/callback.astro`, `src/pages/auth/logout.astro`
- Test (red):
  ```
  test("unauthenticated request to /generate redirects to /auth/login")
  test("authenticated session contains github_id, username, avatar_url")
  test("/auth/logout clears the session")
  ```
- Green: all 3 tests pass. Manual verification: click "Login with GitHub" in browser, complete OAuth, session is set, redirected back.

**Phase 1 checkpoint:** `bun run dev` serves a page. Vitest suite passes (~10 tests). DB has 4 empty tables. Redis connects. OAuth flow works end-to-end in a browser.

---

### Phase 2: Core Pipeline

**2.1 — PDF parser**

- Build: `src/lib/services/pdf-parser.ts`
- Test (red):
  ```
  test("extracts text from a valid PDF")
    → parse tests/fixtures/sample-model-card.pdf
    → output contains expected strings from the known PDF

  test("rejects files over 20MB")
    → pass a >20MB buffer → should throw with a clear size error

  test("rejects non-PDF files")
    → pass a .txt file renamed to .pdf → should throw or return empty gracefully

  test("returns empty string for PDF with no extractable text")
    → pass a scanned-image-only PDF → returns "" or throws descriptive error
  ```
- Green: all 4 tests pass

**2.2 — Claude extraction service**

- Build: `src/lib/services/llm-extractor.ts`, Zod schema for extracted data
- Test (red), using injected mock client:
  ```
  test("extracts structured data from model card text")
    → pass sample-model-card.txt with mock returning sample-extracted.json
    → output matches Zod schema, has provider, name, display_name, benchmarks, capabilities

  test("rejects malformed Claude response and retries")
    → mock returns invalid JSON on first call, valid on second
    → should succeed after retry, total calls = 2

  test("fails after max retries with clear error")
    → mock returns invalid JSON on all 3 calls
    → throws ExtractionError with message matching /extraction failed/i

  test("handles Claude API timeout")
    → mock throws a timeout error
    → retries, eventually fails with clear error

  test("Zod schema rejects missing required fields")
    → pass JSON missing 'provider' field → Zod parse fails
  ```
- Green: all 5 tests pass
- **Live smoke test**: run extractor once against the real Claude API with `sample-model-card.txt`. Verify the output is sensible. This is a manual one-time check, not part of the automated suite.

**2.3 — Model existence check**

- Build: helper function `checkModelExists(provider, name)` in `src/lib/services/model-check.ts`
- Test (red):
  ```
  test("returns { exists: false } for unknown model")
    → query for 'nonexistent/model' → { exists: false }

  test("returns { exists: true, provider, name } for existing model")
    → insert a model, query for it → { exists: true, provider: '...', name: '...' }
  ```
- Green: both tests pass

**2.4 — Generation server action (wiring)**

- Build: server action in `/generate` that chains parse → extract → check → return preview data
- Test (red):
  ```
  test("text input → extraction → preview data returned")
    → POST to generate action with { text: sample-model-card.txt } (mock LLM)
    → response contains extracted data + layout

  test("PDF input → parse → extraction → preview data returned")
    → POST multipart with sample-model-card.pdf (mock LLM)
    → response contains extracted data + layout

  test("existing model returns 'already exists' with link")
    → seed DB with model, POST text that extracts to same provider+name
    → response indicates model exists

  test("unauthenticated request is rejected")
    → POST without session → 401 or redirect
  ```
- Green: all 4 tests pass

**Phase 2 checkpoint:** paste or upload a model card in the browser → see structured JSON returned and displayed as raw data on the preview page. The extraction pipeline works end-to-end. ~21 tests passing.

---

### Phase 3: Bento Rendering

**3.1 — Layout engine**

- Build: `src/lib/layout-engine.ts`
- Test (red):
  ```
  test("produces a valid grid layout from extracted data")
    → pass sample-extracted.json
    → output is array of card objects with { type, gridColumn, gridRow, data }

  test("hero card is always present and 2x2")
    → any valid input → layout includes exactly one hero card at 2x2

  test("high-score benchmarks get 2x1 cards, low-score get 1x1")
    → input with benchmark score=95 → that benchmark gets a 2x1 card
    → input with benchmark score=40 → that benchmark gets a 1x1 card

  test("handles minimal data gracefully")
    → input with only provider + name (no benchmarks, no capabilities)
    → still produces a valid layout with hero + whatever stats are available

  test("handles maximal data without overflow")
    → input with 20 benchmarks, 10 capabilities, 5 limitations
    → layout fits within 12-column grid, no overlapping areas

  test("output matches sample-layout.json for known input")
    → pass sample-extracted.json → matches fixture (snapshot test)
  ```
- Green: all 6 tests pass

**3.2 — Bento card components**

- Build: `BentoGrid.tsx`, `HeroCard.tsx`, `StatCard.tsx`, `BenchmarkCard.tsx`, `ChartCard.tsx`, `CapabilitiesCard.tsx`, `LimitationsCard.tsx`, `TrainingCard.tsx`
- Test (red):
  ```
  test("BentoGrid renders correct number of cards for layout")
    → pass sample-layout.json → rendered output has N card elements

  test("HeroCard displays model name and provider")
    → render HeroCard with { displayName: 'Claude Sonnet 4', provider: 'anthropic' }
    → text content includes both strings

  test("StatCard formats large numbers with abbreviations")
    → render StatCard with { value: 175000000000 }
    → displays "175B" not "175000000000"

  test("BenchmarkCard renders score bar at correct width")
    → render with { score: 85, maxScore: 100 }
    → bar element has width ~85%

  test("ChartCard renders a Recharts chart without crashing")
    → render with array of benchmark data → no errors thrown

  test("CapabilitiesCard renders all tags")
    → render with 5 capabilities → 5 tag elements present

  test("each card type has correct grid sizing class")
    → HeroCard has col-span-2 row-span-2
    → StatCard has col-span-1 row-span-1 (etc.)
  ```
- Green: all 7 tests pass

**3.3 — Theming + responsive grid**

- Build: `global.css` with Tailwind tokens (border-radius, gap, font stack, color palette), CSS Grid with `grid-template-areas`, responsive breakpoints
- Test (red, Playwright):
  ```
  test("bento grid is 12 columns on desktop viewport")
    → load preview page at 1280px width
    → grid container computed style shows 12-column template

  test("bento grid stacks to single column on mobile viewport")
    → load preview page at 375px width
    → all cards are full-width

  test("cards have 1.5rem border-radius")
    → check computed border-radius on first card element

  test("cards have 1.5rem gap between them")
    → check computed gap on grid container
  ```
- Green: all 4 tests pass. Visual check in browser confirms Apple aesthetic at both breakpoints.

**3.4 — Animations**

- Build: Motion One staggered fade-in on scroll for cards
- Test (red, Playwright):
  ```
  test("cards are not visible before scrolling into view")
    → load page, cards below fold have opacity: 0

  test("cards animate in when scrolled into view")
    → scroll to bento grid, wait 1s
    → cards now have opacity: 1
  ```
- Green: both tests pass. Visual check confirms staggered animation looks smooth.

**Phase 3 checkpoint:** the preview page from Phase 2 now renders a styled bento grid instead of raw JSON. Cards are laid out correctly, styled with the Apple aesthetic, responsive, and animated. Paste model card text in browser → see a beautiful bento preview. ~38 tests passing.

---

### Phase 4: Publishing & Viewing

**4.1 — Publish transaction**

- Build: server action that writes `models` + `bento_pages` + `source_texts` in a single DB transaction, invalidates Redis
- Test (red):
  ```
  test("publish creates model, bento_page, and source_text in one transaction")
    → call publish action with valid data
    → all 3 tables have matching rows

  test("publish fails atomically if model already exists")
    → seed a model, try to publish same provider+name
    → no new rows in any table (transaction rolled back)

  test("publish invalidates explore cache")
    → seed Redis with explore:models key, publish a model
    → explore:models key is gone

  test("published bento_page has correct layout and extracted JSONB")
    → publish, read back bento_page → layout and extracted match input
  ```
- Green: all 4 tests pass

**4.2 — SSR bento page**

- Build: `src/pages/m/[provider]/[model].astro`
- Test (red, Playwright):
  ```
  test("published model page returns 200")
    → seed DB with model + bento_page
    → GET /m/anthropic/claude-sonnet-4 → status 200

  test("page renders the model's display name")
    → page text content includes 'Claude Sonnet 4'

  test("nonexistent model returns 404")
    → GET /m/fake/model → status 404

  test("page has Cache-Control header for immutable content")
    → check response headers on published page
  ```
- Green: all 4 tests pass. Open `/m/anthropic/claude-sonnet-4` in browser — full bento page renders.

**4.3 — Redis data caching**

- Build: cache `extracted` + `layout` JSONB on first SSR render, serve from cache on subsequent requests
- Test (red):
  ```
  test("first page load populates Redis cache")
    → GET /m/anthropic/claude-sonnet-4 (cache empty)
    → Redis key bento:data:anthropic:claude-sonnet-4 now exists

  test("second page load serves from cache, not DB")
    → populate cache, delete DB row, GET page → still returns 200 with correct data

  test("cache key is deleted after admin delete")
    → populate cache, run delete action → key gone
  ```
- Green: all 3 tests pass

**4.4 — Explore page**

- Build: `src/pages/explore.astro`, `ModelGrid.tsx`, `SearchBar.tsx`
- Test (red, Playwright):
  ```
  test("explore page lists all published models")
    → seed 3 models with bento pages
    → GET /explore → page shows all 3 model names

  test("explore page shows no models when DB is empty")
    → GET /explore → page shows empty state message

  test("search filters models by name")
    → seed 3 models, type 'claude' in search
    → only Claude model(s) visible
  ```
- Green: all 3 tests pass. Browse `/explore` in browser — models display as cards with search working.

**Phase 4 checkpoint:** full publish flow works end-to-end in browser. Upload/paste → preview → publish → redirected to live bento page at `/m/:provider/:model`. Explore page shows all published models with search. Redis caching is active. ~52 tests passing.

---

### Phase 5: SEO & Sharing

**5.1 — OG meta tags**

- Build: `OGMeta.astro` component, used in bento page layout
- Test (red):
  ```
  test("bento page has og:title matching display name")
    → GET /m/anthropic/claude-sonnet-4
    → HTML contains <meta property="og:title" content="Claude Sonnet 4" />

  test("bento page has og:description")
    → response HTML contains <meta property="og:description" content="..." />

  test("bento page has og:image")
    → response HTML contains <meta property="og:image" content="..." />

  test("bento page has twitter:card=summary_large_image")
    → response HTML contains correct twitter meta tag

  test("bento page has canonical URL")
    → response HTML contains <link rel="canonical" href="https://modelbento.com/m/anthropic/claude-sonnet-4" />
  ```
- Green: all 5 tests pass

**5.2 — OG image generation**

- Build: `src/lib/services/og-generator.ts`
- Test (red):
  ```
  test("generates a PNG image buffer from model data")
    → call generator with { displayName, provider, highlights }
    → returns a Buffer, first bytes are PNG magic number (89 50 4E 47)

  test("generated image is reasonable size (< 500KB)")
    → image buffer length is under 500KB

  test("publish triggers async OG generation")
    → publish a model, wait briefly
    → bento_pages.og_image_url is populated (not null)
  ```
- Green: all 3 tests pass. Share a bento page URL in Slack/Discord — preview image renders.

**5.3 — JSON-LD structured data**

- Build: JSON-LD `SoftwareApplication` block in bento page `<head>`
- Test (red):
  ```
  test("bento page has valid JSON-LD script tag")
    → GET page → parse <script type="application/ld+json"> content
    → valid JSON with @type: "SoftwareApplication"

  test("JSON-LD contains model name and provider")
    → parsed JSON has name and author fields matching model data
  ```
- Green: both tests pass

**5.4 — Sitemap**

- Build: auto-generated `/sitemap.xml` from models table
- Test (red):
  ```
  test("sitemap contains all published model URLs")
    → seed 3 models → GET /sitemap.xml
    → XML contains 3 <url> entries with correct /m/:provider/:model paths

  test("sitemap updates after publish")
    → GET sitemap (3 models), publish a 4th
    → GET sitemap again → now 4 entries

  test("sitemap updates after delete")
    → delete a model → sitemap has one fewer entry
  ```
- Green: all 3 tests pass

**Phase 5 checkpoint:** share a bento page URL on social media — OG title, description, and image all render correctly. Google's Rich Results Test validates the JSON-LD. `/sitemap.xml` lists all published models. ~63 tests passing.

---

### Phase 6: Admin

**6.1 — Admin middleware**

- Build: `src/middleware/admin.ts`, `src/lib/admin.ts` (`isAdmin()` helper)
- Test (red):
  ```
  test("isAdmin returns true for GitHub ID in ADMIN_GITHUB_IDS")
    → env ADMIN_GITHUB_IDS=12345, check isAdmin(12345) → true

  test("isAdmin returns false for GitHub ID not in list")
    → check isAdmin(99999) → false

  test("admin route returns 404 for non-admin user")
    → authenticate as non-admin, GET /admin → 404 (not 403)

  test("admin route returns 200 for admin user")
    → authenticate as admin, GET /admin → 200

  test("unauthenticated request to admin route returns 404")
    → GET /admin with no session → 404
  ```
- Green: all 5 tests pass

**6.2 — Admin dashboard + model list**

- Build: `src/pages/admin/index.astro`, `AdminModelTable.tsx`
- Test (red, Playwright):
  ```
  test("admin dashboard shows correct stats")
    → seed 5 models, 3 users (1 banned)
    → page shows "5 models", "3 users", "1 banned"

  test("model table lists all models with search")
    → seed 5 models, type search query → filtered results shown

  test("model table row links to admin model page")
    → click model row → navigated to /admin/m/:provider/:model
  ```
- Green: all 3 tests pass

**6.3 — Model delete flow**

- Build: `src/pages/admin/m/[provider]/[model]/delete.astro`, `DeleteConfirm.tsx`
- Test (red):
  ```
  test("delete removes model, bento_page, and source_text")
    → seed full model, call delete action
    → all 3 tables have no rows for that model

  test("delete invalidates Redis cache")
    → seed cache key, delete model → key gone

  test("delete redirects to /admin")
    → trigger delete → response redirects to /admin

  test("non-admin cannot call delete action")
    → call delete as non-admin → 404
  ```
- Green: all 4 tests pass. In browser: click Delete → confirmation modal → confirm → model gone, redirected to admin.

**6.4 — Model regenerate flow**

- Build: `src/pages/admin/m/[provider]/[model]/regenerate.astro`, `RegeneratePreview.tsx`
- Test (red):
  ```
  test("regenerate fetches source_text and re-extracts")
    → seed model with source_text, call regenerate (mock LLM)
    → new extracted data differs from old, bento_pages.updated_at changed

  test("regenerate shows side-by-side preview before confirming")
    → GET regenerate page (Playwright) → page has both old and new bento grids

  test("regenerate confirm updates bento_pages but not model identity")
    → confirm regeneration
    → bento_pages.extracted updated, models.provider+name unchanged

  test("regenerate invalidates Redis cache")
    → confirm → cache key for that model is gone

  test("non-admin cannot call regenerate action")
    → call as non-admin → 404
  ```
- Green: all 5 tests pass

**6.5 — User list + detail page**

- Build: `src/pages/admin/users/index.astro`, `[id].astro`, `AdminUserTable.tsx`
- Test (red, Playwright):
  ```
  test("user list shows all users with ban status")
    → seed 3 users (1 banned) → page shows 3 rows, 1 with banned indicator

  test("user detail page shows user info and their models")
    → seed user with 2 models → detail page shows username, avatar, 2 model links

  test("user list is searchable by username")
    → seed 3 users, type username in search → only matching user shown
  ```
- Green: all 3 tests pass

**6.6 — Ban/unban flow**

- Build: `BanUserForm.tsx`, ban/unban server actions
- Test (red):
  ```
  test("ban sets banned_at and banned_reason on user")
    → call ban action with reason → user.banned_at is set, user.banned_reason matches

  test("unban clears banned_at and banned_reason")
    → ban a user, then unban → both fields are null

  test("banned user sees suspended page on /generate")
    → ban a user, authenticate as them, GET /generate
    → page shows "account suspended" message with reason

  test("banned user can still access /dashboard")
    → ban a user, GET /dashboard as them → 200, shows their models

  test("unbanned user can access /generate again")
    → ban then unban → GET /generate → upload form shown (not suspended)

  test("non-admin cannot call ban/unban actions")
    → call ban as non-admin → 404
  ```
- Green: all 6 tests pass. In browser: admin bans user → that user sees "suspended" on /generate → admin unbans → user can generate again.

**Phase 6 checkpoint:** full admin system works. Admin can browse models, delete them, regenerate from stored source text, browse users, ban/unban. Non-admins see 404 on all admin routes. Banned users are blocked from generation. ~89 tests passing.

---

### Phase 7: Polish

**7.1 — Landing page**

- Build: `src/pages/index.astro` — hero, search, featured models
- Test (red, Playwright):
  ```
  test("landing page renders hero section")
    → GET / → 200, page has h1 and call-to-action button

  test("landing page shows featured models")
    → seed 3 models → featured section shows model cards

  test("search from landing page navigates to /explore with query")
    → type 'claude' in hero search, submit → navigated to /explore?q=claude
  ```
- Green: all 3 tests pass

**7.2 — User dashboard**

- Build: `src/pages/dashboard.astro`
- Test (red, Playwright):
  ```
  test("dashboard shows models created by current user")
    → seed 2 models by user A, 1 by user B, auth as A
    → page shows 2 models

  test("dashboard shows empty state for user with no models")
    → auth as user with 0 models → empty state message + CTA to generate

  test("unauthenticated user is redirected to login")
    → GET /dashboard with no session → redirect to /auth/login
  ```
- Green: all 3 tests pass

**7.3 — Embed view**

- Build: `src/pages/m/[provider]/[model]/embed.astro`
- Test (red, Playwright):
  ```
  test("embed page renders without nav or footer")
    → GET /m/anthropic/claude-sonnet-4/embed
    → no <nav> or <footer> elements in DOM

  test("embed page has 'View on Model Bento' link")
    → page has link to /m/anthropic/claude-sonnet-4

  test("embed page shows hero + top stats (compact layout)")
    → page has hero card + stat cards, fewer than full page

  test("embed response has permissive X-Frame-Options")
    → response header allows framing
  ```
- Green: all 4 tests pass. Embed URL works inside an `<iframe>` on a test HTML page.

**7.4 — Rate limiting**

- Build: Redis-based rate limiter on `/generate` action (e.g., 5 generations per user per hour)
- Test (red):
  ```
  test("allows requests under the rate limit")
    → 5 generate requests from same user → all succeed

  test("blocks requests over the rate limit")
    → 6th request within the hour → 429 response with retry-after

  test("rate limit resets after window expires")
    → hit limit, advance time past window, try again → succeeds

  test("rate limit is per-user, not global")
    → user A at limit, user B makes a request → B succeeds
  ```
- Green: all 4 tests pass

**7.5 — Error handling + loading states**

- Build: error boundaries in React islands, loading skeletons for async operations, toast notifications for server action results
- Test (red, Playwright):
  ```
  test("upload form shows loading state during extraction")
    → submit form (mock slow LLM) → spinner/skeleton visible before result

  test("extraction failure shows error message, not a crash")
    → submit form (mock LLM fails) → error toast/message shown, form still usable

  test("publish failure shows error message")
    → trigger publish with a duplicate model → error message shown

  test("404 page renders for unknown routes")
    → GET /nonexistent → 404 page with navigation back
  ```
- Green: all 4 tests pass

**7.6 — Mobile responsive pass**

- Test (red, Playwright at 375px viewport):
  ```
  test("nav collapses to mobile menu")
    → nav links hidden, hamburger/menu button visible

  test("bento grid stacks single-column on mobile")
    → all cards are full-width (no side-by-side)

  test("upload form is usable on mobile")
    → text area and submit button are full-width, not clipped

  test("explore grid shows 1 column on mobile")
    → model cards stack vertically
  ```
- Green: all 4 tests pass. Manually check on real phone or device emulation.

**Phase 7 checkpoint:** full app is polished. Landing page, dashboard, embed view, rate limiting, error states, and mobile responsiveness all working. ~107 tests passing.

---

### Final Verification

Before considering the app launch-ready:

```
bun run test              # all ~107 Vitest + Playwright tests pass
bun run build             # production build succeeds with no errors
bun run preview           # preview server runs, manual smoke test:
```

Manual smoke test checklist:
- [ ] Landing page loads, featured models show
- [ ] OAuth login + logout works
- [ ] Upload PDF → preview → publish → live page
- [ ] Paste text → preview → publish → live page
- [ ] Duplicate model shows "already exists"
- [ ] `/explore` lists models, search filters
- [ ] `/dashboard` shows your models
- [ ] Share a bento URL on social media — OG image renders
- [ ] Embed URL works in an iframe
- [ ] Admin: delete a model, verify it's gone
- [ ] Admin: regenerate a model, verify content updated
- [ ] Admin: ban a user, verify they see suspended page on /generate
- [ ] Admin: unban, verify they can generate again
- [ ] Rate limit: hit the limit, see 429
- [ ] Mobile: full flow on 375px viewport

---

## Environment Variables

```
DATABASE_URL=          # Railway Postgres connection string
REDIS_URL=             # Railway Redis connection string
GITHUB_CLIENT_ID=      # GitHub OAuth app
GITHUB_CLIENT_SECRET=  # GitHub OAuth app
AUTH_SECRET=            # Auth.js session secret
ANTHROPIC_API_KEY=     # Claude API key
PUBLIC_SITE_URL=       # https://modelbento.com
ADMIN_GITHUB_IDS=      # Comma-separated GitHub user IDs for admin access
```
