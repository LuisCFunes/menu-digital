# Task 1: Database Setup + Schema + Password Helpers

## Task Description

**Files:**
- Create: src/db/schema.ts
- Create: src/lib/password.ts
- Modify: package.json

**Steps:**

- [ ] **Step 1: Install dependencies**
`ash
npm install better-sqlite3 @node-rs/argon2
npm install -D @types/better-sqlite3 tsx
`

- [ ] **Step 2: Create src/db/schema.ts** — DB init with all 4 tables, WAL mode, foreign keys

- [ ] **Step 3: Create src/lib/password.ts** — hashPassword + verifyPassword using argon2

- [ ] **Step 4: Verify** — run dev server, confirm database.sqlite is created with tables

- [ ] **Step 5: Commit**

## Database Schema

`sql
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  logo TEXT,
  primary_color TEXT DEFAULT '#dc2626',
  secondary_color TEXT DEFAULT '#030712',
  owner_email TEXT UNIQUE NOT NULL,
  owner_password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(restaurant_id, name)
);

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
`

## Global Constraints

- Node >= 22.12.0
- Astro SSR mode with @astrojs/node adapter (standalone)
- SQLite database stored at src/data/database.sqlite
- All prices in Honduran Lempiras (L)
- Dark theme with configurable colors per restaurant
- Tests run sequentially (pool: forks, maxForks: 1)
