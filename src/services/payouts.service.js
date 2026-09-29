/**
 * Solicitudes de cobro (payouts).
 * Flujo: el vecino solicita la liquidacion de su saldo disponible
 *        y el admin la aprueba, la marca como pagada o la rechaza.
 */
import { all, get, run } from '../db/index.js';
import { ApiError } from '../utils/http.js';
import { clean, currentMonth, round2 } from '../utils/validate.js';
import config from '../config/env.js';

const METHODS = ['cbu', 'cvu', 'alias'];
const STATUSES = ['pending', 'approved', 'paid', 'rejected', 'cancelled'];

const SELECT_BASE = `
  SELECT p.id, p.user_id, p.amount, p.status, p.period_month,
         p.payout_method, p.payout_value, p.payout_holder,
         p.requested_at, p.reviewed_at, p.paid_at, p.receipt_url, p.admin_notes,
         u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
         n.name AS neighborhood,
         r.name AS reviewed_by_name, q.name AS paid_by_name
    FROM payouts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
    LEFT JOIN users r ON r.id = p.reviewed_by
    LEFT JOIN users q ON q.id = p.paid_by`;

export function getPayout(id) {
  const row = get(`${SELECT_BASE} WHERE p.id = ?`, [Number(id)]);
  if (!row) throw ApiError.notFound('Solicitud de cobro inexistente');
  return row;
}

/** Saldo disponible del vecino (ya descuenta pagos y solicitudes pendientes). */
export function availableBalance(userId) {
  const row = get('SELECT available_balance FROM v_user_totals WHERE user_id = ?', [Number(userId)]);
  return round2(row?.available_balance ?? 0);
}

function validateMethod(method, value, holder) {
  if (!METHODS.includes(method)) {
    throw ApiError.badRequest('Metodo de cobro invalido', { payout_method: 'Use cbu, cvu o alias' });
  }
  const cleanValue = clean(value);
  if (!cleanValue) throw ApiError.badRequest('Falta el dato de cobro', { payout_value: 'Ingresa CBU/CVU o alias' });
  if (method !== 'alias') {
    const digits = cleanValue.replace(/[\s-]/g, '');
    if (!/^\d{22}$/.test(digits)) {
      throw ApiError.badRequest('CBU/CVU invalido', { payout_value: 'Debe tener 22 digitos' });
    }
  } else if (!/^[a-zA-Z0-9.\-_]{6,20}$/.test(cleanValue)) {
    throw ApiError.badRequest('Alias invalido', { payout_value: 'Entre 6 y 20 caracteres (letras, numeros, punto, guion)' });
  }
  if (!clean(holder)) throw ApiError.badRequest('Falta el titular', { payout_holder: 'Ingresa el titular de la cuenta' });
  return { value: cleanValue, holder: clean(holder) };
}

/**
 * El vecino solicita el cobro de su saldo.
 * @param {number} userId
 * @param {object} input { amount?, method?, value?, holder?, periodMonth? }
 */
