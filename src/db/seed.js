/**
 * Datos de prueba para desarrollo.
 * Usar:  npm run db:seed         (solo si la base esta vacia)
 *        npm run db:seed -- --force  (borra los datos del MVP y recarga)
 *
 * Usuarios demo:
 *   admin@mdprecicla.com  / admin123     (rol admin)
 *   vecino1@example.com   / vecino123    (rol client)  ... vecino4
 */
import { getDb, applySchema, all, get, run } from './index.js';
import { hashPassword } from '../utils/password.js';
import config from '../config/env.js';
import { isMain } from '../utils/cli.js';

const NEIGHBORHOODS = [
  { name: 'Centro',            slug: 'centro',            weekday: 1, zone: 'Centro' },
  { name: 'Los Troncos',       slug: 'los-troncos',       weekday: 2, zone: 'Norte'  },
  { name: 'Playa Grande',      slug: 'playa-grande',      weekday: 2, zone: 'Norte'  },
  { name: 'Nueva Pompeya',     slug: 'nueva-pompeya',     weekday: 3, zone: 'Sur'    },
  { name: 'Constitucion',      slug: 'constitucion',      weekday: 4, zone: 'Centro' },
  { name: 'Villa Mitre',       slug: 'villa-mitre',       weekday: 4, zone: 'Sur'    },
  { name: 'San Jose',          slug: 'san-jose',          weekday: 5, zone: 'Sur'    },
  { name: 'Parque Luro',       slug: 'parque-luro',       weekday: 5, zone: 'Norte'  },
  { name: 'Punta Mogotes',     slug: 'punta-mogotes',     weekday: 6, zone: 'Sur'    },
  { name: 'Camet',             slug: 'camet',             weekday: 6, zone: 'Norte'  },
];

// Precios orientativos de referencia (ARS por kg) - ajustables desde el panel admin.
const MATERIALS = [
  { name: 'Lata de aluminio', category: 'Metal',    price_per_kg: 2500 },
  { name: 'Cobre',            category: 'Metal',    price_per_kg: 9500 },
  { name: 'Bronce',           category: 'Metal',    price_per_kg: 6200 },
  { name: 'Chatarra de hierro', category: 'Metal',  price_per_kg: 320 },
  { name: 'Plastico PET',     category: 'Plastico', price_per_kg: 750 },
  { name: 'Plastico duro',    category: 'Plastico', price_per_kg: 500 },
  { name: 'Papel blanco',     category: 'Papel',    price_per_kg: 420 },
  { name: 'Carton',           category: 'Papel',    price_per_kg: 260 },
  { name: 'Vidrio',           category: 'Vidrio',   price_per_kg: 120 },
];

const CLIENTS = [
  { name: 'Sofia Martinez',   email: 'vecino1@example.com', phone: '+54 223 555-0001', address: 'Belgrano 2345',  neighborhood: 'centro' },
  { name: 'Diego Fernandez',  email: 'vecino2@example.com', phone: '+54 223 555-0002', address: 'Alem 4567',      neighborhood: 'los-troncos' },
  { name: 'Lucia Perez',      email: 'vecino3@example.com', phone: '+54 223 555-0003', address: 'Roca 1122',      neighborhood: 'nueva-pompeya' },
  { name: 'Martin Gomez',     email: 'vecino4@example.com', phone: '+54 223 555-0004', address: 'Falucho 890',    neighborhood: 'villa-mitre' },
];

/** Devuelve una fecha ISO (YYYY-MM-DD) desplazada N dias hacia atras. */
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function isoTs(dateStr) {
  return `${dateStr}T12:00:00Z`;
}

function countRows(table) {
  return get(`SELECT COUNT(*) AS c FROM ${table}`)?.c ?? 0;
}

function wipe() {
  const db = getDb();
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const table of ['payouts', 'bag_deliveries', 'collections', 'material_price_history', 'materials', 'users', 'neighborhoods']) {
    db.exec(`DELETE FROM ${table};`);
  }
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('payouts','bag_deliveries','collections','material_price_history','materials','users','neighborhoods');");
  db.exec('PRAGMA foreign_keys = ON;');
  console.log('[seed] Datos previos eliminados.');
}

