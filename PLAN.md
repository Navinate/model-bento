# Model Bento — Implementation Plan

A public registry of Apple-style bento presentations for AI model cards.
Upload a model card PDF/text → get a beautiful, shareable bento page.

## Architecture

```
Railway Project
├── astro-frontend/          Astro 5 SSR (Node adapter)
│   ├── Public bento pages   (SSR, cached)
│   ├── GitHub OAuth          (Auth.js)
│   └── Calls python-api via Railway private networking
│
├── python-api/              FastAPI
│   ├── PDF parsing          (pdfplumber / PyMuPDF)
│   ├── AI extraction        (Claude API → structured data)
│   └── No public exposure   (internal only)
│
├── postgresql               Railway-managed
└── redis                    Railway-managed (cache + sessions)
```

### Service Communication

- `astro-frontend` → `python-api` via Railway private networking
  (`http://python-api.railway.internal:8000`)
- Only `astro-frontend` is publicly exposed
- `python-api` handles CPU-intensive PDF parsing + LLM calls

---

## Tech Stack

| Layer            | Choice                          | Notes                                    |
|------------------|---------------------------------|------------------------------------------|
| Frontend SSR     | Astro 5 (Node adapter)          | SSR for public pages, static where possible |
| Interactive UI   | React 19 (Astro islands)        | Upload form, preview, dashboard          |
| Styling          | Tailwind CSS v4                 | Apple aesthetic: clean, whitespace, rounded |
| Animations       | Motion One                      | Lightweight, works outside React         |
| Auth             | Auth.js (Astro integration)     | GitHub OAuth only                        |
| PDF Parsing      | pdfplumber + PyMuPDF            | Best-in-class PDF table/text extraction  |
| AI Extraction    | Claude API (Anthropic Python SDK) | Sonnet for structured extraction       |
| Charts           | Recharts (React islands)        | SSR-friendly, simple API                 |
| ORM (Python)     | SQLAlchemy 2.0 + asyncpg        | Async Postgres access                    |
| ORM (Astro)      | Drizzle ORM                     | Lightweight, TypeScript-native           |
| Database         | PostgreSQL (Railway)            | Structured data + JSONB flexibility      |
| Cache            | Redis (Railway)                 | Page cache, rate limiting, sessions      |
| Deploy           | Railway (all services)          | Private networking between services      |

---

## Route Map

### Public (no auth required)

| Route                          | Description                              |
|--------------------------------|------------------------------------------|
| `/`                            | Landing page — hero, search, featured models |
| `/explore`                     | Browse all published bento pages         |
| `/m/:provider/:model`          | Individual bento page (the core product) |
| `/m/:provider/:model/embed`    | Lightweight embed view (iframe-friendly) |

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
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE models (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      TEXT NOT NULL,
    name          TEXT NOT NULL,
    version       TEXT,
    slug          TEXT UNIQUE NOT NULL,     -- 'anthropic/claude-sonnet-4'
    display_name  TEXT NOT NULL,            -- 'Claude Sonnet 4'
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE(provider, name, version)
);

CREATE TABLE bento_pages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id      UUID UNIQUE REFERENCES models(id) ON DELETE CASCADE,
    layout        JSONB NOT NULL,           -- card positions, sizes, types
    extracted     JSONB NOT NULL,           -- full extracted model card data
    source_text   TEXT NOT NULL,            -- original PDF-extracted text or pasted text (for regeneration)
    source_type   TEXT NOT NULL DEFAULT 'text', -- 'pdf' or 'text'
    og_image_url  TEXT,
    published_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE benchmarks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id      UUID REFERENCES models(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    score         DECIMAL,
    max_score     DECIMAL,
    category      TEXT,
    UNIQUE(model_id, name)
);
```

Key constraints:
- `models.slug` is UNIQUE — one page per model, enforced at DB level
- `bento_pages.model_id` is UNIQUE — one bento per model
- No update/edit routes for regular users — pages are immutable after publish
- Admins can delete or regenerate any page (see Admin section below)

---

## Python API (FastAPI) — Internal Endpoints

```
POST /api/extract
  Body: multipart/form-data (PDF file) OR { "text": "..." }
  Returns: {
    provider, name, version, display_name,
    parameters: { total, active, context_window },
    benchmarks: [{ name, score, max_score, category }],
    capabilities: [...],
    limitations: [...],
    training: { data_cutoff, dataset_info },
    highlights: [{ label, value, unit }]
  }
  Auth: Validated via internal shared secret header

