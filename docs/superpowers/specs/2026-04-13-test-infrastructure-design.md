# Test Infrastructure Design

Docker Compose + Vitest test harness for Model Bento. Sets up local Postgres and Redis for both development and testing, with database-level isolation between the two.

## Docker Compose

Single `docker-compose.yml` running two services:

- **Postgres 16** on port 5432, with a named volume for persistence. Creates two databases on first start: `modelbento_dev` (for development) and `modelbento_test` (for tests) via an init script.
- **Redis 7** on port 6379. Dev uses DB 0, tests use DB 1.

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: modelbento
      POSTGRES_PASSWORD: modelbento
      POSTGRES_DB: modelbento_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

The init script (`scripts/init-test-db.sql`) is a one-liner:

```sql
CREATE DATABASE modelbento_test;
```

Postgres runs scripts in `/docker-entrypoint-initdb.d/` on first container initialization, so both databases exist without manual intervention.

## Environment Variables

### `.env` (gitignored)

Dev defaults. Not committed -- each developer creates their own.

```
DATABASE_URL=postgresql://modelbento:modelbento@localhost:5432/modelbento_dev
REDIS_URL=redis://localhost:6379/0
```

### `.env.test` (committed)

Test overrides. Safe to commit -- local Docker credentials only.

```
DATABASE_URL=postgresql://modelbento:modelbento@localhost:5432/modelbento_test
REDIS_URL=redis://localhost:6379/1
```

### `.env.example` (committed)

Reference for the full set of env vars. Placeholder values for secrets.

```
DATABASE_URL=postgresql://modelbento:modelbento@localhost:5432/modelbento_dev
REDIS_URL=redis://localhost:6379/0
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
AUTH_SECRET=any-random-string
PUBLIC_SITE_URL=http://localhost:4321
ADMIN_GITHUB_IDS=your-github-user-id
```

## Vitest Configuration

Separate `vitest.config.ts` (not embedded in `astro.config.mjs`):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    envFile: '.env.test',
    globalSetup: './tests/global-setup.ts',
    setupFiles: './tests/setup.ts',
  },
});
```

- `envFile`: Vitest loads `.env.test` automatically, overriding any `.env` values.
- `globalSetup`: Runs once before the entire test suite.
- `setupFiles`: Runs before each test file.

## Test Lifecycle

### Global Setup (`tests/global-setup.ts`)

Runs once before all tests:

1. Connects to `modelbento_test` via Drizzle.
2. Runs migrations programmatically via `drizzle-orm/migrator`.
3. Returns a teardown function that closes the DB connection.

### Per-File Setup (`tests/setup.ts`)

Runs before each test file (via Vitest `setupFiles`). Registers a `beforeEach` hook that:

1. Truncates all tables with `TRUNCATE users, models, bento_pages, source_texts CASCADE`.
2. Flushes Redis DB 1 with `FLUSHDB`.

Every test starts with an empty database.

### Test Helpers (`tests/helpers.ts`)

Separate importable module. Test files `import { getTestDb, getTestRedis, seed } from '../helpers'`. Exports:

- `getTestDb()` -- returns a Drizzle client connected to `modelbento_test`. Lazily created, reused across tests in the same worker.
- `getTestRedis()` -- returns an ioredis client on DB 1. Same lazy singleton pattern.
- `seed()` -- inserts common test fixtures (user, model, bento_page, source_text) and returns the inserted records.

Note: `global-setup.ts` runs in a separate process from test workers and cannot share connections. It creates its own Drizzle client for migrations, then closes it. Test workers create their own connections via `helpers.ts`.

### Placeholder Test (`tests/setup.test.ts`)

Phase 1.1 checkpoint -- verifies Vitest runs and exits 0:

```ts
import { describe, it, expect } from 'vitest';

describe('test setup', () => {
  it('vitest runs', () => {
    expect(true).toBe(true);
  });
});
```

## npm Scripts

```json
{
  "dev": "docker compose up -d && astro dev",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "db:up": "docker compose up -d",
  "db:down": "docker compose down",
  "db:migrate": "drizzle-kit migrate",
  "db:generate": "drizzle-kit generate",
  "build": "astro build",
  "preview": "astro preview"
}
```

- `npm run dev` starts Docker services (idempotent) then Astro dev server.
- `npm run test` assumes Docker is already running. Connection errors are obvious enough to self-diagnose.
- `test:watch` and `test:ui` are for interactive development.

## File Inventory

| File | Committed | Purpose |
|------|-----------|---------|
| `docker-compose.yml` | Yes | Postgres 16 + Redis 7 |
| `scripts/init-test-db.sql` | Yes | Creates `modelbento_test` database |
| `.env` | No | Dev environment defaults |
| `.env.example` | Yes | Reference for all env vars |
| `.env.test` | Yes | Test environment overrides |
| `vitest.config.ts` | Yes | Vitest configuration |
| `tests/global-setup.ts` | Yes | Migrate test DB before suite |
| `tests/setup.ts` | Yes | Truncate + flush before each test |
| `tests/helpers.ts` | Yes | Shared test utilities (db, redis, seed) |
| `tests/setup.test.ts` | Yes | Phase 1.1 placeholder test |
| `.gitignore` | Yes | node_modules, .env, dist, .astro |

## Decisions

- **Node 22.14** pinned across dev/test/production.
- **Single Compose file** with database-level isolation (not container-level). Dev and test share Postgres/Redis containers but use separate databases/keyspaces.
- **Global setup + truncate** pattern for test lifecycle. Migrations run once; tables truncate between test files. No per-suite database creation.
- **`.env.test` committed** because it contains only local Docker credentials.
