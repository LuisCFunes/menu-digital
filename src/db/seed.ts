import fs from 'fs';
import path from 'path';

if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}
import { closeDatabase } from './schema';
import { createRestaurant, createCategory, createMenuItem } from './queries';
import { hashPassword } from '../lib/password';

async function seed() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    console.error('Set ADMIN_PASSWORD (at least 8 characters) in .env before seeding.');
    process.exit(1);
  }

  const url = process.env.TURSO_DATABASE_URL || '';
  if (url.startsWith('libsql://') && !process.argv.includes('--force')) {
    console.error('Refusing to seed a remote Turso database. Pass --force to override.');
    process.exit(1);
  }

  const dbPath = path.join(process.cwd(), 'src', 'data', 'database.sqlite');
  console.log(`Seeding database at ${url || `file:${dbPath}`}...`);

  const hashedPassword = await hashPassword(password);
  const restaurant = await createRestaurant(
    'costillal',
    'El Costillal Grill',
    hashedPassword,
    '/logo-costilla-grill.png',
    undefined,
    '#dc2626',
    '#030712'
  );
  console.log('Created restaurant:', restaurant.name);

  // Create categories
  const mainCategory = await createCategory(restaurant.id, 'Platos Principales', 1);
  const dessertCategory = await createCategory(restaurant.id, 'Postres', 2);
  const drinkCategory = await createCategory(restaurant.id, 'Bebidas', 3);
  console.log('Created categories');

  // Create menu items
  await createMenuItem(restaurant.id, mainCategory.id, 'Costillas BBQ', 285, 'https://images.unsplash.com/photo-1544025162-811114b986cc?w=600&q=80', 1);
  await createMenuItem(restaurant.id, mainCategory.id, 'Chuleta de Cerdo', 195, 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?w=600&q=80', 2);
  await createMenuItem(restaurant.id, mainCategory.id, 'Pollo Asado', 165, 'https://images.unsplash.com/photo-1598514982205-f36b96d1e8d4?w=600&q=80', 3);
  await createMenuItem(restaurant.id, mainCategory.id, 'Carne Asada', 245, 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&q=80', 4);
  await createMenuItem(restaurant.id, mainCategory.id, 'Retazo de Cerdo', 155, 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=600&q=80', 5);
  await createMenuItem(restaurant.id, mainCategory.id, 'Lonja de Cerdo', 175, 'https://images.unsplash.com/photo-1514326640560-7d063ef2aed5?w=600&q=80', 6);
  await createMenuItem(restaurant.id, mainCategory.id, 'Tres Derechos', 265, 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=600&q=80', 7);
  await createMenuItem(restaurant.id, mainCategory.id, 'Mixto Grill', 325, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&q=80', 8);

  await createMenuItem(restaurant.id, dessertCategory.id, 'Tres Leches', 65, 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=600&q=80', 1);
  await createMenuItem(restaurant.id, dessertCategory.id, 'Banana Split', 75, 'https://images.unsplash.com/photo-1563805042-7684c8a9e9ce?w=600&q=80', 2);

  await createMenuItem(restaurant.id, drinkCategory.id, 'Coca Cola', 35, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&q=80', 1);
  await createMenuItem(restaurant.id, drinkCategory.id, 'Agua Natural', 20, 'https://images.unsplash.com/photo-1548839140-29a749e1bc4c?w=600&q=80', 2);
  await createMenuItem(restaurant.id, drinkCategory.id, 'Horchata', 30, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80', 3);

  console.log('Created menu items');
  console.log('Seed completed!');

  closeDatabase();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
