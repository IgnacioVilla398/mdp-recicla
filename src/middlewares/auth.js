/**
 * Autenticacion por JWT (header Authorization: Bearer <token> o cookie mdp_token)
 * y control de acceso por rol.
 */
import { verifyToken } from '../utils/jwt.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { get } from '../db/index.js';

export const TOKEN_COOKIE = 'mdp_token';

export function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

export function extractToken(req) {
  const header = req.headers.authorization ?? '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookies = parseCookies(req.headers.cookie);
  return cookies[TOKEN_COOKIE] ?? null;
}

/** Carga el usuario desde el token y lo deja en req.user. */
export const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Falta el token de acceso');

  const payload = verifyToken(token);
  if (!payload?.sub) throw ApiError.unauthorized('Token invalido o expirado');

  const user = get(
    `SELECT u.id, u.name, u.email, u.phone, u.address, u.role, u.status,
            u.neighborhood_id, n.name AS neighborhood, n.weekday AS collection_weekday,
            u.payout_method, u.payout_value, u.payout_holder
       FROM users u
       LEFT JOIN neighborhoods n ON n.id = u.neighborhood_id
      WHERE u.id = ?`,
    [payload.sub]
  );
  if (!user) throw ApiError.unauthorized('Usuario inexistente');
  if (user.status !== 'active') throw ApiError.forbidden('La cuenta esta deshabilitada');

  req.user = user;
  next();
});

/** Igual que authenticate pero sin bloquear si no hay token. */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  const payload = verifyToken(token);
  if (!payload?.sub) return next();
  const user = get('SELECT id, name, email, role, status FROM users WHERE id = ?', [payload.sub]);
  if (user && user.status === 'active') req.user = user;
  return next();
});

/** Restringe el acceso a determinados roles. */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden(`Requiere rol: ${roles.join(' o ')}`));
  return next();
};

/** Roles utiles. */
export const adminOnly = requireRole('admin');
export const clientOnly = requireRole('client');