export function seed({ force = false } = {}) {
  applySchema();

  if (countRows('neighborhoods') > 0 || countRows('users') > 0) {
    if (!force) {
      console.log('[seed] La base ya tiene datos. Use "npm run db:seed -- --force" para recargar.');
      return { seeded: false };
    }
    wipe();
  }

  const db = getDb();

  // --- Barrios ---
  const insNeighborhood = db.prepare(
    'INSERT INTO neighborhoods (name, slug, weekday, zone) VALUES (?, ?, ?, ?)'
  );
  for (const n of NEIGHBORHOODS) insNeighborhood.run(n.name, n.slug, n.weekday, n.zone);
  const neighborhoodBySlug = Object.fromEntries(all('SELECT id, slug FROM neighborhoods').map((r) => [r.slug, r.id]));
  console.log(`[seed] ${NEIGHBORHOODS.length} barrios cargados.`);

  // --- Usuarios ---
  const insUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, phone, address, neighborhood_id, role, payout_method, payout_value, payout_holder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insUser.run('Administrador MdP', 'admin@mdprecicla.com', hashPassword('admin123'), '+54 223 400-0000', 'Oficina central', null, 'admin', null, null, null);

  for (const c of CLIENTS) {
    insUser.run(
      c.name, c.email, hashPassword('vecino123'), c.phone, c.address,
      neighborhoodBySlug[c.neighborhood], 'client', 'alias', `${c.name.split(' ')[0].toLowerCase()}.recicla.mp`, c.name
    );
  }
  const admin = get("SELECT id FROM users WHERE role = 'admin'");
  const clients = all("SELECT id, name FROM users WHERE role = 'client' ORDER BY id");
  console.log(`[seed] 1 admin + ${clients.length} vecinos cargados.`);

  // --- Materiales ---
  const insMaterial = db.prepare('INSERT INTO materials (name, category, price_per_kg) VALUES (?, ?, ?)');
  for (const m of MATERIALS) insMaterial.run(m.name, m.category, m.price_per_kg);
  const materials = all('SELECT id, name, price_per_kg FROM materials ORDER BY id');
  // Historial inicial de precios
  const insHistory = db.prepare(
    'INSERT INTO material_price_history (material_id, price_per_kg, valid_from, changed_by, note) VALUES (?, ?, ?, ?, ?)'
  );
  for (const m of materials) {
    insHistory.run(m.id, m.price_per_kg, isoTs(daysAgo(90)), admin.id, 'Precio inicial de carga');
  }
  console.log(`[seed] ${materials.length} materiales cargados.`);

  // --- Pesajes de ejemplo (mes actual + mes anterior) ---
  const insCollection = db.prepare(`
    INSERT INTO collections (user_id, material_id, weight_kg, price_per_kg_applied, total_price, collected_at, collected_on, route_date, recorded_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const sampleWeights = [1.5, 2.25, 3, 0.8, 4.5, 6, 1.2, 2.75, 5, 0.5, 3.4, 1.9];
  let loaded = 0;
  const baseDays = [2, 5, 9, 12, 16, 20];            // dias del mes en curso
  const prevDays = [32, 36, 40, 45, 50, 55];          // mes anterior
  clients.forEach((client, ci) => {
    baseDays.forEach((d, i) => {
      const material = materials[(ci + i) % materials.length];
      const weight = sampleWeights[(ci * 3 + i) % sampleWeights.length];
      const date = daysAgo(d);
      insCollection.run(
        client.id, material.id, weight, material.price_per_kg,
        Math.round(weight * material.price_per_kg * 100) / 100,
        isoTs(date), date, date, admin.id, 'Carga de ejemplo'
      );
      loaded += 1;
    });
    prevDays.slice(0, 3).forEach((d, i) => {
      const material = materials[(ci + i + 1) % materials.length];
      const weight = sampleWeights[(ci + i + 4) % sampleWeights.length];
      const date = daysAgo(d);
      insCollection.run(
        client.id, material.id, weight, material.price_per_kg,
        Math.round(weight * material.price_per_kg * 100) / 100,
        isoTs(date), date, date, admin.id, 'Carga de ejemplo (mes anterior)'
      );
      loaded += 1;
    });
  });
  console.log(`[seed] ${loaded} pesajes cargados.`);

  // --- Entrega de bolsas ---
  const insBag = db.prepare('INSERT INTO bag_deliveries (user_id, quantity, delivered_on, delivered_by, notes) VALUES (?, ?, ?, ?, ?)');
  clients.forEach((client, i) => {
    insBag.run(client.id, 5, daysAgo(10 + i), admin.id, 'Entrega mensual de bolsas');
  });

  // --- Una solicitud de cobro pendiente de ejemplo ---
  const firstClient = clients[0];
  const monthTotal = get(
    `SELECT COALESCE(SUM(total_price), 0) AS total FROM collections
      WHERE user_id = ? AND substr(collected_on, 1, 7) = strftime('%Y-%m', 'now')`,
    [firstClient.id]
  ).total;
  if (monthTotal >= config.minPayoutAmount) {
    run(
      `INSERT INTO payouts (user_id, amount, status, period_month, payout_method, payout_value, payout_holder)
       VALUES (?, ?, 'pending', strftime('%Y-%m', 'now'), 'alias', ?, ?)`,
      [firstClient.id, monthTotal, 'sofia.recicla.mp', firstClient.name]
    );
    console.log(`[seed] Solicitud de cobro pendiente de ${firstClient.name}: $${monthTotal.toFixed(2)}`);
  }

  console.log('\n[seed] Listo. Usuarios demo:');
  console.log('   admin@mdprecicla.com  / admin123');
  console.log('   vecino1@example.com   / vecino123');
  return { seeded: true };
}

if (isMain(import.meta.url)) {
  seed({ force: process.argv.includes('--force') });
}