export function createPayoutRequest(userId, { amount, method, value, holder, periodMonth } = {}) {
  const user = get("SELECT * FROM users WHERE id = ? AND role = 'client'", [Number(userId)]);
  if (!user) throw ApiError.badRequest('Vecino inexistente', { user_id: 'No existe' });

  const pending = get("SELECT id, amount, requested_at FROM payouts WHERE user_id = ? AND status = 'pending'", [user.id]);
  if (pending) {
    throw ApiError.conflict('Ya tenes una solicitud de cobro pendiente', {
      payout_id: pending.id, amount: pending.amount, requested_at: pending.requested_at,
    });
  }

  const balance = availableBalance(user.id);
  const requested = amount === undefined || amount === null || amount === ''
    ? balance
    : round2(Number(amount));

  if (!Number.isFinite(requested) || requested <= 0) {
    throw ApiError.badRequest('Monto invalido', { amount: 'Debe ser un numero mayor a 0' });
  }
  if (requested > balance) {
    throw ApiError.badRequest('Saldo insuficiente', {
      amount: `Tu saldo disponible es $${balance.toFixed(2)}`,
      available_balance: balance,
    });
  }
  if (requested < config.minPayoutAmount) {
    throw ApiError.badRequest('Monto minimo no alcanzado', {
      amount: `El minimo para solicitar un cobro es $${config.minPayoutAmount}`,
      min_amount: config.minPayoutAmount,
    });
  }

  const chosenMethod = clean(method) ?? user.payout_method;
  const chosenValue = value !== undefined ? value : user.payout_value;
  const chosenHolder = holder !== undefined ? holder : (user.payout_holder ?? user.name);
  if (!chosenMethod) {
    throw ApiError.badRequest('Falta el metodo de cobro', { payout_method: 'Elegi CBU, CVU o alias' });
  }
  const { value: safeValue, holder: safeHolder } = validateMethod(chosenMethod, chosenValue, chosenHolder);

  const period = clean(periodMonth) ?? currentMonth();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw ApiError.badRequest('Periodo invalido', { period_month: 'Formato YYYY-MM' });
  }

  const result = run(
    `INSERT INTO payouts (user_id, amount, status, period_month, payout_method, payout_value, payout_holder)
     VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
    [user.id, requested, period, chosenMethod, safeValue, safeHolder]
  );

  // Guardamos los datos de cobro como predeterminados para la proxima vez
  run('UPDATE users SET payout_method = ?, payout_value = ?, payout_holder = ? WHERE id = ?',
    [chosenMethod, safeValue, safeHolder, user.id]);

  return getPayout(result.lastInsertRowid);
}

/** Lista solicitudes: el vecino ve las propias; el admin filtra por estado. */
export function listPayouts({ userId, status, from, to, limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = [];
  if (userId) { where.push('p.user_id = ?'); params.push(Number(userId)); }
  if (status) {
    if (!STATUSES.includes(status)) throw ApiError.badRequest('Estado invalido', { status: `Use: ${STATUSES.join(', ')}` });
    where.push('p.status = ?');
    params.push(status);
  }
  if (from) { where.push('date(p.requested_at) >= ?'); params.push(from); }
  if (to) { where.push('date(p.requested_at) <= ?'); params.push(to); }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = all(
    `${SELECT_BASE} ${clause} ORDER BY p.requested_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, Math.min(Math.max(Number(limit) || 100, 1), 500), Math.max(Number(offset) || 0, 0)]
  );

  const totals = get(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount END), 0) AS pending_amount,
            COALESCE(SUM(CASE WHEN p.status = 'paid'   THEN p.amount END), 0) AS paid_amount
       FROM payouts p ${clause}`,
    params
  );

  return {
    items,
    total: totals.total,
    pending_amount: round2(totals.pending_amount),
    paid_amount: round2(totals.paid_amount),
  };
}

/** El vecino cancela su propia solicitud pendiente. */
export function cancelPayout(id, userId) {
  const payout = getPayout(id);
  if (payout.user_id !== Number(userId)) throw ApiError.forbidden('Esa solicitud no te pertenece');
  if (payout.status !== 'pending') throw ApiError.badRequest('Solo se pueden cancelar solicitudes pendientes', { status: payout.status });
  run("UPDATE payouts SET status = 'cancelled' WHERE id = ?", [payout.id]);
  return getPayout(payout.id);
}

/**
 * El admin revisa una solicitud.
 * @param {string} action approve | reject | pay
 */
export function reviewPayout(id, { action, adminNotes, receiptUrl }, adminId) {
  const payout = getPayout(id);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (action === 'approve') {
    if (payout.status !== 'pending') throw ApiError.badRequest('Solo se pueden aprobar solicitudes pendientes', { status: payout.status });
    run("UPDATE payouts SET status = 'approved', reviewed_at = ?, reviewed_by = ?, admin_notes = ? WHERE id = ?",
      [now, adminId, clean(adminNotes), payout.id]);
  } else if (action === 'reject') {
    if (!['pending', 'approved'].includes(payout.status)) {
      throw ApiError.badRequest('No se puede rechazar una solicitud en ese estado', { status: payout.status });
    }
    run("UPDATE payouts SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, admin_notes = ? WHERE id = ?",
      [now, adminId, clean(adminNotes), payout.id]);
  } else if (action === 'pay') {
    if (!['pending', 'approved'].includes(payout.status)) {
      throw ApiError.badRequest('No se puede marcar como pagada una solicitud en ese estado', { status: payout.status });
    }
    run("UPDATE payouts SET status = 'paid', paid_at = ?, paid_by = ?, receipt_url = ?, admin_notes = COALESCE(?, admin_notes) WHERE id = ?",
      [now, adminId, clean(receiptUrl), clean(adminNotes), payout.id]);
  } else {
    throw ApiError.badRequest('Accion invalida', { action: 'Use approve, reject o pay' });
  }

  return getPayout(payout.id);
}

/** Panel de cobros del admin: pendientes + historial reciente. */
export function payoutsOverview() {
  const pending = all(`${SELECT_BASE} WHERE p.status IN ('pending', 'approved') ORDER BY p.requested_at ASC`);
  const recent = all(`${SELECT_BASE} WHERE p.status IN ('paid', 'rejected', 'cancelled') ORDER BY p.requested_at DESC LIMIT 20`);
  const totals = get(
    `SELECT COALESCE(SUM(CASE WHEN status IN ('pending','approved') THEN amount END), 0) AS pending_amount,
            COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS paid_amount,
            COUNT(*) AS total
       FROM payouts`
  );
  return {
    pending,
    recent,
    totals: {
      pending_count: pending.length,
      pending_amount: round2(totals.pending_amount),
      paid_amount: round2(totals.paid_amount),
      total_requests: totals.total,
    },
  };
}

export default {
  createPayoutRequest, listPayouts, getPayout, cancelPayout, reviewPayout,
  payoutsOverview, availableBalance,
};
