/**
 * Pesajes (collections): carga rapida desde el celular, historial y resumenes.
 * Es el nucleo del negocio: cada pesaje valoriza kilos con el precio vigente.
 */
import { all, get, run, transaction } from '../db/index.js';
import { ApiError } from '../utils/http.js';
import { clean, currentMonth, isDateOnly, isMonth, round2, round3, today, toPositiveNumber, WEEKDAY_NAMES } from '../utils/validate.js';
import { getMaterial, priceAt } from './materials.service.js';

const SELECT_BASE = `
  SELECT c.id, c.user_id, c.material_id, c.weight_kg, c.price_per_kg_applied, c.total_price,
         c.collected_on, c.collected_at, c.route_date, c.notes, c.created_at,
         m.name AS material_name, m.category AS material_category, m.unit,
         u.name AS user_name, u.email AS user_email,
         r.name AS recorded_by_name
    FROM collections c
    JOIN materials m ON m.id = c.material_id
    JOIN users     u ON u.id = c.user_id
    LEFT JOIN users r ON r.id = c.recorded_by`;

/**
 * Registra un pesaje y calcula el monto con el precio vigente en la fecha.
 * @param {object} input { userId, materialId, weightKg, collectedOn?, routeDate?, notes? }
 * @param {number} adminId admin que carga el pesaje
 */
