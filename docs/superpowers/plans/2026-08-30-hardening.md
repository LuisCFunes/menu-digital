# MenuDigital Hardening & Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the security, correctness, and maintainability issues found in the code review of MenuDigital, without changing the public-facing behavior.

**Architecture:** A single Astro server-rendered app backed by libsql (Sqlite/Turso), with JSON API routes under `/api/*`, an SSG public menu at `/`, and a password-gated single-file dashboard. This plan hardens auth sessions, adds rate limiting and security headers, fixes two real bugs (missing `await`, infinite redirect), fixes the corrupt `.gitignore` + committed DB files, stops leaking the password hash, validates inputs, hardens `seed.ts`, reworks category reordering, and finally splits the giant `dashboard.astro` inline script into a module.

**Tech Stack:** Astro 7 (output: `server`, node `standalone` adapter), TypeScript, @libsql/client, @node-rs/argon2, cloudinary, Tailwind 4, Vitest 4. Node >= 22.12.0.

**Spec:** No external spec file exists. The requirements are the findings from the code review performed on 2026-08-30 (see conversation history). Key findings this plan implements:
- Missing `await` in `src/pages/api/menu/[id].ts:23` (PUT to nonexistent item returns `200 null`).
- Infinite redirect in `src/pages/index.astro:10-12` (and `dashboard.astro:9-11`) when no restaurant exists.
- Session cookie sent with `secure: false`; legacy plaintext password compare is not constant-time.
- No rate limiting on the password endpoint (brute force).
- `GET /api/settings` leaks the `dashboard_password` hash.
- Colors/name/logo_size unvalidated → CSS injection via `Layout.astro` `set:html`.
- No security headers (no CSP / X-Frame-Options / nosniff).
- `.gitignore` saved with mixed ASCII/UTF-16LE encoding → the `*.sqlite*` rule is ignored; `src/data/database*.sqlite*` files are committed to git.
- `seed.ts` hardcodes a weak password, writes to a remote Turso DB unguarded, passes colors in the wrong argument positions, and references a filename with spaces.
- New categories all get `sort_order = 0`; the reorder logic in `categories.ts` is a fragile swap hack with repeated dynamic `import()`.
- `dashboard.astro` is a ~972-line file with ~580 lines of inline JS; dead code (`data-item` attr, unused imports/vars, `menu.json`) and duplicated handlers.

## Global Constraints

- Node >= 22.12.0; do not add new runtime dependencies (only use what is already in `package.json`).
- TDD: for any behavior change, write a failing test first, run it to see it fail, then implement, then run it green.
- Unit tests: `npm test` (vitest, include pattern `src/**/*.test.ts`).
- Integration tests (new): `npm run test:integration` (vitest with `vitest.integration.config.ts`). Never run the integration suite as part of `npm test` (it boots a server).
- Commits in English, natural style matching the repo (e.g. `Fix missing await in menu item PUT handler`).
- Do not commit secrets. `.env` stays untracked.
- `astro.config.mjs` keeps `security.checkOrigin: false` (it was disabled because Render multipart uploads broke; CSRF mitigation for the JSON API comes from `SameSite=Strict` cookies in this plan, not from re-enabling checkOrigin).
- The public menu output must not change visually.

---

### Task 0 (manual, no code): Rotate leaked credentials

Because the real Turso token and Cloudinary secret were shared in plain text, rotate them regardless of this codebase's git history (`.env` was never committed — verified). Do this once, then update values in `.env`:

- [ ] Revoke and re-issue the Turso auth token (`turso db tokens rotate menu1-db-luiscfunes --all` or in the Turso dashboard).
- [ ] Rotate the Cloudinary account API key/secret (Cloudinary dashboard > Security > API Keys, regenerate).
- [ ] Update `.env` locally with the new values.
- [ ] Update the environment variables on Render.

No commit is needed for this task.

---

### Task 1: Fix `.gitignore` encoding and untrack the database files

**Files:**
- Modify: `.gitignore` (rewrite as UTF-8, no BOM)
- Test: none (verified via `git` commands)

**Interfaces:**
- Produces: a `.gitignore` where `src/data/*.sqlite*` is honored, so newly created sqlite files are never staged again.

- [ ] **Step 1:** Replace `.gitignore` contents entirely (its current bytes are mixed ASCII + UTF-16LE, which is why the sqlite rule is ignored). Write exactly:

```gitignore
# build output
dist/

# generated types
.astro/

# dependencies
node_modules/

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# environment variables
.env
.env.production

# macOS-specific files
.DS_Store

# jetbrains settings folder
.idea/

# database files
src/data/*.sqlite
src/data/*.sqlite-shm
src/data/*.sqlite-wal
src/data/menu.json
```

Keep the file as UTF-8 without BOM (the `write` tool does this by default). Do not touch the actual sqlite files on disk — they are still needed by dev/test.

- [ ] **Step 2:** Verify the ignore rule now matches:

```bash
git check-ignore -v src/data/database.sqlite
```

Expected: prints `src/data/database.sqlite` with rule source `.gitignore` line `src/data/*.sqlite`.

- [ ] **Step 3:** Stop tracking the committed sqlite files (keeps working copies on disk):

```bash
git rm --cached src/data/database.sqlite src/data/database.sqlite-shm src/data/database.sqlite-wal src/data/database.test.sqlite
```

- [ ] **Step 4:** Verify untracked:

```bash
git status --short
```

Expected: output shows `D  src/data/database.sqlite` (and siblings) staged for deletion, nothing else.

