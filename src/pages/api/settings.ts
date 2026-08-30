import type { APIRoute } from 'astro';
import { getSingleRestaurant, updateRestaurant } from '../../db/queries';

import { isDashboardAuthenticated } from '../../lib/auth';

export const GET: APIRoute = async ({ cookies }) => {
  if (!await isDashboardAuthenticated(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const restaurant = await getSingleRestaurant();
    if (!restaurant) {
      return new Response(JSON.stringify({ error: 'Restaurant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { dashboard_password, ...safe } = restaurant;
    return new Response(JSON.stringify(safe), {
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

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await isDashboardAuthenticated(cookies)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const restaurant = await getSingleRestaurant();
    if (!restaurant) {
      return new Response(JSON.stringify({ error: 'Restaurant not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
    return new Response(JSON.stringify(updated), {
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

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
