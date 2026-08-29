import type { APIRoute } from 'astro';
import { getSingleRestaurant, getMenuItemsByRestaurant, createMenuItem, getMenuItemById } from '../../db/queries';

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

    const menuItems = await getMenuItemsByRestaurant(restaurant.id);
    return new Response(JSON.stringify(menuItems), {
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

export const POST: APIRoute = async ({ request, cookies }) => {
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
    const { name, price, category_id, image, description } = body;

    if (!name || !price || !category_id) {
      return new Response(JSON.stringify({ error: 'Name, price and category are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const menuItem = await createMenuItem(restaurant.id, category_id, name, Number(price), image, 0, description);
    return new Response(JSON.stringify(menuItem), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
