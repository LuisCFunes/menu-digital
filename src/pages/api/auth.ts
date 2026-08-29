import type { APIRoute } from 'astro';
import { getSingleRestaurant, createSession, deleteSession, updateRestaurantPassword } from '../../db/queries';
import { verifyPassword, hashPassword } from '../../lib/password';

export const POST: APIRoute = async ({ request, cookies }) => {
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
      // Plaintext check (legacy)
      isValid = password === restaurant.dashboard_password;
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
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create session (24 hours)
    const sessionId = await createSession(restaurant.id, 24);

    cookies.set('dashboard_auth', sessionId, {
      path: '/',
      httpOnly: true,
      secure: false, // set true in prod
      sameSite: 'lax',
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
