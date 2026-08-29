import { createClient, type Client } from '@libsql/client';
import { join } from 'path';

let db: Client | null = null;

export async function getDatabase(): Promise<Client> {
  if (db) return db;

  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  const defaultPath = join(process.cwd(), 'src', 'data', 'database.sqlite');
  const dbPath = isTest
    ? join(process.cwd(), 'src', 'data', 'database.test.sqlite')
    : process.env.DB_PATH || defaultPath;

  const url = process.env.TURSO_DATABASE_URL || `file:${dbPath}`;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  db = createClient({ url, authToken });

  await db.execute(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      logo_size INTEGER DEFAULT 128,
      cover_image TEXT,
      primary_color TEXT DEFAULT '#dc2626',
      secondary_color TEXT DEFAULT '#030712',
      text_color TEXT DEFAULT '#ffffff',
      dashboard_password TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      UNIQUE(restaurant_id, name)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  try {
    await db.execute(`ALTER TABLE restaurants ADD COLUMN text_color TEXT DEFAULT '#ffffff'`);
  } catch (error) {}
  
  try {
    await db.execute(`ALTER TABLE restaurants ADD COLUMN cover_image TEXT`);
  } catch (error) {}
  
  try {
    await db.execute(`ALTER TABLE restaurants ADD COLUMN logo_size INTEGER DEFAULT 128`);
  } catch (error) {}

  try {
    await db.execute(`ALTER TABLE menu_items ADD COLUMN description TEXT`);
  } catch (error) {}

  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
