import type { APIRoute } from 'astro';
import { getSingleRestaurant, getCategoriesByRestaurant, createCategory, deleteCategory } from '../../db/queries';

import { isDashboardAuthenticated } from '../../lib/auth';

export const GET: APIRoute = async ({ cookies }) => {
  if (!(await isDashboardAuthenticated(cookies))) {
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

    const categories = await getCategoriesByRestaurant(restaurant.id);
    return new Response(JSON.stringify(categories), {
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
  if (!(await isDashboardAuthenticated(cookies))) {
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
    const { name } = body;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Category name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const category = await createCategory(restaurant.id, name);
    return new Response(JSON.stringify(category), {
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

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!(await isDashboardAuthenticated(cookies))) {
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
    const { id, direction } = body;

    if (!id || !direction) {
      return new Response(JSON.stringify({ error: 'ID and direction are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const categories = await getCategoriesByRestaurant(restaurant.id);
    const index = categories.findIndex(c => c.id === id);
    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (direction === 'up' && index > 0) {
      // Swap sort_order
      const current = categories[index];
      const prev = categories[index - 1];
      
      const currentSort = current.sort_order;
      const prevSort = prev.sort_order;
      
      // If sort orders are the same (e.g. 0), artificially fix them
      if (currentSort === prevSort) {
        // Fix all sort orders first
        for (let i = 0; i < categories.length; i++) {
          categories[i].sort_order = i;
        }
        categories[index].sort_order = index - 1;
        categories[index - 1].sort_order = index;
        
        // Update all
        const { updateCategory } = await import('../../db/queries');
        for (const cat of categories) {
          await updateCategory(cat.id, { sort_order: cat.sort_order });
        }
      } else {
        const { updateCategory } = await import('../../db/queries');
        await updateCategory(current.id, { sort_order: prevSort });
        await updateCategory(prev.id, { sort_order: currentSort });
      }
    } else if (direction === 'down' && index < categories.length - 1) {
      const current = categories[index];
      const next = categories[index + 1];
      
      const currentSort = current.sort_order;
      const nextSort = next.sort_order;
      
      if (currentSort === nextSort) {
        for (let i = 0; i < categories.length; i++) {
          categories[i].sort_order = i;
        }
        categories[index].sort_order = index + 1;
        categories[index + 1].sort_order = index;
        
        const { updateCategory } = await import('../../db/queries');
        for (const cat of categories) {
          await updateCategory(cat.id, { sort_order: cat.sort_order });
        }
      } else {
        const { updateCategory } = await import('../../db/queries');
        await updateCategory(current.id, { sort_order: nextSort });
        await updateCategory(next.id, { sort_order: currentSort });
      }
    }

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

export const DELETE: APIRoute = async ({ url, cookies }) => {
  if (!(await isDashboardAuthenticated(cookies))) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Category ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const deleted = await deleteCategory(id);
    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