- [ ] **Step 5:** Commit

```bash
git add .gitignore
git commit -m "Fix gitignore encoding so database files are ignored"
```

---

### Task 2: Add an HTTP integration test harness

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `src/integration/api.test.ts`
- Modify: `vitest.config.ts` (exclude integration dir from default run)
- Modify: `package.json` (add `test:integration` script)

**Interfaces:**
- Consumes: existing `src/db/schema.ts` (`getDatabase`, `closeDatabase`), `src/lib/password.ts` (`hashPassword`), Astro CLI build.
- Produces: a vitest file `src/integration/api.test.ts` that boots the real built app against `src/data/database.test.sqlite` on `http://127.0.0.1:8999`, exposing two helpers `authed(path, init)` (adds the session cookie) and `login(password, ip?)`. The `beforeAll` reseeds the test DB with a known restaurant (id `integration-restaurant`, password `testpass123`), one category and one item. Later tasks add `it()` blocks to this file.

- [ ] **Step 1:** Modify `vitest.config.ts` so the default unit run skips the integration directory. Replace the `test` block:

```ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/integration/**'],
    testTimeout: 10000,
    pool: 'forks',
    fileParallelism: false
  }
});
```

- [ ] **Step 2:** Create `vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 120000,
    hookTimeout: 180000,
    pool: 'forks',
    fileParallelism: false
  }
});
```

- [ ] **Step 3:** Add the script to `package.json`:

```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 4:** Create `src/integration/api.test.ts` with the harness and a first smoke test:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'astro';
import { getDatabase, closeDatabase } from '../db/schema';
import { hashPassword } from '../lib/password';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8999;
const BASE = `http://127.0.0.1:${PORT}`;
const RESTAURANT_ID = 'integration-restaurant';
const PASSWORD = 'testpass123';

let server: ChildProcess;
let authedCookie = '';

function cookieHeaderFrom(res: Response): string {
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

async function waitForServer(timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Server did not start in time');
}

async function login(password: string, ip?: string): Promise<Response> {
  return fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: JSON.stringify({ password }),
  });
}

