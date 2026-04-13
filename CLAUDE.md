# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Model Bento is a public registry of Apple-style bento presentations for AI model cards. Users upload a model card PDF or paste text, Claude extracts structured data, and the app generates a shareable bento grid page. Deployed on Railway.

## Architecture

Single-service Astro 5 app (Node adapter) handling everything: SSR pages, auth, PDF parsing, Claude extraction, OG image generation, and admin. No separate backend service.

- **Astro 5 SSR** with React 19 islands for interactive components
- **Drizzle ORM** — single source of truth for DB schema, migrations via `drizzle-kit`
- **PostgreSQL + Redis** — Railway-managed. Postgres for structured data + JSONB. Redis for data-level caching, rate limiting, and sessions.

## Key Design Decisions

- **Immutable pages**: Published bento pages cannot be edited by regular users. Only admins can delete or regenerate.
- **Admin via env var**: Admins identified by `ADMIN_GITHUB_IDS` env var (comma-separated GitHub user IDs), not a DB role column. Admin routes return 404 (not 403) to non-admins.
- **No slug column**: URLs derived from `provider` + `name` columns (UNIQUE constraint). No slug to keep in sync.
- **Separate `source_texts` table**: Raw PDF text stored separately from `bento_pages` to avoid loading large text on every query. Only fetched during admin regeneration.
- **No `benchmarks` table**: Benchmark data lives inside `bento_pages.extracted` JSONB to avoid duplication.
- **Data-level caching**: Redis caches extracted+layout JSONB, not rendered HTML. Astro renders from cached data.
- **Claude extraction retries**: Up to 2 retries with backoff on Zod validation failure before surfacing error to user.
- **Light mode only** (for now).

## Build & Run Commands

```bash
bun install
bun run dev                    # Dev server
bun run build                  # Production build
bun run preview                # Preview production build
bunx drizzle-kit generate       # Generate migrations from schema
bunx drizzle-kit migrate        # Apply migrations
```

## Testing

Vitest for unit/integration tests, Playwright for E2E browser tests. Test fixtures in `tests/fixtures/` (sample PDFs, extracted JSON, layouts). The `llm-extractor` accepts an injectable client parameter so tests mock Claude instead of calling the real API.

```bash
bun run test                   # Run all Vitest tests
bun run test -- tests/services/pdf-parser.test.ts          # Single test file
bun run test -- -t "extracts text from a valid PDF"        # Single test by name
bunx playwright test            # Run all E2E tests
bunx playwright test --ui       # Playwright UI mode
```

The implementation follows red/green TDD — each step in PLAN.md specifies the tests to write first. See the "Implementation Order" section for the full test plan.

## Tech Stack Quick Reference

| Concern | Library |
|---------|---------|
| ORM | Drizzle ORM + drizzle-kit |
| Styling | Tailwind CSS v4 |
| Charts | Recharts (React islands) |
| Animations | Motion One |
| AI extraction | Anthropic TypeScript SDK (Sonnet) |
| PDF parsing | pdf-parse |
| OG images | @vercel/og (Satori) |
| Auth | Auth.js (GitHub OAuth) |

## Bento Layout

Cards use a 12-column CSS Grid. Card types: `hero` (2x2), `stat` (1x1), `benchmark` (2x1/1x2), `chart` (2x2), `capabilities` (2x1), `limitations` (1x2/2x1), `highlight` (1x1), `training` (2x1). Layout algorithm ranks extracted data by impressiveness, assigns top items to larger cards.

Apple aesthetic: `1.5rem` border-radius, `1.5rem` gap, system font stack, large bold numbers (4-6rem), muted palette with provider-brand accent.

## Route Structure

- Public: `/`, `/explore`, `/m/:provider/:model`, `/m/:provider/:model/embed`
- Auth-gated: `/generate`, `/generate/preview`, `/dashboard`
- Admin: `/admin`, `/admin/m/:provider/:model`, `/admin/users`, `/admin/users/:id`

## Database

Four tables: `users`, `models`, `bento_pages`, `source_texts`. Schema defined in `src/lib/schema.ts`. Models are looked up by `provider` + `name` (UNIQUE). Cascade deletes from `models` clean up `bento_pages` and `source_texts`.

## Extraction Services

Server-side modules in `src/lib/services/`:
- `pdf-parser.ts` — pdf-parse wrapper, 20MB file size limit
- `llm-extractor.ts` — Claude API structured extraction with Zod validation + retry
- `og-generator.ts` — @vercel/og async image generation

## Environment Variables

Single set of env vars (see PLAN.md for full list): `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, GitHub OAuth creds (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`), `AUTH_SECRET`, `PUBLIC_SITE_URL`, `ADMIN_GITHUB_IDS`.
