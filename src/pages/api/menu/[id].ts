import type { APIRoute } from 'astro';
import { getMenuItemById, updateMenuItem, deleteMenuItem } from '../../../db/queries';

import { isDashboardAuthenticated } from '../../../lib/auth';

export const PUT: APIRoute = async ({ params, request, cookies }) => {
  if (!(await isDashboardAuthenticated(cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Item ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await getMenuItemById(id);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { name, price, category_id, image, description } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = Number(price);
    if (category_id !== undefined) updates.category_id = category_id;
    if (image !== undefined) updates.image = image;
    if (description !== undefined) updates.description = description;

    const updated = await updateMenuItem(id, updates);
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

export const DELETE: APIRoute = async ({ params, cookies }) => {
  if (!(await isDashboardAuthenticated(cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: 'Item ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const existing = await getMenuItemById(id);
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await deleteMenuItem(id);
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