async function authed(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${pathname}`, { ...init, headers: { ...init.headers, cookie: authedCookie } });
}

beforeAll(async () => {
  await build({ root: ROOT });

  const db = await getDatabase();
  await db.execute('DELETE FROM sessions');
  await db.execute('DELETE FROM menu_items');
  await db.execute('DELETE FROM categories');
  await db.execute('DELETE FROM restaurants');
  const hash = await hashPassword(PASSWORD);
  await db.execute({
    sql: `INSERT INTO restaurants (id, slug, name, logo, logo_size, primary_color, secondary_color, text_color, dashboard_password)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [RESTAURANT_ID, 'integration-test', 'Integration Test', null, 128, '#dc2626', '#030712', '#ffffff', hash],
  });
  await db.execute({
    sql: `INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES (?, ?, ?, ?)`,
    args: ['integration-category', RESTAURANT_ID, 'Platos', 0],
  });
  await db.execute({
    sql: `INSERT INTO menu_items (id, restaurant_id, category_id, name, price, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    args: ['integration-item', RESTAURANT_ID, 'integration-category', 'Costillas BBQ', 285, 0],
  });
  closeDatabase();

  server = spawn(process.execPath, [path.join(ROOT, 'dist', 'server', 'entry.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      VITEST: 'true',
      NODE_ENV: 'production',
      // Force the local test database: never let a machine-level
      // TURSO_DATABASE_URL/DB_PATH leak into the spawned server.
      TURSO_DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
      DB_PATH: '',
    },
    stdio: 'ignore',
  });

  await waitForServer();

  const res = await login(PASSWORD);
  expect(res.status).toBe(200);
  authedCookie = cookieHeaderFrom(res);
}, 180000);

afterAll(() => {
  server?.kill();
  closeDatabase();
});

describe('app boots', () => {
  it('serves the public menu', async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 5:** Run the new integration suite:

```bash
npm run test:integration
```

Expected: PASS (1 test) after an `astro build` (~15-30s first time). If the server fails to boot, capture its stderr by temporarily changing `stdio: 'ignore'` to `['ignore', 'pipe', 'pipe']` and console.log the output; the usual culprits are the port already in use or a stale `dist/`.

- [ ] **Step 6:** Run the unit suite to confirm the exclude works:

```bash
npm test
```

Expected: PASS (13 tests), integration directory not touched.

- [ ] **Step 7:** Commit

```bash
git add vitest.integration.config.ts src/integration/api.test.ts vitest.config.ts package.json
git commit -m "Add HTTP integration test harness for API routes"
```

---

### Task 3: Add security headers middleware

**Files:**
- Create: `src/middleware.ts`
- Test: add an integration `it` to `src/integration/api.test.ts`

**Interfaces:**
- Consumes: `next()` — standard Astro middleware.
- Produces: every response (pages and `/api/*`) gets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Content-Security-Policy` headers.

- [ ] **Step 1:** Write the failing test. Append inside `src/integration/api.test.ts`:

```ts
describe('security headers', () => {
  it('applies security headers on pages', async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
```

- [ ] **Step 2:** Run to confirm it fails:

```bash
npm run test:integration
```

Expected: FAIL — headers are absent.

- [ ] **Step 3:** Create `src/middleware.ts`:

```ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  return response;
});
```

Notes: `style-src 'unsafe-inline'` is required because the app uses inline `style` attributes heavily. `script-src 'unsafe-inline'` is required only by the dev server (the production build externalizes scripts under `/_astro/*`). `img-src https:` covers Cloudinary and the QR service.

- [ ] **Step 4:** Run to verify it passes:

```bash
npm run test:integration
```

Expected: PASS.

- [ ] **Step 5:** Run `npx astro check` to confirm the page renders are still valid.

Expected: 0 errors.

- [ ] **Step 6:** Commit

```bash
git add src/middleware.ts src/integration/api.test.ts
git commit -m "Add security headers middleware"
```

---

### Task 4: Fix missing `await` in menu item PUT handler

**Files:**
- Modify: `src/pages/api/menu/[id].ts:23` (and the unused `deleted` at line 79)
- Test: add integration `it`s to `src/integration/api.test.ts`

**Interfaces:**
- Consumes: `authed(path, init)` from Task 2.
- Produces: `PUT /api/menu/:id` returns `404` for a nonexistent id (previously `200` with a `null` body).

- [ ] **Step 1:** Write the failing test. Append inside `src/integration/api.test.ts`:

```ts
describe('menu item API', () => {
  it('returns 404 when editing a non-existent item', async () => {
    const res = await authed('/api/menu/nonexistent-id', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', price: 1, category_id: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting a non-existent item', async () => {
    const res = await authed('/api/menu/nonexistent-id', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2:** Run to confirm the first `it` fails:

```bash
npm run test:integration
```

Expected: `editing a non-existent item` FAILs with `expected 404, got 200`; the DELETE case passes (that bug does not exist).

- [ ] **Step 3:** Fix the handler in `src/pages/api/menu/[id].ts`. Replace:

```ts
    const existing = getMenuItemById(id);
```

with:

```ts
    const existing = await getMenuItemById(id);
```

- [ ] **Step 4:** Clean up the unused result in the DELETE handler. Replace:

```ts
    const deleted = await deleteMenuItem(id);
```

with:

```ts
    await deleteMenuItem(id);
```

- [ ] **Step 5:** Run to verify both tests pass:

```bash
npm run test:integration
```

Expected: PASS.

- [ ] **Step 6:** Commit

```bash
git add src/pages/api/menu/[id].ts src/integration/api.test.ts
git commit -m "Await item lookup in PUT handler so missing items return 404"
```

---

### Task 5: Stop leaking the password hash and validate settings inputs

**Files:**
- Modify: `src/pages/api/settings.ts` (GET strips hash; PUT validates name / colors / logo_size)
- Test: integration `it`s in `src/integration/api.test.ts`

**Interfaces:**
- Consumes: `authed(path, init)`.
- Produces:
  - `GET /api/settings` body has **no** `dashboard_password` property.
  - `PUT /api/settings` returns `400` when `name` is missing/blank or longer than 200 chars, when a color does not match `#rgb`/`#rrggbb`, or when `logo_size` is not a number in `[50, 250]`.

- [ ] **Step 1:** Write the failing tests. Append:

```ts
describe('settings API', () => {
  it('does not expose the password hash', async () => {
    const res = await authed('/api/settings');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dashboard_password).toBeUndefined();
  });

  it('rejects invalid colors', async () => {
    const res = await authed('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ primary_color: 'red; } body { background: url(evil) }' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects blank names and out-of-range logo sizes', async () => {
    const blank = await authed('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(blank.status).toBe(400);

    const badSize = await authed('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logo_size: '9999' }),
    });
    expect(badSize.status).toBe(400);
  });
});
```

- [ ] **Step 2:** Run to confirm failures:

```bash
npm run test:integration
```

Expected: all three new `it`s FAIL (GET leaks the hash; PUT accepts bad values).

- [ ] **Step 3:** Rewrite `src/pages/api/settings.ts`. Keep the auth guard and the GET/PUT shapes, but:

GET handler — return a safe copy:

```ts
    const { dashboard_password, ...safe } = restaurant;
    return new Response(JSON.stringify(safe), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
```

Add this helper above the PUT handler:

```ts
function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
```

PUT handler — validate before building `updates`:

```ts
    const body = await request.json();
    const { name, logo, logo_size, cover_image, primary_color, secondary_color, text_color } = body;

    const updates: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 200) {
        return new Response(JSON.stringify({ error: 'Invalid name' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updates.name = name.trim();
    }

    if (logo !== undefined) {
      if (typeof logo !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid logo' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updates.logo = logo.trim() || null;
    }

    if (cover_image !== undefined) {
      if (typeof cover_image !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid cover image' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updates.cover_image = cover_image.trim() || null;
    }

    if (logo_size !== undefined) {
      const size = Number(logo_size);
      if (!Number.isFinite(size) || size < 50 || size > 250) {
        return new Response(JSON.stringify({ error: 'Invalid logo size' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updates.logo_size = Math.round(size);
    }

    for (const [key, value] of Object.entries({ primary_color, secondary_color, text_color })) {
      if (value !== undefined) {
        if (!isHexColor(value)) {
          return new Response(JSON.stringify({ error: `Invalid ${key}` }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        updates[key] = value;
      }
    }

    const updated = await updateRestaurant(restaurant.id, updates);
```

The rest of the PUT handler is unchanged (JSON 200 response or the catch block). Note `Object.entries` gives `updates[key]` a `string` type; `updateRestaurant` accepts those keys so this compiles.

- [ ] **Step 4:** Run to verify:

```bash
npm run test:integration
```

Expected: PASS (all settings `it`s plus the previous ones).

- [ ] **Step 5:** Run `npx astro check`.

Expected: 0 errors.

- [ ] **Step 6:** Commit

```bash
git add src/pages/api/settings.ts src/integration/api.test.ts
git commit -m "Stop leaking password hash and validate settings inputs"
```

---

### Task 6: Rate-limit login attempts and harden the session cookie

**Files:**
- Create: `src/lib/rateLimit.ts` and `src/lib/rateLimit.test.ts`
- Modify: `src/pages/api/auth.ts`
- Test: unit `src/lib/rateLimit.test.ts` + integration `it`s in `src/integration/api.test.ts`

**Interfaces:**
- Consumes: `createRateLimiter` from the new lib; `authed`/`login` from Task 2.
- Produces:
  - `src/lib/rateLimit.ts` exports `interface RateLimiterOptions { limit: number; windowMs: number }` and `function createRateLimiter(options): { record(key: string): boolean; reset(key?: string): void }` where `record` returns `true` when the key is blocked (over `limit` attempts inside `windowMs`).
  - `POST /api/auth` returns `429` with a `Retry-After` header after 10 failed logins per IP in 15 minutes, and clears the counter for the IP on success.
  - The `dashboard_auth` cookie is set with `secure: true` in production and `sameSite: 'strict'`, and the legacy plaintext comparison is constant-time.

- [ ] **Step 1:** Write the failing unit test `src/lib/rateLimit.test.ts`:

```ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rateLimit';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createRateLimiter', () => {
  it('allows attempts up to the limit, then blocks', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.record('ip')).toBe(false);
    expect(limiter.record('ip')).toBe(false);
    expect(limiter.record('ip')).toBe(false);
    expect(limiter.record('ip')).toBe(true);
    expect(limiter.record('other')).toBe(false);
  });

  it('resets a key after the window expires', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    limiter.record('ip');
    limiter.record('ip');
    limiter.record('ip');
    vi.advanceTimersByTime(1001);
    expect(limiter.record('ip')).toBe(false);
  });

  it('resets a specific key or everything', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.record('a');
    limiter.record('b');
    limiter.reset('a');
    expect(limiter.record('a')).toBe(false);
    limiter.reset();
    expect(limiter.record('b')).toBe(false);
  });
});
```

- [ ] **Step 2:** Run to confirm the module is missing:

```bash
npm test
```

Expected: FAIL — cannot resolve `./rateLimit`.

- [ ] **Step 3:** Create `src/lib/rateLimit.ts`:

```ts
export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
}

export function createRateLimiter({ limit, windowMs }: RateLimiterOptions) {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  function record(key: string): boolean {
    const now = Date.now();
    const entry = attempts.get(key);
    if (!entry || now >= entry.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  }

  function reset(key?: string): void {
    if (key) {
      attempts.delete(key);
    } else {
      attempts.clear();
    }
  }

  return { record, reset };
}
```

- [ ] **Step 4:** Run to verify green:

```bash
npm test
```

Expected: PASS (16 tests).

- [ ] **Step 5:** Write the failing integration tests. Append:

```ts
describe('authentication hardening', () => {
  it('rejects an invalid password with 401', async () => {
    const res = await login('wrong-password');
    expect(res.status).toBe(401);
  });

  it('sets a hardened session cookie on login', async () => {
    const res = await login(PASSWORD, '203.0.113.5');
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie()[0] ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=86400');
  });

  it('returns 429 after repeated failed logins', async () => {
    const ip = '198.51.100.10';
    for (let i = 0; i < 10; i++) {
      const res = await login('wrong-password', ip);
      expect(res.status).toBe(401);
    }
    const blocked = await login('wrong-password', ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });
});
```

- [ ] **Step 6:** Run to confirm the cookie/429 `it`s fail today:

```bash
npm run test:integration
```

Expected: cookie test FAILs (no `SameSite=Strict`, no `Secure`); 429 test FAILs (always 401); 401 test passes.

- [ ] **Step 7:** Rewrite `src/pages/api/auth.ts`:

```ts
import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'crypto';
import { getSingleRestaurant, createSession, deleteSession, updateRestaurantPassword } from '../../db/queries';
import { verifyPassword, hashPassword } from '../../lib/password';
import { createRateLimiter } from '../../lib/rateLimit';

const loginLimiter = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('cf-connecting-ip')
    || 'unknown';
}

function safeTextEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const ip = clientIp(request);

  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return new Response(JSON.stringify({ error: 'Password is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const restaurant = await getSingleRestaurant();
    if (!restaurant) {
      return new Response(JSON.stringify({ error: 'Restaurant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Seamless migration to hashed passwords
    let isValid = false;
    if (!restaurant.dashboard_password.startsWith('$argon2')) {
      // Plaintext check (legacy), constant-time
      isValid = safeTextEqual(password, restaurant.dashboard_password);
      if (isValid) {
        // Upgrade to hashed password immediately
        const newHash = await hashPassword(password);
        await updateRestaurantPassword(restaurant.id, newHash);
      }
    } else {
      // Argon2 check
      isValid = await verifyPassword(password, restaurant.dashboard_password);
    }

    if (!isValid) {
      if (loginLimiter.record(ip)) {
        return new Response(JSON.stringify({ error: 'Too many attempts, try again later' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '900' },
        });
      }
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    loginLimiter.reset(ip);

    // Create session (24 hours)
    const sessionId = await createSession(restaurant.id, 24);

    cookies.set('dashboard_auth', sessionId, {
      path: '/',
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ cookies }) => {
  const sessionId = cookies.get('dashboard_auth')?.value;
  if (sessionId) {
    await deleteSession(sessionId);
  }
  cookies.delete('dashboard_auth', { path: '/' });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

Note: the newest-login cookie is processed first by `cookies.get`, so the hardened-cookie `it` uses `getSetCookie()[0]`. In this integration run the server is a production build, so `import.meta.env.PROD === true` and `Secure` is present. `Max-Age=86400` matches the 24h session.

- [ ] **Step 8:** Run to verify:

```bash
npm run test:integration
npm test
```

Expected: both PASS (integration + 16 unit tests).

- [ ] **Step 9:** Run `npx astro check`.

Expected: 0 errors.

- [ ] **Step 10:** Commit

```bash
git add src/lib/rateLimit.ts src/lib/rateLimit.test.ts src/pages/api/auth.ts src/integration/api.test.ts
git commit -m "Rate-limit login attempts and harden session cookies"
```

---

### Task 7: Fix category ordering and remove the swap hack

**Files:**
- Modify: `src/db/queries.ts` (add `reorderCategory`; keep `createCategory` signature)
- Modify: `src/pages/api/categories.ts` (POST assigns next `sort_order`; PUT delegates to `reorderCategory`)
- Test: unit `src/db/queries.test.ts`

**Interfaces:**
- Consumes: existing `getCategoriesByRestaurant`, `createCategory`.
- Produces:
  - `async function reorderCategory(restaurantId: string, categoryId: string, direction: 'up' | 'down'): Promise<'moved' | 'not-found' | 'no-op'>`
  - `POST /api/categories` gives new categories sequential `sort_order` (max existing + 1).
  - `PUT /api/categories` returns `400` for a bad/missing `direction`, `404` for an unknown category id, `200 {success:true}` otherwise (including the no-op at the edges, matching the previous UI contract).

- [ ] **Step 1:** Write the failing unit tests. Open `src/db/queries.test.ts`, add `reorderCategory` to the imports, and append a new `describe` block:

```ts
describe('Category reordering', () => {
  it('returns not-found for an unknown category', async () => {
    const restaurant = await createRestaurant('reorder-test', 'Reorder', 'pass');
    expect(await reorderCategory(restaurant.id, 'nope', 'up')).toBe('not-found');
  });

  it('returns no-op at the edges', async () => {
    const restaurant = await createRestaurant('reorder-test', 'Reorder', 'pass');
    const a = await createCategory(restaurant.id, 'A', 0);
    const c = await createCategory(restaurant.id, 'C', 2);
    expect(await reorderCategory(restaurant.id, a.id, 'up')).toBe('no-op');
    expect(await reorderCategory(restaurant.id, c.id, 'down')).toBe('no-op');
  });

  it('moves a category up', async () => {
    const restaurant = await createRestaurant('reorder-test', 'Reorder', 'pass');
    const a = await createCategory(restaurant.id, 'A', 0);
    const b = await createCategory(restaurant.id, 'B', 1);
    const c = await createCategory(restaurant.id, 'C', 2);
    expect(await reorderCategory(restaurant.id, b.id, 'up')).toBe('moved');
    expect((await getCategoriesByRestaurant(restaurant.id)).map((x) => x.name)).toEqual(['B', 'A', 'C']);
    void c;
  });

  it('moves a category down', async () => {
    const restaurant = await createRestaurant('reorder-test', 'Reorder', 'pass');
    const a = await createCategory(restaurant.id, 'A', 0);
    const b = await createCategory(restaurant.id, 'B', 1);
    const c = await createCategory(restaurant.id, 'C', 2);
    expect(await reorderCategory(restaurant.id, a.id, 'down')).toBe('moved');
    expect((await getCategoriesByRestaurant(restaurant.id)).map((x) => x.name)).toEqual(['B', 'C', 'A']);
    void a;
    void c;
  });
});
```

- [ ] **Step 2:** Run to confirm failure:

```bash
npm test -t "Category reordering"
```

Expected: FAIL — `reorderCategory` is not defined.

- [ ] **Step 3:** Add `reorderCategory` to `src/db/queries.ts` (after `deleteCategory`):

```ts
export async function reorderCategory(
  restaurantId: string,
  categoryId: string,
  direction: 'up' | 'down'
): Promise<'moved' | 'not-found' | 'no-op'> {
  const categories = await getCategoriesByRestaurant(restaurantId);
  const index = categories.findIndex((c) => c.id === categoryId);
  if (index === -1) return 'not-found';

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= categories.length) return 'no-op';

  // Assign fresh sequential positions, then swap the moving pair.
  // Deterministic even if existing records share a sort_order.
  const positions = categories.map((_, i) => i);
  [positions[index], positions[target]] = [positions[target], positions[index]];

  const db = await getDatabase();
  for (let i = 0; i < categories.length; i++) {
    await db.execute({
      sql: 'UPDATE categories SET sort_order = ? WHERE id = ?',
      args: [positions[i], categories[i].id],
    });
  }
  return 'moved';
}
```

- [ ] **Step 4:** Run to verify green:

```bash
npm test -t "Category reordering"
```

Expected: PASS.

- [ ] **Step 5:** Update `src/pages/api/categories.ts` so new categories get sequential order and PUT uses `reorderCategory`.

POST handler — replace the create call:

```ts
    const categories = await getCategoriesByRestaurant(restaurant.id);
    const nextOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0;
    const category = await createCategory(restaurant.id, name, nextOrder);
```

PUT handler — replace the body (the whole swap logic, including dynamic `import()` calls, from `const body = await request.json();` through the final return) with:

```ts
    const body = await request.json();
    const { id, direction } = body;

    if (!id || (direction !== 'up' && direction !== 'down')) {
      return new Response(JSON.stringify({ error: 'ID and direction are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await reorderCategory(restaurant.id, id, direction);
    if (result === 'not-found') {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
```

Update the import line: `import { getSingleRestaurant, getCategoriesByRestaurant, createCategory, deleteCategory, reorderCategory } from '../../db/queries';`

- [ ] **Step 6:** Run the full unit suite and `astro check`:

```bash
npm test
npx astro check
```

Expected: both PASS (17 unit tests), 0 errors.

- [ ] **Step 7:** Commit

```bash
git add src/db/queries.ts src/db/queries.test.ts src/pages/api/categories.ts
git commit -m "Rework category reordering into a deterministic query"
```

---

### Task 8: Fix infinite redirect when no restaurant is configured

**Files:**
- Modify: `src/pages/index.astro:7-12`
- Modify: `src/pages/dashboard.astro:6-11`
- Test: none automated (requires an empty DB, which the integration harness cannot easily provide); verified via `astro check` + a manual dev-server boot with an empty local DB.

**Interfaces:**
- Produces: when the `restaurants` table is empty, `/` and `/dashboard` respond `503` with a plain-text explanation instead of redirecting to themselves in a loop.

- [ ] **Step 1:** In `src/pages/index.astro`, replace:

```ts
if (!restaurant) {
  return Astro.redirect('/');
}
```

with:

```ts
if (!restaurant) {
  return new Response('Restaurant not configured. Run: npm run seed', {
    status: 503,
    headers: { 'Content-Type': 'text/plain' },
  });
}
```

- [ ] **Step 2:** In `src/pages/dashboard.astro`, apply the same replacement (lines 9-11 show the identical redirect).

- [ ] **Step 3:** Run `npx astro check`.

Expected: 0 errors.

- [ ] **Step 4:** Boot the app pointed at an empty DB and confirm `/` returns 503:

```bash
$env:DB_PATH="file:src/data/empty.db"; astro dev --background
```

(If `empty.db` does not exist, stop after the check and remove it: `Remove-Item src/data/empty.db -ErrorAction SilentlyContinue`.) Then `astro dev status` and read `astro dev logs` to confirm no redirect loop. A simpler proxy check: verify the frontmatter compiles and a fresh seed — `npm run seed` with `ADMIN_PASSWORD` set (see Task 9) — then `/` serves the menu.

- [ ] **Step 5:** Commit

```bash
git add src/pages/index.astro src/pages/dashboard.astro
git commit -m "Return 503 instead of redirecting to itself when unconfigured"
```

---

### Task 9: Harden the seed script and fix the logo filename

**Files:**
- Modify: `src/db/seed.ts`
- Modify: `public/logo costilla grill.png` → renamed to `public/logo-costilla-grill.png`
- Modify: `README.md` (document `ADMIN_PASSWORD`)
- Test: none automated (seed is a manual CLI); verified by running it against the local DB.

**Interfaces:**
- Consumes: `hashPassword`, `createRestaurant`.
- Produces:
  - `npm run seed` requires an `ADMIN_PASSWORD` env var of at least 8 chars else it exits `1` with a message.
  - `npm run seed` refuses to run against a remote `libsql://` URL unless invoked with `--force`.
  - The restaurant is created with `logo = '/logo-costilla-grill.png'`, `primary_color = '#dc2626'`, `secondary_color = '#030712'` (argument order fixed — previously the colors landed in the `cover_image`/`primary_color` slots).

- [ ] **Step 1:** Rename the logo file:

```bash
git mv "public/logo costilla grill.png" public/logo-costilla-grill.png
```

- [ ] **Step 2:** Rewrite `src/db/seed.ts`:

```ts
import fs from 'fs';
import path from 'path';

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}
import { closeDatabase } from './schema';
import { createRestaurant, createCategory, createMenuItem } from './queries';
import { hashPassword } from '../lib/password';

async function seed() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error('Set ADMIN_PASSWORD (at least 8 characters) in .env before seeding.');
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL || '';
  if (url.startsWith('libsql://') && !process.argv.includes('--force')) {
    console.error('Refusing to seed a remote Turso database. Pass --force to override.');
    process.exit(1);
  }

  const dbPath = path.join(process.cwd(), 'src', 'data', 'database.sqlite');
  console.log(`Seeding database at ${url || `file:${dbPath}`}...`);

  const hashedPassword = await hashPassword(password);
  const restaurant = await createRestaurant(
    'costillal',
    'El Costillal Grill',
    hashedPassword,
    '/logo-costilla-grill.png',
    undefined,
    '#dc2626',
    '#030712'
  );
  console.log('Created restaurant:', restaurant.name);

  // Create categories
  const mainCategory = await createCategory(restaurant.id, 'Platos Principales', 1);
  const dessertCategory = await createCategory(restaurant.id, 'Postres', 2);
  const drinkCategory = await createCategory(restaurant.id, 'Bebidas', 3);
  console.log('Created categories');

  // Create menu items
  await createMenuItem(restaurant.id, mainCategory.id, 'Costillas BBQ', 285, '/images/costillas.jpg', 1);
  await createMenuItem(restaurant.id, mainCategory.id, 'Chuleta de Cerdo', 195, '/images/chuleta.jpg', 2);
  await createMenuItem(restaurant.id, mainCategory.id, 'Pollo Asado', 165, '/images/pollo.jpg', 3);
  await createMenuItem(restaurant.id, mainCategory.id, 'Carne Asada', 245, '/images/carne.jpg', 4);
  await createMenuItem(restaurant.id, mainCategory.id, 'Retazo de Cerdo', 155, '/images/retazo.jpg', 5);
  await createMenuItem(restaurant.id, mainCategory.id, 'Lonja de Cerdo', 175, '/images/lonja.jpg', 6);
  await createMenuItem(restaurant.id, mainCategory.id, 'Tres Derechos', 265, '/images/tres.jpg', 7);
  await createMenuItem(restaurant.id, mainCategory.id, 'Mixto Grill', 325, '/images/mixto.jpg', 8);

  await createMenuItem(restaurant.id, dessertCategory.id, 'Tres Leches', 65, '/images/tresleches.jpg', 1);
  await createMenuItem(restaurant.id, dessertCategory.id, 'Banana Split', 75, '/images/banana.jpg', 2);

  await createMenuItem(restaurant.id, drinkCategory.id, 'Coca Cola', 35, '/images/coca.jpg', 1);
  await createMenuItem(restaurant.id, drinkCategory.id, 'Agua Natural', 20, '/images/agua.jpg', 2);
  await createMenuItem(restaurant.id, drinkCategory.id, 'Horchata', 30, '/images/horchata.jpg', 3);

  console.log('Created menu items');
  console.log('Seed completed!');

  closeDatabase();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
```

(`seed().catch(...)` replaces the previous unhandled `seed();` so a rejected promise exits nonzero.)

- [ ] **Step 3:** Verify the guards behave. From the project root, set no password and confirm it refuses:

```bash
$env:ADMIN_PASSWORD=""; npm run seed
```

Expected: exits with `Set ADMIN_PASSWORD ...`. Then, to allow a local test seed, run:

```bash
$env:ADMIN_PASSWORD="demo-password-123"; npm run seed
```

Expected: prints "Seed completed!" (still uses the local `database.sqlite` because `TURSO_DATABASE_URL` is read from `process.env`, and `.env` — which does not get loaded automatically by the standalone dev/build runtime — only matters when it is present and exported; the local dev server loads `.env`, so if your `.env` has a Turso URL the seed will honor the remote-refusal guard and exit unless `--force`).

- [ ] **Step 4:** Update `README.md`:

- In the "Environment Variables" block, add a line and comment:

```env
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
ADMIN_PASSWORD=<at-least-8-chars-admin-password>
```

- Update step 4 ("Seed the database") to mention: "Set `ADMIN_PASSWORD` in `.env` first. The seed refuses to run against a remote Turso database unless you pass `--force`."

- [ ] **Step 5:** Commit

```bash
git add src/db/seed.ts README.md
git commit -m "Require ADMIN_PASSWORD and guard seed against remote databases"
```

(The logo rename was staged by `git mv` in Step 1; include it: `git add -A public` if needed before committing.)

---

### Task 10: Remove dead code

**Files:**
- Modify: `src/pages/index.astro` (unused `db`)
- Modify: `src/pages/dashboard.astro` (unused `db`, unused `passwordGate`, dead `data-item` attribute)
- Modify: `src/pages/api/menu.ts` (unused import)
- Modify: `src/db/queries.test.ts` (unused import)
- Modify: `src/lib/auth.ts` (type `any` → `AstroCookies`)
- Delete: `src/data/menu.json`
- Test: `npm test` + `npx astro check`

**Interfaces:**
- Consumes: nothing new.
- Produces: zero unused-import/unused-var hints from `astro check`; `isDashboardAuthenticated(cookies: AstroCookies)`.

- [ ] **Step 1:** Delete the dead data file:

```bash
git rm src/data/menu.json
```

- [ ] **Step 2:** In `src/pages/index.astro`, remove the `const db = await getDatabase();` line and the `getDatabase` import (line 4: change to `import { getSingleRestaurant, getCategoriesByRestaurant, getMenuItemsByRestaurant } from '../db/queries';`).

- [ ] **Step 3:** In `src/pages/dashboard.astro`:
- Remove `const db = await getDatabase();` (line 6) and the `getDatabase` import (line 3 becomes `import { getSingleRestaurant, getCategoriesByRestaurant, getMenuItemsByRestaurant } from '../db/queries';`).
- Remove `const passwordGate = document.getElementById('passwordGate');` (line 390, still referenced nowhere).
- In the Edit button (line 143), remove the `data-item={JSON.stringify(item)}` attribute, leaving `data-id={item.id}`:

```astro
<button class="edit-item-btn text-gray-400 hover:text-white" data-id={item.id}>
```

- [ ] **Step 4:** In `src/pages/api/menu.ts`, change the import to `import { getSingleRestaurant, getMenuItemsByRestaurant, createMenuItem } from '../../db/queries';` (drop unused `getMenuItemById`).

- [ ] **Step 5:** In `src/db/queries.test.ts`, drop `getMenuItemById` from the import list on line 13.

- [ ] **Step 6:** Rewrite `src/lib/auth.ts`:

```ts
import type { AstroCookies } from 'astro';
import { getSession } from '../db/queries';

export async function isDashboardAuthenticated(cookies: AstroCookies): Promise<boolean> {
  const sessionId = cookies.get('dashboard_auth')?.value;
  if (!sessionId) return false;

  const session = await getSession(sessionId);
  return !!session;
}
```

- [ ] **Step 7:** Verify:

```bash
npm test
npx astro check
npm run test:integration
```

Expected: PASS everywhere; `astro check` reports 0 warnings/hints (down from 8).

- [ ] **Step 8:** Commit

```bash
git add -A
git commit -m "Remove dead code and silence type hints"
```

---

### Task 11: Split the dashboard inline script into a module

**Files:**
- Create: `src/scripts/dashboard.ts`
- Modify: `src/pages/dashboard.astro`
- Test: `npx astro check` + `npm run build` + manual smoke in the dev server (login, add/edit/delete item, add/move/delete category, save settings, logout). No automated test (UI only).

**Interfaces:**
- Consumes: the exact block of JS currently inside the `<script>` tag of `dashboard.astro` (lines 389-971).
- Produces: `src/scripts/dashboard.ts` exporting `initDashboard()` which is invoked on module load; `dashboard.astro` replaces its `<script>` body with `import '../scripts/dashboard.ts';`. Dynamically created rows now reuse the same handler classes as the server-rendered rows.

- [ ] **Step 1:** Create `src/scripts/dashboard.ts` with this structure. Copy the existing script body from `dashboard.astro` lines 390-970 verbatim into the body of `initDashboard`, then add the auto-init call:

```ts
function initDashboard() {
  // <-- paste the original script body here (from `passwordGate` declaration to the
  // final closing brace of the `if (dashboardContent) { ... }` block) verbatim
}

initDashboard();
```

The module preserves all existing null checks and the `if (dashboardContent)` guard exactly as they are today, so it works on both the login view and the dashboard view.

- [ ] **Step 2:** In `src/pages/dashboard.astro`, replace the entire `<script> ... </script>` block (lines 389-971) with:

```astro
  <script>
    import '../scripts/dashboard.ts';
  </script>
```

- [ ] **Step 3:** Unify the dynamic-row handlers in `src/scripts/dashboard.ts` so the same delegated listeners handle server-rendered and freshly-added rows (prevents double-dialogs / double requests):

- In `createItemRow`, change the button classNames to also include the SSR classes:

```ts
      editBtn.className = 'edit-item edit-item-btn text-blue-400 hover:text-blue-300';
      deleteBtn.className = 'delete-item delete-item-btn text-gray-400 hover:text-red-500';
```

- In the "Add category" success block, change the delete button to use the delegated class and drop the inline listener:

```ts
          delBtn.className = 'delete-category delete-category-btn text-gray-400 hover:text-red-500';
          delBtn.setAttribute('data-id', category.id);
          delBtn.textContent = 'Delete';
```

and remove the line `delBtn.addEventListener('click', handleDeleteCategory);`.

- [ ] **Step 4:** Verify the build and types:

```bash
npx astro check
npm run build
```

Expected: 0 errors; build succeeds.

- [ ] **Step 5:** Manual smoke test in the dev server:

```bash
astro dev --background
```

Then in a browser at `http://localhost:4321/dashboard`: log in (password from your DB), add a menu item with and without upload, edit it, delete it, add a category, move it up/down, delete it, save an empty setting change, and log out. Confirm no double confirm-dialogs and no console errors. Stop with `astro dev stop`.

- [ ] **Step 6:** Commit

```bash
git add src/scripts/dashboard.ts src/pages/dashboard.astro
git commit -m "Extract dashboard script into a module"
```

---

### Task 12: Update README security section

**Files:**
- Modify: `README.md`
- Test: none (docs)

**Interfaces:**
- Produces: documentation that matches the hardened behavior.

- [ ] **Step 1:** Replace the "🔒 Security" section with:

```markdown
## 🔒 Security

- **Argon2 Hashing**: The admin dashboard password is stored using Argon2 (legacy plaintext
  passwords are upgraded to Argon2 on first login).
- **Session Management**: HTTP-only, SameSite=Strict cookies backed by 24h sessions in the database;
  cookies carry the `Secure` flag in production builds.
- **Rate Limiting**: Failed dashboard logins are limited to 10 attempts per 15 minutes per IP.
- **Route Protection**: API routes and dashboard pages are guarded by server-side auth checks.
- **Input Validation**: Name, colors, and logo sizes are validated on the server before they reach the
  database (colors must be `#rgb`/`#rrggbb`).
- **Security Headers**: All responses include a Content-Security-Policy, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.
- **Secrets**: Turso and Cloudinary credentials live only in environment variables; `.env` is gitignored
  and database files are no longer tracked. Rotate any credential that has been shared in plain text.
```

- [ ] **Step 2:** Commit

```bash
git add README.md
git commit -m "Update README security section"
```

---

## Final Verification

- [ ] `npm test` — PASS (17 unit tests).
- [ ] `npm run test:integration` — PASS (harness + headers + [id] 404s + settings + auth + rate-limit).
- [ ] `npx astro check` — 0 errors, 0 hints.
- [ ] `npm run build` — succeeds.
- [ ] Manual smoke: public menu loads; dashboard login/logout/CRUD/reorder/settings work; `.env` still untracked; `git status` clean except expected changes.

## Out of scope / deferred

- Multi-tenant support (`getSingleRestaurant` everywhere) is a product decision, not a bug.
- `security.checkOrigin: false` stays (Render multipart uploads); CSRF risk is mitigated by `SameSite=Strict`.
- A real migrations system (currently ad-hoc `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` in `schema.ts`) is deferred.
- File type/size validation on `/api/upload` (Cloudinary-side safety) is deferred; it only affects an authenticated admin.
- Session cleanup job for expired rows (lazily deleted on read today) is deferred.