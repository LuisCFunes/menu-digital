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

    return new Response(JSON.stringify(restaurant), {
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
    if (name !== undefined) updates.name = name;
    if (logo !== undefined) updates.logo = logo;
    if (logo_size !== undefined) updates.logo_size = parseInt(logo_size, 10);
    if (cover_image !== undefined) updates.cover_image = cover_image;
    if (primary_color !== undefined) updates.primary_color = primary_color;
    if (secondary_color !== undefined) updates.secondary_color = secondary_color;
    if (text_color !== undefined) updates.text_color = text_color;

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
