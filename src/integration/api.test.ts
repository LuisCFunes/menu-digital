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
