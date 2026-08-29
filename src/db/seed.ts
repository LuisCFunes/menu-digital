import { closeDatabase } from './schema';
import { createRestaurant, createCategory, createMenuItem } from './queries';
import { hashPassword } from '../lib/password';

async function seed() {
  console.log('Seeding database...');

  // Create single restaurant (Costillal) with dashboard password
  const hashedPassword = await hashPassword('costillal123');
  const restaurant = await createRestaurant(
    'costillal',
    'El Costillal Grill',
    hashedPassword,
    '/logo costilla grill.png',
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
  await createMenuItem(restaurant.id, mainCategory.id, 'Costillas BBQ', 285, '/images/costillas.jpg', 1);
  await createMenuItem(restaurant.id, mainCategory.id, 'Chuleta de Cerdo', 195, '/images/chuleta.jpg', 2);
  await createMenuItem(restaurant.id, mainCategory.id, 'Pollo Asado', 165, '/images/pollo.jpg', 3);
  await createMenuItem(restaurant.id, mainCategory.id, 'Carne Asada', 245, '/images/carne.jpg', 4);
  await createMenuItem(restaurant.id, mainCategory.id, 'Retazo de Cerdo', 155, '/images/retazo.jpg', 5);
  await createMenuItem(restaurant.id, mainCategory.id, 'Lonja de Cerdo', 175, '/images/lonja.jpg', 6);
  await createMenuItem(restaurant.id, mainCategory.id, 'Tres Derechos', 265, '/images/tres.jpg', 7);
  await createMenuItem(restaurant.id, mainCategory.id, 'Mixto Grill', 325, '/images/mixto.jpg', 8);

  await createMenuItem(restaurant.id, dessertCategory.id, 'Tres Leches', 65, '/images/tresleches.jpg', 1);
  await createMenuItem(restaurant.id, dessertCategory.id, 'Banana Split', 75, '/images/banana.jpg', 2);

  await createMenuItem(restaurant.id, drinkCategory.id, 'Coca Cola', 35, '/images/coca.jpg', 1);
  await createMenuItem(restaurant.id, drinkCategory.id, 'Agua Natural', 20, '/images/agua.jpg', 2);
  await createMenuItem(restaurant.id, drinkCategory.id, 'Horchata', 30, '/images/horchata.jpg', 3);

  console.log('Created menu items');
  console.log('Seed completed!');

  closeDatabase();
}

seed();
