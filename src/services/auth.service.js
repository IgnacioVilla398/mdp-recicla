/** Registro, login y datos publicos del usuario. */
import { get, run } from '../db/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { ApiError } from '../utils/http.js';
import { clean, isEmail } from '../utils/validate.js';

const PUBLIC_FIELDS = `u.id, u.name, u.email, u.phone, u.address, u.role, u.status,
                       u.neighborhood_id, n.name AS neighborhood, n.weekday AS collection_weekday,
                       u.payout_method, u.payout_value, u.payout_holder, u.created_at`;

export function findUserById(id) {
  return get(
    `SELECT ${PUBLIC_FIELDS}
       FROM users u LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
      WHERE u.id = ?`,
    [id]
  );
}

export function findUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ? COLLATE NOCASE', [email]);
}

export function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    address: user.address ?? null,
    role: user.role,
    status: user.status,
    neighborhood_id: user.neighborhood_id ?? null,
    neighborhood: user.neighborhood ?? null,
    collection_weekday: user.collection_weekday ?? null,
    payout: user.payout_method
      ? { method: user.payout_method, value: user.payout_value, holder: user.payout_holder }
      : null,
    created_at: user.created_at,
  };
}

/** Crea una cuenta de vecino (rol client) y devuelve { user, token }. */
export function register({ name, email, password, phone, address, neighborhoodId }) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!isEmail(normalizedEmail)) throw ApiError.badRequest('Email invalido', { email: 'Formato invalido' });
  if (String(password ?? '').length < 6) {
    throw ApiError.badRequest('Contrasena muy corta', { password: 'Minimo 6 caracteres' });
  }
  if (!clean(name)) throw ApiError.badRequest('El nombre es obligatorio', { name: 'Requerido' });

  if (findUserByEmail(normalizedEmail)) {
    throw ApiError.conflict('Ese email ya esta registrado', { email: 'Ya existe una cuenta con ese email' });
  }

  let neighborhood = null;
  if (neighborhoodId) {
    neighborhood = get('SELECT id, is_active FROM neighborhoods WHERE id = ?', [Number(neighborhoodId)]);
    if (!neighborhood) throw ApiError.badRequest('Barrio inexistente', { neighborhood_id: 'No existe' });
    if (!neighborhood.is_active) throw ApiError.badRequest('Barrio inactivo', { neighborhood_id: 'No recibe recoleccion' });
  }

  const result = run(
    `INSERT INTO users (name, email, password_hash, phone, address, neighborhood_id, role, status)
     VALUES (?, ?, ?, ?, ?, ?, 'client', 'active')`,
    [clean(name), normalizedEmail, hashPassword(password), clean(phone), clean(address), neighborhood?.id ?? null]
  );

  const user = findUserById(result.lastInsertRowid);
  return { user: serializeUser(user), token: issueToken(user) };
}

/** Valida credenciales y devuelve { user, token }. */
export function login({ email, password }) {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  const record = findUserByEmail(normalizedEmail);
  if (!record || !verifyPassword(password, record.password_hash)) {
    throw ApiError.unauthorized('Email o contrasena incorrectos');
  }
  if (record.status !== 'active') throw ApiError.forbidden('La cuenta esta deshabilitada');

  const user = findUserById(record.id);
  return { user: serializeUser(user), token: issueToken(user) };
}

/** Actualiza el perfil del propio usuario. */
export function updateProfile(userId, { name, phone, address, neighborhoodId, payout }) {
  const current = get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!current) throw ApiError.notFound('Usuario inexistente');

  let neighborhood = current.neighborhood_id;
  if (neighborhoodId !== undefined) {
    if (neighborhoodId === null || neighborhoodId === '') {
      neighborhood = null;
    } else {
      const found = get('SELECT id FROM neighborhoods WHERE id = ?', [Number(neighborhoodId)]);
      if (!found) throw ApiError.badRequest('Barrio inexistente', { neighborhood_id: 'No existe' });
      neighborhood = found.id;
    }
  }

  const method = payout?.method !== undefined ? clean(payout.method) : current.payout_method;
  const value = payout?.value !== undefined ? clean(payout.value) : current.payout_value;
  const holder = payout?.holder !== undefined ? clean(payout.holder) : current.payout_holder;
  if (method && !['cbu', 'cvu', 'alias'].includes(method)) {
    throw ApiError.badRequest('Metodo de cobro invalido', { payout_method: 'Use cbu, cvu o alias' });
  }
  if (method && !value) {
    throw ApiError.badRequest('Falta el dato de cobro', { payout_value: 'Ingresa CBU/CVU o alias' });
  }

  run(
    `UPDATE users
        SET name = ?, phone = ?, address = ?, neighborhood_id = ?,
            payout_method = ?, payout_value = ?, payout_holder = ?
      WHERE id = ?`,
    [
      clean(name) ?? current.name,
      phone !== undefined ? clean(phone) : current.phone,
      address !== undefined ? clean(address) : current.address,
      neighborhood,
      method,
      value,
      holder,
      userId,
    ]
  );

  return serializeUser(findUserById(userId));
}

export function changePassword(userId, { currentPassword, newPassword }) {
  if (String(newPassword ?? '').length < 6) {
    throw ApiError.badRequest('Contrasena muy corta', { new_password: 'Minimo 6 caracteres' });
  }
  const record = get('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!record) throw ApiError.notFound('Usuario inexistente');
  if (!verifyPassword(currentPassword, record.password_hash)) {
    throw ApiError.badRequest('Contrasena actual incorrecta', { current_password: 'No coincide' });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), userId]);
  return { updated: true };
}

/** Genera el JWT del usuario. */
export function issueToken(user) {
  return signToken({ sub: user.id, role: user.role, email: user.email });
}

export default { register, login, updateProfile, changePassword, findUserById, findUserByEmail, serializeUser, issueToken };
