import { getDatabase } from './schema';
import { randomUUID } from 'crypto';

// Restaurant queries
export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  logo_size: number;
  cover_image: string | null;
  primary_color: string;
  secondary_color: string;
  text_color: string;
  dashboard_password: string;
  created_at: string;
}

export async function getRestaurantById(id: string): Promise<Restaurant | null> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM restaurants WHERE id = ?', args: [id] });
  return (result.rows[0] as unknown as Restaurant) || null;
}

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM restaurants WHERE slug = ?', args: [slug] });
  return (result.rows[0] as unknown as Restaurant) || null;
}

export async function getSingleRestaurant(): Promise<Restaurant | null> {
  const db = await getDatabase();
  const result = await db.execute('SELECT * FROM restaurants LIMIT 1');
  return (result.rows[0] as unknown as Restaurant) || null;
}

export async function createRestaurant(
  slug: string,
  name: string,
  dashboardPassword: string,
  logo?: string,
  coverImage?: string,
  primaryColor?: string,
  secondaryColor?: string,
  textColor?: string
): Promise<Restaurant> {
  const db = await getDatabase();
  const id = randomUUID();
  await db.execute({
    sql: `
      INSERT INTO restaurants (id, slug, name, logo, logo_size, cover_image, primary_color, secondary_color, text_color, dashboard_password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [id, slug, name, logo || null, 128, coverImage || null, primaryColor || '#dc2626', secondaryColor || '#030712', textColor || '#ffffff', dashboardPassword]
  });
  return (await getRestaurantById(id))!;
}

export async function updateRestaurant(
  id: string,
  updates: Partial<Pick<Restaurant, 'name' | 'logo' | 'logo_size' | 'cover_image' | 'primary_color' | 'secondary_color' | 'text_color'>>
): Promise<Restaurant | null> {
  const db = await getDatabase();
  const existing = await getRestaurantById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.logo !== undefined) { fields.push('logo = ?'); values.push(updates.logo); }
  if (updates.logo_size !== undefined) { fields.push('logo_size = ?'); values.push(updates.logo_size); }
  if (updates.cover_image !== undefined) { fields.push('cover_image = ?'); values.push(updates.cover_image); }
  if (updates.primary_color !== undefined) { fields.push('primary_color = ?'); values.push(updates.primary_color); }
  if (updates.secondary_color !== undefined) { fields.push('secondary_color = ?'); values.push(updates.secondary_color); }
  if (updates.text_color !== undefined) { fields.push('text_color = ?'); values.push(updates.text_color); }

  if (fields.length === 0) return existing;

  values.push(id);
  await db.execute({ sql: `UPDATE restaurants SET ${fields.join(', ')} WHERE id = ?`, args: values });
  return await getRestaurantById(id);
}

// Category queries
export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  sort_order: number;
}

export async function createCategory(restaurantId: string, name: string, sortOrder?: number): Promise<Category> {
  const db = await getDatabase();
  const id = randomUUID();
  await db.execute({
    sql: `
      INSERT INTO categories (id, restaurant_id, name, sort_order)
      VALUES (?, ?, ?, ?)
    `,
    args: [id, restaurantId, name, sortOrder || 0]
  });
  const result = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  return result.rows[0] as unknown as Category;
}

export async function getCategoriesByRestaurant(restaurantId: string): Promise<Category[]> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM categories WHERE restaurant_id = ? ORDER BY sort_order, name', args: [restaurantId] });
  return result.rows as unknown as Category[];
}

export async function updateCategory(id: string, updates: Partial<Pick<Category, 'name' | 'sort_order'>>): Promise<Category | null> {
  const db = await getDatabase();
  
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }

  if (fields.length === 0) return null;

  values.push(id);
  await db.execute({ sql: `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, args: values });
  
  const result = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [id] });
  return (result.rows[0] as unknown as Category) || null;
}

export async function deleteCategory(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [id] });
  return result.rowsAffected > 0;
}

// Menu item queries
export interface MenuItem {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  sort_order: number;
  created_at: string;
}

export async function createMenuItem(
  restaurantId: string,
  categoryId: string,
  name: string,
  price: number,
  image?: string,
  sortOrder?: number,
  description?: string
): Promise<MenuItem> {
  const db = await getDatabase();
  const id = randomUUID();
  await db.execute({
    sql: `
      INSERT INTO menu_items (id, restaurant_id, category_id, name, price, image, sort_order, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [id, restaurantId, categoryId, name, price, image || null, sortOrder || 0, description || null]
  });
  return (await getMenuItemById(id))!;
}

export async function getMenuItemById(id: string): Promise<MenuItem | null> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM menu_items WHERE id = ?', args: [id] });
  return (result.rows[0] as unknown as MenuItem) || null;
}

export async function getMenuItemsByRestaurant(restaurantId: string): Promise<MenuItem[]> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM menu_items WHERE restaurant_id = ? ORDER BY sort_order, name', args: [restaurantId] });
  return result.rows as unknown as MenuItem[];
}

export async function getMenuItemsByCategory(categoryId: string): Promise<MenuItem[]> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM menu_items WHERE category_id = ? ORDER BY sort_order, name', args: [categoryId] });
  return result.rows as unknown as MenuItem[];
}

export async function updateMenuItem(
  id: string,
  updates: Partial<Pick<MenuItem, 'name' | 'price' | 'image' | 'category_id' | 'sort_order' | 'description'>>
): Promise<MenuItem | null> {
  const db = await getDatabase();
  const existing = await getMenuItemById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.price !== undefined) { fields.push('price = ?'); values.push(updates.price); }
  if (updates.image !== undefined) { fields.push('image = ?'); values.push(updates.image); }
  if (updates.category_id !== undefined) { fields.push('category_id = ?'); values.push(updates.category_id); }
  if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }

  if (fields.length === 0) return existing;

  values.push(id);
  await db.execute({ sql: `UPDATE menu_items SET ${fields.join(', ')} WHERE id = ?`, args: values });
  return await getMenuItemById(id);
}

export async function deleteMenuItem(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'DELETE FROM menu_items WHERE id = ?', args: [id] });
  return result.rowsAffected > 0;
}

// Session queries
export interface Session {
  id: string;
  restaurant_id: string;
  expires_at: string;
  created_at: string;
}

export async function createSession(restaurantId: string, durationHours: number): Promise<string> {
  const db = await getDatabase();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString();
  
  await db.execute({
    sql: `
      INSERT INTO sessions (id, restaurant_id, expires_at)
      VALUES (?, ?, ?)
    `,
    args: [sessionId, restaurantId, expiresAt]
  });
  
  return sessionId;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const db = await getDatabase();
  const result = await db.execute({ sql: 'SELECT * FROM sessions WHERE id = ?', args: [sessionId] });
  const session = result.rows[0] as unknown as Session;
  
  if (!session) return null;
  
  // Check if expired
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await deleteSession(sessionId);
    return null;
  }
  
  return session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDatabase();
  await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
}

export async function updateRestaurantPassword(restaurantId: string, newHashedPassword: string): Promise<void> {
  const db = await getDatabase();
  await db.execute({ sql: 'UPDATE restaurants SET dashboard_password = ? WHERE id = ?', args: [newHashedPassword, restaurantId] });
}
