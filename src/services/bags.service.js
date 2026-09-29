/**
 * Entrega de bolsas (bag_deliveries).
 * El admin registra las bolsas entregadas en cada visita.
 */
import { all, get, run } from '../db/index.js';
import { ApiError } from '../utils/http.js';
import { clean, isDateOnly, today } from '../utils/validate.js';

const SELECT_BASE = `
  SELECT b.id, b.user_id, b.quantity, b.delivered_on, b.notes, b.created_at,
         u.name AS user_name, u.email AS user_email, u.address,
         n.name AS neighborhood, d.name AS delivered_by_name
    FROM bag_deliveries b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
    LEFT JOIN users d ON d.id = b.delivered_by`;

export function deliverBags({ userId, quantity = 1, deliveredOn, notes }, adminId) {
  const client = get("SELECT id, name FROM users WHERE id = ? AND role = 'client'", [Number(userId)]);
  if (!client) throw ApiError.badRequest('Vecino inexistente', { user_id: 'No existe' });

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty <= 0 || qty > 200) {
    throw ApiError.badRequest('Cantidad invalida', { quantity: 'Debe ser un entero entre 1 y 200' });
  }

  const date = clean(deliveredOn) ?? today();
  if (!isDateOnly(date)) throw ApiError.badRequest('Fecha invalida', { delivered_on: 'Formato YYYY-MM-DD' });
  if (date > today()) throw ApiError.badRequest('Fecha futura', { delivered_on: 'No se pueden registrar entregas futuras' });

  const result = run(
    'INSERT INTO bag_deliveries (user_id, quantity, delivered_on, delivered_by, notes) VALUES (?, ?, ?, ?, ?)',
    [client.id, qty, date, adminId ?? null, clean(notes)]
  );

  return getBagDelivery(result.lastInsertRowid);
}

export function getBagDelivery(id) {
  const row = get(`${SELECT_BASE} WHERE b.id = ?`, [Number(id)]);
  if (!row) throw ApiError.notFound('Entrega inexistente');
  return row;
}

export function listBagDeliveries({ userId, neighborhoodId, from, to, limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push('b.user_id = ?'); params.push(Number(userId)); }
  if (neighborhoodId) { where.push('u.neighborhood_id = ?'); params.push(Number(neighborhoodId)); }
  if (from) { where.push('b.delivered_on >= ?'); params.push(from); }
  if (to) { where.push('b.delivered_on <= ?'); params.push(to); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = all(
    `${SELECT_BASE} ${clause} ORDER BY b.delivered_on DESC, b.id DESC LIMIT ?`,
    [...params, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );

  const totals = get(
    `SELECT COUNT(*) AS deliveries, COALESCE(SUM(b.quantity), 0) AS bags
       FROM bag_deliveries b JOIN users u ON u.id = b.user_id ${clause}`,
    params
  );

  return { items, total: totals.deliveries, total_bags: totals.bags };
}

/** Resumen de bolsas entregadas al vecino (ultimos 30 dias + historico). */
export function bagSummary(userId) {
  const row = get(
    `SELECT COALESCE(SUM(CASE WHEN delivered_on >= date('now', '-30 day') THEN quantity END), 0) AS last_30d,
            COALESCE(SUM(quantity), 0) AS total,
            COUNT(*) AS deliveries,
            MAX(delivered_on) AS last_delivery_on
       FROM bag_deliveries WHERE user_id = ?`,
    [Number(userId)]
  );
  return row ?? { last_30d: 0, total: 0, deliveries: 0, last_delivery_on: null };
}

export default { deliverBags, getBagDelivery, listBagDeliveries, bagSummary };
