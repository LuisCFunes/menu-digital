import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getDatabase, closeDatabase } from '../../src/db/schema';
import {
  createRestaurant,
  getRestaurantById,
  getRestaurantBySlug,
  getSingleRestaurant,
  updateRestaurant,
  createCategory,
  getCategoriesByRestaurant,
  deleteCategory,
  createMenuItem,
  getMenuItemById,
  getMenuItemsByRestaurant,
  getMenuItemsByCategory,
  updateMenuItem,
  deleteMenuItem,
} from '../../src/db/queries';

beforeAll(async () => {
  await getDatabase();
});

afterAll(() => {
  closeDatabase();
});

beforeEach(async () => {
  const db = await getDatabase();
  await db.execute('DELETE FROM menu_items');
  await db.execute('DELETE FROM categories');
  await db.execute('DELETE FROM restaurants');
});

describe('Restaurant CRUD', () => {
  it('should create a restaurant', async () => {
    const restaurant = await createRestaurant('test-slug', 'Test Restaurant', 'testpass123');
    expect(restaurant).toBeDefined();
    expect(restaurant.id).toBeDefined();
    expect(restaurant.slug).toBe('test-slug');
    expect(restaurant.name).toBe('Test Restaurant');
    expect(restaurant.dashboard_password).toBe('testpass123');
  });

  it('should get restaurant by id', async () => {
    const restaurant = await createRestaurant('test-slug', 'Test Restaurant', 'testpass123');
    const found = await getRestaurantById(restaurant.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(restaurant.id);
  });

  it('should get restaurant by slug', async () => {
    await createRestaurant('test-slug', 'Test Restaurant', 'testpass123');
    const found = await getRestaurantBySlug('test-slug');
    expect(found).toBeDefined();
    expect(found!.slug).toBe('test-slug');
  });

  it('should get single restaurant', async () => {
    await createRestaurant('test-slug', 'Test Restaurant', 'testpass123');
    const found = await getSingleRestaurant();
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test Restaurant');
  });

  it('should update restaurant', async () => {
    const restaurant = await createRestaurant('test-slug', 'Test Restaurant', 'testpass123');
    const updated = await updateRestaurant(restaurant.id, { name: 'Updated Name' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated Name');
  });
});

describe('Category CRUD', () => {
  it('should create a category', async () => {
    const restaurant = await createRestaurant('cat-test', 'Cat Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Main Course');
    expect(category).toBeDefined();
    expect(category.id).toBeDefined();
    expect(category.name).toBe('Main Course');
  });

  it('should get categories by restaurant', async () => {
    const restaurant = await createRestaurant('cat-test', 'Cat Test', 'testpass123');
    await createCategory(restaurant.id, 'Main Course');
    const categories = await getCategoriesByRestaurant(restaurant.id);
    expect(categories.length).toBe(1);
  });

  it('should delete category', async () => {
    const restaurant = await createRestaurant('cat-test', 'Cat Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Main Course');
    const deleted = await deleteCategory(category.id);
    expect(deleted).toBe(true);
  });
});

describe('MenuItem CRUD', () => {
  it('should create a menu item', async () => {
    const restaurant = await createRestaurant('menu-test', 'Menu Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Bebidas');
    const item = await createMenuItem(restaurant.id, category.id, 'Coca Cola', 35);
    expect(item).toBeDefined();
    expect(item.id).toBeDefined();
    expect(item.name).toBe('Coca Cola');
    expect(item.price).toBe(35);
  });

  it('should get menu items by restaurant', async () => {
    const restaurant = await createRestaurant('menu-test', 'Menu Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Bebidas');
    await createMenuItem(restaurant.id, category.id, 'Coca Cola', 35);
    const items = await getMenuItemsByRestaurant(restaurant.id);
    expect(items.length).toBe(1);
  });

  it('should get menu items by category', async () => {
    const restaurant = await createRestaurant('menu-test', 'Menu Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Bebidas');
    await createMenuItem(restaurant.id, category.id, 'Coca Cola', 35);
    const items = await getMenuItemsByCategory(category.id);
    expect(items.length).toBe(1);
  });

  it('should update menu item', async () => {
    const restaurant = await createRestaurant('menu-test', 'Menu Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Bebidas');
    const item = await createMenuItem(restaurant.id, category.id, 'Coca Cola', 35);
    const updated = await updateMenuItem(item.id, { price: 40 });
    expect(updated).toBeDefined();
    expect(updated!.price).toBe(40);
  });

  it('should delete menu item', async () => {
    const restaurant = await createRestaurant('menu-test', 'Menu Test', 'testpass123');
    const category = await createCategory(restaurant.id, 'Bebidas');
    const item = await createMenuItem(restaurant.id, category.id, 'Coca Cola', 35);
    const deleted = await deleteMenuItem(item.id);
    expect(deleted).toBe(true);
  });
});
