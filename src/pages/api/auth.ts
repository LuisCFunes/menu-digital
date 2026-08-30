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
      secure: import.meta.env.PROD || process.env.NODE_ENV === 'production',
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
