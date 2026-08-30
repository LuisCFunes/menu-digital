import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import net from 'node:net';
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

async function assertPortFree(port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const probe = net.createServer().listen(port, host);
    probe.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          `Port ${port} on ${host} is already in use (${err.code ?? err.message}). ` +
            'A stale test server may still be running. Kill it before re-running the integration suite.'
        )
      );
    });
    probe.once('listening', () => probe.close(() => resolve()));
  });
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

  await assertPortFree(PORT, '127.0.0.1');

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
    // Pipe stderr so we can surface boot failures; stdin/stdout are unused.
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Capture the server's stderr and surface boot failures (EADDRINUSE,
  // missing build, crash on startup) instead of an unexplained timeout.
  let serverError = '';
  let booted = false;
  server.stderr?.setEncoding('utf8');
  server.stderr?.on('data', (chunk: string) => {
    serverError += chunk;
  });
  server.once('error', (err) => {
    serverError += `\n[spawn error] ${err.message}`;
  });
  const bootPromise = new Promise<never>((_, reject) => {
    server.once('exit', (code) => {
      if (!booted) {
        reject(
          new Error(
            `Test server exited during startup (code ${code}). stderr:\n${serverError || '(no stderr captured)'}`
          )
        );
      }
    });
  });
  await Promise.race([waitForServer(), bootPromise]);
  booted = true;

  const res = await login(PASSWORD);
  expect(res.status).toBe(200);
  authedCookie = cookieHeaderFrom(res);
}, 180000);

afterAll(() => {
  server?.kill();
  // The DB connection was already closed in beforeAll, after seeding.
});

describe('app boots', () => {
  it('serves the public menu', async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
  });
});

describe('security headers', () => {
  it('applies security headers on pages', async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});