export function createCollection({ userId, materialId, weightKg, collectedOn, routeDate, notes }, adminId) {
  const client = get("SELECT id, name, role, status FROM users WHERE id = ?", [Number(userId)]);
  if (!client) throw ApiError.badRequest('Vecino inexistente', { user_id: 'No existe' });
  if (client.role !== 'client') throw ApiError.badRequest('El usuario no es un vecino', { user_id: 'Debe tener rol client' });

  const material = getMaterial(materialId);
  if (!material.is_active) throw ApiError.badRequest('Material inactivo', { material_id: 'El material esta dado de baja' });

  const weight = toPositiveNumber(weightKg);
  if (!Number.isFinite(weight)) throw ApiError.badRequest('Peso invalido', { weight_kg: 'Debe ser un numero mayor a 0' });
  if (weight > 5000) throw ApiError.badRequest('Peso fuera de rango', { weight_kg: 'Maximo 5000 kg por carga' });

  let date = clean(collectedOn) ?? today();
  if (!isDateOnly(date)) throw ApiError.badRequest('Fecha invalida', { collected_on: 'Formato esperado YYYY-MM-DD' });
  if (date > today()) throw ApiError.badRequest('Fecha futura', { collected_on: 'No se pueden cargar pesajes con fecha futura' });

  const appliedPrice = round2(priceAt(material.id, date));
  const weightRounded = round3(weight);
  const total = round2(weightRounded * appliedPrice);

  const result = run(
    `INSERT INTO collections
       (user_id, material_id, weight_kg, price_per_kg_applied, total_price, collected_at, collected_on, route_date, recorded_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client.id,
      material.id,
      weightRounded,
      appliedPrice,
      total,
      `${date}T${new Date().toISOString().slice(11)}`,
      date,
      clean(routeDate) ?? date,
      adminId ?? null,
      clean(notes),
    ]
  );

  return getCollection(result.lastInsertRowid);
}

/** Devuelve un pesaje con sus datos relacionados. */
export function getCollection(id) {
  const row = get(`${SELECT_BASE} WHERE c.id = ?`, [Number(id)]);
  if (!row) throw ApiError.notFound('Pesaje inexistente');
  return row;
}

/**
 * Lista pesajes con filtros.
 * @param {object} filters { userId, materialId, neighborhoodId, from, to, month, limit, offset, order }
 */
export function listCollections({ userId, materialId, neighborhoodId, from, to, month, limit = 100, offset = 0, order = 'desc' } = {}) {
  const where = [];
  const params = [];

  if (userId) { where.push('c.user_id = ?'); params.push(Number(userId)); }
  if (materialId) { where.push('c.material_id = ?'); params.push(Number(materialId)); }
  if (neighborhoodId) { where.push('u.neighborhood_id = ?'); params.push(Number(neighborhoodId)); }
  if (from) { where.push('c.collected_on >= ?'); params.push(from); }
  if (to) { where.push('c.collected_on <= ?'); params.push(to); }
  if (month) {
    if (!isMonth(month)) throw ApiError.badRequest('Mes invalido', { month: 'Formato YYYY-MM' });
    where.push("substr(c.collected_on, 1, 7) = ?");
    params.push(month);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const direction = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  const items = all(
    `${SELECT_BASE} ${clause} ORDER BY c.collected_on ${direction}, c.id ${direction} LIMIT ? OFFSET ?`,
    [...params, safeLimit, Math.max(Number(offset) || 0, 0)]
  );

  const total = get(
    `SELECT COUNT(*) AS c, COALESCE(SUM(c.weight_kg), 0) AS kg, COALESCE(SUM(c.total_price), 0) AS amount
       FROM collections c JOIN users u ON u.id = c.user_id ${clause}`,
    params
  );

  return { items, total: total.c, total_kg: round3(total.kg), total_amount: round2(total.amount), limit: safeLimit, offset: Number(offset) || 0 };
}

/** Elimina un pesaje mal cargado (solo admin). */
export function deleteCollection(id) {
  const row = get('SELECT id FROM collections WHERE id = ?', [Number(id)]);
  if (!row) throw ApiError.notFound('Pesaje inexistente');
  run('DELETE FROM collections WHERE id = ?', [row.id]);
  return { deleted: true, id: row.id };
}

/** Corrige kilos o material de un pesaje ya cargado, recalculando el monto. */
export function updateCollection(id, { weightKg, materialId, collectedOn, notes }) {
  const current = get('SELECT * FROM collections WHERE id = ?', [Number(id)]);
  if (!current) throw ApiError.notFound('Pesaje inexistente');

  const material = materialId === undefined ? getMaterial(current.material_id) : getMaterial(materialId);
  const date = clean(collectedOn) ?? current.collected_on;
  if (!isDateOnly(date)) throw ApiError.badRequest('Fecha invalida', { collected_on: 'Formato YYYY-MM-DD' });

  const weight = weightKg === undefined ? current.weight_kg : toPositiveNumber(weightKg);
  if (!Number.isFinite(weight)) throw ApiError.badRequest('Peso invalido', { weight_kg: 'Debe ser un numero mayor a 0' });

  const appliedPrice = round2(priceAt(material.id, date));
  const total = round2(round3(weight) * appliedPrice);

  run(
    `UPDATE collections
        SET material_id = ?, weight_kg = ?, price_per_kg_applied = ?, total_price = ?,
            collected_on = ?, notes = ?
      WHERE id = ?`,
    [material.id, round3(weight), appliedPrice, total, date, notes !== undefined ? clean(notes) : current.notes, current.id]
  );

  return getCollection(current.id);
}

/**
 * Resumen del vecino: saldo, kilos del mes, historial y cronograma.
 * @param {number} userId
 * @param {string} [month] YYYY-MM (por defecto, mes en curso)
 */
export function clientSummary(userId, month = currentMonth()) {
  const user = get(
    `SELECT u.id, u.name, u.email, u.address, u.phone,
            n.id AS neighborhood_id, n.name AS neighborhood, n.weekday AS collection_weekday, n.zone
       FROM users u LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
      WHERE u.id = ?`,
    [Number(userId)]
  );
  if (!user) throw ApiError.notFound('Vecino inexistente');

  const totals = get('SELECT * FROM v_user_totals WHERE user_id = ?', [user.id]) ?? {
    total_kg: 0, total_earned: 0, total_paid: 0, available_balance: 0, pending_balance: 0,
  };

  const monthly = get(
    `SELECT month_kg, month_earned, deliveries FROM v_user_current_month
      WHERE user_id = ? AND period_month = ?`,
    [user.id, month]
  ) ?? { month_kg: 0, month_earned: 0, deliveries: 0 };

  const byMaterial = all('SELECT * FROM v_user_by_material WHERE user_id = ? ORDER BY total_price DESC', [user.id]);
  const history = all(`${SELECT_BASE} WHERE c.user_id = ? ORDER BY c.collected_on DESC, c.id DESC LIMIT 50`, [user.id]);
  const payouts = all(
    `SELECT id, amount, status, period_month, payout_method, requested_at, paid_at
       FROM payouts WHERE user_id = ? ORDER BY requested_at DESC LIMIT 20`,
    [user.id]
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      address: user.address,
      phone: user.phone,
      neighborhood: user.neighborhood,
      neighborhood_id: user.neighborhood_id,
      zone: user.zone,
      collection_weekday: user.collection_weekday,
      collection_day_name: user.collection_weekday ? WEEKDAY_NAMES[user.collection_weekday] : null,
    },
    period_month: month,
    month: { kg: round3(monthly.month_kg), amount: round2(monthly.month_earned), deliveries: monthly.deliveries },
    totals: {
      total_kg: round3(totals.total_kg),
      total_earned: round2(totals.total_earned),
      total_paid: round2(totals.total_paid),
      pending_balance: round2(totals.pending_balance),
      available_balance: round2(totals.available_balance),
    },
    by_material: byMaterial.map((row) => ({ ...row, total_kg: round3(row.total_kg), total_price: round2(row.total_price) })),
    history,
    payouts,
  };
}

/** Metricas globales para el encabezado del panel admin. */
export function adminOverview() {
  const global = get(
    `SELECT COUNT(*) AS collections,
            COALESCE(SUM(weight_kg), 0)   AS kg,
            COALESCE(SUM(total_price), 0) AS amount
       FROM collections WHERE substr(collected_on, 1, 7) = strftime('%Y-%m', 'now')`
  );
  const clients = get("SELECT COUNT(*) AS c FROM users WHERE role = 'client' AND status = 'active'").c;
  const pendingPayouts = get(
    "SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS amount FROM payouts WHERE status = 'pending'"
  );
  const byMaterial = all(
    `SELECT m.id, m.name, COALESCE(SUM(c.weight_kg), 0) AS kg, COALESCE(SUM(c.total_price), 0) AS amount
       FROM materials m
       LEFT JOIN collections c ON c.material_id = m.id AND substr(c.collected_on, 1, 7) = strftime('%Y-%m', 'now')
      GROUP BY m.id ORDER BY amount DESC`
  );
  const daily = all(
    `SELECT collected_on AS date, COUNT(*) AS deliveries,
            COALESCE(SUM(weight_kg), 0) AS kg, COALESCE(SUM(total_price), 0) AS amount
       FROM collections
      WHERE collected_on >= date('now', '-29 day')
      GROUP BY collected_on ORDER BY collected_on`
  );

  return {
    period_month: currentMonth(),
    active_clients: clients,
    month: { deliveries: global.collections, kg: round3(global.kg), amount: round2(global.amount) },
    pending_payouts: { count: pendingPayouts.c, amount: round2(pendingPayouts.amount) },
    by_material: byMaterial.map((r) => ({ ...r, kg: round3(r.kg), amount: round2(r.amount) })),
    daily: daily.map((r) => ({ ...r, kg: round3(r.kg), amount: round2(r.amount) })),
  };
}

/** Carga varios pesajes de una vez (un vecino, varios materiales). */
export function createBatch(items, adminId) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('Envie al menos un pesaje', { items: 'Requerido' });
  }
  return transaction(() => items.map((item) => createCollection(item, adminId)));
}

export default {
  createCollection, getCollection, listCollections, deleteCollection,
  updateCollection, clientSummary, adminOverview, createBatch,
};