POST /api/check-model
  Body: { provider, name, version }
  Returns: { exists: bool, slug?: string }

POST /api/generate-og
  Body: { model_slug, display_name, highlights }
  Returns: { og_image_url }
  Note: Generates a social preview image (Pillow or Satori)
```

### Claude Extraction Prompt Strategy

The Python service sends the raw PDF text to Claude with a structured output prompt:

1. **Identity extraction**: Model name, provider, version — used for deduplication
2. **Metrics extraction**: Parameter counts, context window, benchmark scores
3. **Qualitative extraction**: Capabilities, limitations, safety info, use cases
4. **Highlight selection**: AI picks the 3-5 most impressive/notable stats for hero cards

Claude returns JSON matching a Pydantic model. Validation catches malformed output.

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
- Dark mode: Default, with light mode toggle

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
Upload PDF or paste model card text
  │
  ▼
Astro server action sends to python-api /api/extract
  │
  ▼
Python parses PDF (pdfplumber) → raw text
  │
  ▼
Raw text → Claude API with structured extraction prompt
  │
  ▼
Claude returns structured JSON → validated via Pydantic
  │
  ▼
Astro calls /api/check-model with { provider, name, version }
  │
  ├── EXISTS → Show "This model already has a page" + link
  │
  └── NEW → Show preview page with generated bento layout
         │
         ▼
      User clicks "Publish"
         │
         ▼
      Astro server action:
        1. INSERT into models (with slug)
        2. INSERT into bento_pages (layout + extracted JSONB)
        3. INSERT into benchmarks (individual rows)
        4. Trigger OG image generation (async)
        5. Invalidate Redis cache for /explore
         │
         ▼
      Redirect to /m/:provider/:model (the published page)
```

---

## SEO & Sharing

### Per bento page (`/m/:provider/:model`)

- **SSR** with aggressive Cache-Control headers (immutable content)
- **Meta tags**: title, description auto-generated from model data
- **Open Graph**: `og:title`, `og:description`, `og:image` (auto-generated preview)
- **Twitter Card**: `twitter:card=summary_large_image`
- **Structured data**: JSON-LD `SoftwareApplication` schema
- **Canonical URL**: `https://modelbento.com/m/:provider/:model`

### OG Image Generation

Auto-generated image per model showing:
- Model name + provider
- 3 key stats in bento mini-layout
- Generated server-side via Satori (SVG→PNG) or Pillow

### Caching Strategy

- Published bento pages cached in Redis (HTML fragment)
- Cache key: `bento:page:{slug}`
- Pages are immutable for regular users — cache only invalidated by admin actions (delete/regenerate)
- `/explore` page cached with 5-minute TTL
- Cache warmed on publish

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
| **Delete**     | Removes model + bento page + benchmarks (CASCADE). Invalidates Redis cache. Frees the slug so the model can be re-created by any user. |
| **Regenerate** | Re-runs Claude extraction on the stored `source_text`, replaces `layout`, `extracted`, and `benchmarks` in-place. Invalidates cache + regenerates OG image. Model identity (slug, provider, name) stays the same. |
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
  1. DELETE FROM models WHERE slug = :slug  (CASCADE deletes bento_pages + benchmarks)
  2. DELETE Redis key bento:page:{slug}
  3. DELETE OG image from storage
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
  1. Fetch bento_pages.source_text for this model
  2. Send source_text to python-api POST /api/extract
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
  1. UPDATE bento_pages SET layout = :new_layout, extracted = :new_extracted
  2. DELETE + re-INSERT benchmarks for this model
  3. Trigger OG image regeneration (async)
  4. DELETE Redis key bento:page:{slug}
  5. Invalidate /explore cache
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
  │   UPDATE users SET banned_at = now(), banned_reason = :reason WHERE id = :id
  │
  └── BANNED → Shows banned_at date + reason, "Unban User" button
        │
        ▼
      Confirm → UPDATE users SET banned_at = NULL, banned_reason = NULL WHERE id = :id
