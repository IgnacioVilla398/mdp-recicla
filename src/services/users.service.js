/** Consultas de usuarios/vecinos para el panel de administracion. */
import { all, get, run } from '../db/index.js';
import { ApiError } from '../utils/http.js';
import { clean } from '../utils/validate.js';
import { findUserById, serializeUser, register as registerClient } from './auth.service.js';

/** Lista vecinos con filtros: busqueda, barrio y dia de recorrido. */
export function listClients({ search, neighborhoodId, weekday, status, page = 1, limit = 50 } = {}) {
  const where = ["u.role = 'client'"];
  const params = [];

  if (clean(search)) {
    where.push('(u.name LIKE ? COLLATE NOCASE OR u.email LIKE ? COLLATE NOCASE OR u.address LIKE ? COLLATE NOCASE)');
    const like = `%${clean(search)}%`;
    params.push(like, like, like);
  }
  if (neighborhoodId) {
    where.push('u.neighborhood_id = ?');
    params.push(Number(neighborhoodId));
  }
  if (weekday) {
    where.push('n.weekday = ?');
    params.push(Number(weekday));
  }
  if (clean(status)) {
    where.push('u.status = ?');
    params.push(clean(status));
  }

  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  const rows = all(
    `SELECT u.id, u.name, u.email, u.phone, u.address, u.status,
            n.id AS neighborhood_id, n.name AS neighborhood, n.weekday AS collection_weekday,
            COALESCE(v.total_kg, 0)           AS total_kg,
            COALESCE(v.available_balance, 0)  AS available_balance,
            (SELECT MAX(c.collected_on) FROM collections c WHERE c.user_id = u.id) AS last_collection_on
       FROM users u
       LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
       LEFT JOIN v_user_totals  v ON v.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY u.name COLLATE NOCASE
      LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  const total = get(
    `SELECT COUNT(*) AS c
       FROM users u LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
      WHERE ${where.join(' AND ')}`,
    params
  ).c;

  return { items: rows, total, page: Number(page), limit: Number(limit) };
}

export function getClient(id) {
  const user = findUserById(Number(id));
  if (!user) throw ApiError.notFound('Vecino inexistente');
  return serializeUser(user);
}

/** Alta de vecino desde el panel admin (sin autoregistro). */
export function createClient({ name, email, password, phone, address, neighborhoodId }) {
  const { user } = registerClient({ name, email, password, phone, address, neighborhoodId });
  return user;
}

/** Cambia el estado de la cuenta (active | paused | inactive). */
export function setStatus(id, status) {
  if (!['active', 'paused', 'inactive'].includes(status)) {
    throw ApiError.badRequest('Estado invalido', { status: 'Use active, paused o inactive' });
  }
  const user = get('SELECT id FROM users WHERE id = ?', [Number(id)]);
  if (!user) throw ApiError.notFound('Usuario inexistente');
  run('UPDATE users SET status = ? WHERE id = ?', [status, user.id]);
  return serializeUser(findUserById(user.id));
}

/** Actualiza datos editables por el admin. */
export function updateClient(id, { name, phone, address, neighborhoodId, notes }) {
  const user = get('SELECT * FROM users WHERE id = ?', [Number(id)]);
  if (!user) throw ApiError.notFound('Vecino inexistente');

  let neighborhood = user.neighborhood_id;
  if (neighborhoodId !== undefined && neighborhoodId !== null && neighborhoodId !== '') {
    const found = get('SELECT id FROM neighborhoods WHERE id = ?', [Number(neighborhoodId)]);
    if (!found) throw ApiError.badRequest('Barrio inexistente', { neighborhood_id: 'No existe' });
    neighborhood = found.id;
  } else if (neighborhoodId === null || neighborhoodId === '') {
    neighborhood = null;
  }

  run(
    `UPDATE users SET name = ?, phone = ?, address = ?, neighborhood_id = ?, notes = ? WHERE id = ?`,
    [
      clean(name) ?? user.name,
      phone !== undefined ? clean(phone) : user.phone,
      address !== undefined ? clean(address) : user.address,
      neighborhood,
      notes !== undefined ? clean(notes) : user.notes,
      user.id,
    ]
  );
  return serializeUser(findUserById(user.id));
}

/** Ruta del dia: vecinos agrupados por barrio segun el dia de recoleccion. */
export function dailyRoute({ weekday, date } = {}) {
  const day = Number(weekday);
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    throw ApiError.badRequest('Dia invalido', { weekday: 'Debe ser un numero del 1 (lunes) al 7 (domingo)' });
  }

  const neighborhoodRows = all(
    `SELECT n.id, n.name, n.zone, n.weekday,
            COUNT(u.id) AS clients
       FROM neighborhoods n
       LEFT JOIN users u ON u.neighborhood_id = n.id AND u.role = 'client' AND u.status = 'active'
      WHERE n.weekday = ? AND n.is_active = 1
      GROUP BY n.id
      ORDER BY n.zone, n.name`,
    [day]
  );

  const clients = all(
    `SELECT u.id, u.name, u.email, u.phone, u.address,
            n.id AS neighborhood_id, n.name AS neighborhood, n.zone,
            COALESCE(v.total_kg, 0)          AS total_kg,
            COALESCE(v.available_balance, 0) AS available_balance,
            (SELECT MAX(c.collected_on) FROM collections c WHERE c.user_id = u.id) AS last_collection_on,
            (SELECT COUNT(*) FROM bag_deliveries b
              WHERE b.user_id = u.id AND b.delivered_on >= date('now', '-30 day'))  AS bags_last_30d
       FROM users u
       JOIN neighborhoods n ON n.id = u.neighborhood_id
       LEFT JOIN v_user_totals v ON v.user_id = u.id
      WHERE u.role = 'client' AND u.status = 'active' AND n.weekday = ?
      ORDER BY n.name, u.name COLLATE NOCASE`,
    [day]
  );

  return {
    weekday: day,
    date: date ?? null,
    neighborhoods: neighborhoodRows,
    clients,
    totals: {
      neighborhoods: neighborhoodRows.length,
      clients: clients.length,
      pending_pickup: clients.filter((c) => !c.last_collection_on || c.last_collection_on < (date ?? new Date().toISOString().slice(0, 10))).length,
    },
  };
}

export default { listClients, getClient, createClient, setStatus, updateClient, dailyRoute };