```

Banned users experience:
- `/generate` shows a "Your account has been suspended" page with the reason (if provided)
- `/dashboard` still works (they can see their past creations)
- Their published bento pages remain live and publicly viewable
- They can still log in and browse — only generation is blocked

### Why Store source_text?

Regeneration requires the original model card content. Rather than storing
uploaded PDFs as blobs (expensive, complex), we store the extracted raw text
from the PDF parsing step. This is what gets sent to Claude anyway, so it's
the right level of abstraction. The `source_type` field tracks whether the
original input was a PDF or pasted text (for display purposes in admin UI).

### Admin API Endpoints (Python — internal)

The existing `POST /api/extract` endpoint is reused for regeneration.
No new Python endpoints needed — the Astro server actions handle the
DB writes and cache invalidation directly via Drizzle.

### Admin UI

The admin dashboard (`/admin`) shows:
- Total models, total users, banned users count, models created today
- Quick links to model management and user management

The model list (`/admin` main table) shows:
- Searchable/filterable table of all models
- Each row links to `/admin/m/:provider/:model`

The model admin page (`/admin/m/:provider/:model`) shows:
- Current bento page (embedded preview)
- Model metadata (creator, created date, source type)
- "Delete" button (red, with confirmation)
- "Regenerate" button (with side-by-side preview before confirming)

The user list (`/admin/users`) shows:
- Searchable table of all users
- Columns: avatar, username, GitHub ID, models created, ban status, join date
- Banned users highlighted with a visual indicator
- Each row links to `/admin/users/:id`

The user detail page (`/admin/users/:id`) shows:
- User profile (avatar, username, GitHub link)
- List of bento pages they've created (links to each)
- Ban status: if banned, shows date + reason
- "Ban User" button (with reason input) or "Unban User" button

---

## Project Structure

```
model-bento/
├── astro-frontend/
│   ├── astro.config.mjs
│   ├── package.json
│   ├── src/
│   │   ├── layouts/
│   │   │   └── BaseLayout.astro         # HTML shell, meta tags, nav
│   │   ├── pages/
│   │   │   ├── index.astro              # Landing page
│   │   │   ├── explore.astro            # Browse all models
│   │   │   ├── m/[provider]/[model].astro  # Bento page (SSR)
│   │   │   ├── generate.astro           # Upload form (auth-gated)
│   │   │   ├── dashboard.astro          # User's created bentos
│   │   │   ├── admin/
│   │   │   │   ├── index.astro          # Admin dashboard
│   │   │   │   ├── users/
│   │   │   │   │   ├── index.astro      # User list with ban status
│   │   │   │   │   └── [id].astro       # User detail + ban/unban
│   │   │   │   └── m/[provider]/[model]/
│   │   │   │       ├── index.astro      # Manage model page
│   │   │   │       ├── delete.astro     # Delete confirmation
│   │   │   │       └── regenerate.astro # Regenerate preview + confirm
│   │   │   └── auth/
│   │   │       ├── login.astro
│   │   │       └── callback.astro
│   │   ├── components/
│   │   │   ├── bento/
│   │   │   │   ├── BentoGrid.tsx        # Main grid layout (React)
│   │   │   │   ├── HeroCard.tsx
│   │   │   │   ├── StatCard.tsx
│   │   │   │   ├── BenchmarkCard.tsx
│   │   │   │   ├── ChartCard.tsx
│   │   │   │   ├── CapabilitiesCard.tsx
│   │   │   │   ├── LimitationsCard.tsx
│   │   │   │   └── TrainingCard.tsx
│   │   │   ├── upload/
│   │   │   │   ├── UploadForm.tsx       # PDF upload + text paste
│   │   │   │   └── PreviewPane.tsx      # Live preview before publish
│   │   │   ├── explore/
│   │   │   │   ├── ModelGrid.tsx        # Browse grid
│   │   │   │   └── SearchBar.tsx
│   │   │   ├── admin/
│   │   │   │   ├── AdminModelTable.tsx  # Searchable model list
│   │   │   │   ├── AdminUserTable.tsx   # Searchable user list with ban status
│   │   │   │   ├── BanUserForm.tsx      # Ban reason input + confirm
│   │   │   │   ├── DeleteConfirm.tsx    # Delete confirmation modal
│   │   │   │   └── RegeneratePreview.tsx # Side-by-side old vs new
│   │   │   └── shared/
│   │   │       ├── Nav.astro
│   │   │       ├── Footer.astro
│   │   │       └── OGMeta.astro
│   │   ├── middleware/
│   │   │   └── admin.ts                 # Admin gate: check ADMIN_GITHUB_IDS, return 404 if not admin
│   │   ├── lib/
│   │   │   ├── db.ts                    # Drizzle ORM setup
│   │   │   ├── schema.ts               # Drizzle schema definitions
│   │   │   ├── auth.ts                  # Auth.js config
│   │   │   ├── admin.ts                 # isAdmin() helper, reads ADMIN_GITHUB_IDS env var
│   │   │   ├── api-client.ts            # Python API client
│   │   │   └── layout-engine.ts         # Bento layout algorithm
│   │   └── styles/
│   │       └── global.css               # Tailwind base + bento tokens
│   └── public/
│       └── provider-logos/              # Anthropic, OpenAI, Meta, etc.
│
├── python-api/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py                      # FastAPI app
│   │   ├── routers/
│   │   │   ├── extract.py               # PDF → structured data
│   │   │   ├── check.py                 # Model existence check
│   │   │   └── og.py                    # OG image generation
│   │   ├── services/
│   │   │   ├── pdf_parser.py            # pdfplumber + PyMuPDF
│   │   │   ├── llm_extractor.py         # Claude API structured extraction
│   │   │   └── og_generator.py          # Social image generation
│   │   ├── models/
│   │   │   └── schemas.py               # Pydantic models
│   │   └── config.py                    # Settings + env vars
│   └── tests/
│       ├── test_extract.py
│       └── test_parser.py
│
├── database/
│   └── migrations/                      # SQL migration files
│       ├── 001_initial.sql
│       └── ...
│
├── railway.toml                         # Railway multi-service config
├── PLAN.md                              # This file
└── README.md
```

---

## Implementation Order

### Phase 1: Foundation
1. Initialize Astro project with Node adapter, Tailwind, React integration
2. Initialize FastAPI project with pdfplumber, Anthropic SDK
3. Set up Railway with Postgres + Redis
4. Database migrations (initial schema)
5. Auth.js with GitHub OAuth

### Phase 2: Core Pipeline
6. PDF upload endpoint (FastAPI)
7. Claude extraction prompt + Pydantic validation
8. Model existence check endpoint
9. Generation flow in Astro (upload → extract → check → preview)

### Phase 3: Bento Rendering
10. Bento card components (React islands)
11. Layout engine (data → grid assignment)
12. CSS Grid layout with responsive breakpoints
13. Apple-style theming (colors, typography, spacing)
14. Motion One animations (staggered card reveals)

### Phase 4: Publishing & Viewing
15. Publish flow (preview → confirm → write to DB)
16. SSR bento page route (`/m/:provider/:model`)
17. Redis caching for published pages
18. Explore page with search/browse

### Phase 5: SEO & Sharing
19. OG meta tags per page
20. OG image auto-generation
21. JSON-LD structured data
22. Sitemap generation

### Phase 6: Admin
23. Admin middleware (ADMIN_GITHUB_IDS env var check, 404 for non-admins)
24. Admin dashboard page (stats + quick links)
25. Model management: list, delete flow, regenerate flow
26. User management: list, user detail page
27. Ban/unban flow (set banned_at + reason, clear on unban)
28. Ban check on `/generate` route (show suspended page if banned)

### Phase 7: Polish
29. Landing page
30. Dashboard (your created bentos)
31. Rate limiting on generation
32. Error handling + loading states
33. Dark/light mode toggle
34. Mobile responsive pass

---

## Environment Variables

### astro-frontend
```
DATABASE_URL=          # Railway Postgres connection string
REDIS_URL=             # Railway Redis connection string
GITHUB_CLIENT_ID=      # GitHub OAuth app
GITHUB_CLIENT_SECRET=  # GitHub OAuth app
AUTH_SECRET=            # Auth.js session secret
PYTHON_API_URL=        # http://python-api.railway.internal:8000
API_SHARED_SECRET=     # Internal service auth
PUBLIC_SITE_URL=       # https://modelbento.com
ADMIN_GITHUB_IDS=      # Comma-separated GitHub user IDs for admin access
```

### python-api
```
ANTHROPIC_API_KEY=     # Claude API key
API_SHARED_SECRET=     # Must match astro-frontend
DATABASE_URL=          # Same Postgres (for model checks)
```
